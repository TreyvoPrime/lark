// Lark Enterprise launcher for Windows — double-click Lark Enterprise.exe.
// Built with: GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H windowsgui"
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

func main() {
	exe, err := os.Executable()
	if err != nil {
		fail("Lark Enterprise", "Could not find Lark Enterprise.exe location.")
		return
	}
	root, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		fail("Lark Enterprise", err.Error())
		return
	}

	logPath := filepath.Join(root, "lark-enterprise-boot.log")
	logf(logPath, "Lark Enterprise boot %s\nROOT=%s\n", time.Now().Format(time.RFC3339), root)

	lower := strings.ToLower(root)
	if strings.Contains(lower, `\temp\`) || strings.Contains(lower, `\appdata\local\temp\`) || strings.Contains(lower, ".zip.") {
		fail("Lark Enterprise", "Do not run Lark Enterprise from a Temp or zip preview folder.\n\n"+
			"Install with LarkEnterpriseSetup.exe, then open Lark Enterprise from the Start Menu.")
		return
	}

	jar := filepath.Join(root, "lark.jar")
	pending := filepath.Join(root, "lark.jar.pending")
	bak := filepath.Join(root, "lark.jar.bak")
	javaw := filepath.Join(root, "jdk", "bin", "javaw.exe")
	java := filepath.Join(root, "jdk", "bin", "java.exe")
	javac := filepath.Join(root, "jdk", "bin", "javac.exe")
	jvmcfg := filepath.Join(root, "jdk", "lib", "jvm.cfg")

	if err := applyPending(jar, pending, bak, logPath); err != nil {
		logf(logPath, "pending: %v\n", err)
	}

	if !fileExists(jar) {
		fail("Lark Enterprise", "lark.jar is missing next to Lark Enterprise.exe.\n\nRe-run LarkEnterpriseSetup.exe.")
		return
	}
	if !fileExists(javac) || !fileExists(jvmcfg) || (!fileExists(javaw) && !fileExists(java)) {
		fail("Lark Enterprise", "The bundled JDK is missing or incomplete.\n\nRe-run LarkEnterpriseSetup.exe.")
		return
	}
	launcher := javaw
	if !fileExists(launcher) {
		launcher = java
	}

	runDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Lark Enterprise", "run")
	if os.Getenv("LOCALAPPDATA") == "" {
		runDir = filepath.Join(os.TempDir(), "Lark Enterprise", "run")
	}
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		fail("Lark Enterprise", "Could not create run folder:\n"+runDir+"\n\n"+err.Error())
		return
	}
	runJar := filepath.Join(runDir, "lark.jar")
	_ = os.Remove(runJar)
	if err := copyFile(jar, runJar); err != nil {
		logf(logPath, "run copy failed: %v — using install jar\n", err)
		runJar = jar
	}

	logf(logPath, "Launching %s -cp %s lark.Enterprise\n", launcher, runJar)
	cmd := exec.Command(launcher,
		"-Dlark.install="+root,
		"-Dlark.enterprise=true",
		"-Dlark.channel=enterprise",
		"-Dlark.ui=jar",
		"-cp", runJar,
		"lark.Enterprise",
	)
	cmd.Dir = root
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		fail("Lark Enterprise", "Could not start Java:\n"+err.Error()+"\n\nSee lark-enterprise-boot.log next to the app.")
		return
	}
	err = cmd.Wait()
	if err != nil {
		logf(logPath, "java exit: %v\n", err)
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() != 0 {
			fail("Lark Enterprise", fmt.Sprintf(
				"Lark Enterprise stopped with error code %d.\n\nSee lark-enterprise-boot.log.",
				exitErr.ExitCode()))
		}
	}
}

func applyPending(jar, pending, bak, logPath string) error {
	if !fileExists(pending) {
		return nil
	}
	for try := 1; try <= 40; try++ {
		logf(logPath, "Applying pending update try %d/40\n", try)
		_ = os.Remove(bak)
		if fileExists(jar) {
			if err := os.Rename(jar, bak); err != nil {
				time.Sleep(400 * time.Millisecond)
				continue
			}
		}
		if err := os.Rename(pending, jar); err != nil {
			if fileExists(bak) && !fileExists(jar) {
				_ = os.Rename(bak, jar)
			}
			time.Sleep(400 * time.Millisecond)
			continue
		}
		_ = os.Remove(bak)
		logf(logPath, "Update applied\n")
		return nil
	}
	return fmt.Errorf("could not apply pending update; will try run copy")
}

func fileExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

func copyFile(src, dst string) error {
	in, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, in, 0o644)
}

func logf(path, format string, args ...any) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, format, args...)
}

func fail(title, msg string) {
	messageBox(title, msg)
}

func messageBox(title, text string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	_, _, _ = proc.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
}
