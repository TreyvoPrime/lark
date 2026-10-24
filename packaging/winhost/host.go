// Package winhost opens Lark in a native Windows WebView2 window (no browser
// chrome, DevTools disabled) and falls back to Edge/Chrome --app mode.
package winhost

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// WaitReady polls localhost until /api/health succeeds or timeout.
// Prefer a port file written by Java; otherwise scan basePort..basePort+19.
func WaitReady(portFile string, basePort int, timeout time.Duration) (url string, err error) {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 800 * time.Millisecond}
	for time.Now().Before(deadline) {
		if portFile != "" {
			if raw, readErr := os.ReadFile(portFile); readErr == nil {
				p := strings.TrimSpace(string(raw))
				if p != "" {
					if u, ok := probe(client, "http://127.0.0.1:"+p+"/"); ok {
						return u, nil
					}
				}
			}
		}
		for p := basePort; p < basePort+20; p++ {
			if u, ok := probe(client, fmt.Sprintf("http://127.0.0.1:%d/", p)); ok {
				return u, nil
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	return "", fmt.Errorf("Lark did not become ready in time")
}

func probe(client *http.Client, base string) (string, bool) {
	resp, err := client.Get(strings.TrimRight(base, "/") + "/api/health")
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != 200 {
		return "", false
	}
	return strings.TrimRight(base, "/") + "/", true
}

// ReadPortFile returns the port from a Java-written port file, or 0.
func ReadPortFile(path string) int {
	raw, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || n <= 0 || n > 65535 {
		return 0
	}
	return n
}

// OpenAppFallback launches Edge/Chrome in --app mode with a private profile.
// Returns the process so the caller can Wait; nil process means start failed.
func OpenAppFallback(url, profileDir, title string) (*os.Process, error) {
	_ = os.MkdirAll(profileDir, 0o700)
	candidates := browserCandidates()
	args := []string{
		"--app=" + url,
		"--user-data-dir=" + profileDir,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--disable-default-apps",
		"--disable-sync",
		"--disable-translate",
		"--disable-background-networking",
		"--disable-features=TranslateUI,MediaRouter",
		"--disable-popup-blocking",
		"--window-size=1280,800",
		"--class=Lark",
	}
	if title != "" {
		// Best-effort window name hint (Chromium ignores unknown flags).
		args = append(args, "--app-name="+title)
	}
	var last error
	for _, bin := range candidates {
		cmd := exec.Command(bin, args...)
		cmd.Stdout = nil
		cmd.Stderr = nil
		if err := cmd.Start(); err != nil {
			last = err
			continue
		}
		return cmd.Process, nil
	}
	if last == nil {
		last = fmt.Errorf("no Edge/Chrome found for app window")
	}
	return nil, last
}

func browserCandidates() []string {
	var out []string
	local := os.Getenv("LOCALAPPDATA")
	pf := os.Getenv("ProgramFiles")
	pf86 := os.Getenv("ProgramFiles(x86)")
	for _, parts := range [][]string{
		{local, "Microsoft", "Edge", "Application", "msedge.exe"},
		{pf, "Microsoft", "Edge", "Application", "msedge.exe"},
		{pf86, "Microsoft", "Edge", "Application", "msedge.exe"},
		{local, "Google", "Chrome", "Application", "chrome.exe"},
		{pf, "Google", "Chrome", "Application", "chrome.exe"},
		{pf86, "Google", "Chrome", "Application", "chrome.exe"},
	} {
		if parts[0] == "" {
			continue
		}
		p := filepath.Join(parts...)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			out = append(out, p)
		}
	}
	return out
}
