package winhost

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jchv/go-webview2"
)

// OpenNativeShell opens a WebView2 window with DevTools and default context
// menus disabled. Blocks until the user closes the window. Returns an error
// if the WebView2 runtime is missing or the window could not be created.
func OpenNativeShell(title, url, dataPath string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("WebView2 failed: %v", r)
		}
	}()
	if dataPath != "" {
		_ = os.MkdirAll(dataPath, 0o700)
	}
	if title == "" {
		title = "Lark"
	}
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false, // DevTools off, default context menu off
		DataPath:  dataPath,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  title,
			Width:  1280,
			Height: 800,
			Center: true,
		},
	})
	if w == nil {
		return fmt.Errorf("WebView2 runtime unavailable (install Microsoft Edge WebView2)")
	}
	defer w.Destroy()
	w.SetTitle(title)
	w.SetSize(1280, 800, webview2.HintNone)
	w.Navigate(url)
	w.Run()
	return nil
}

// ShellDataPath returns an isolated WebView2 profile directory under LOCALAPPDATA.
func ShellDataPath(edition string) string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	if edition == "" {
		edition = "shell"
	}
	return filepath.Join(base, "Lark", "webview2-"+edition)
}
