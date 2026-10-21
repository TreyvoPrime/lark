// Lark School launcher for Windows — double-click Lark.exe, no .bat required.
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
		fail("Lark", "Could not find Lark.exe location.")
		return
	}
	root, err := filepath.Abs(filepath.Dir(exe))
	if err != nil {
		fail("Lark", err.Error())
		return
	}

	logPath := filepath.Join(root, "lark-school-boot.log")
	logf(logPath, "Lark School boot %s\nROOT=%s\n", time.Now().Format(time.RFC3339), root)

	lower := strings.ToLower(root)
	if strings.Contains(lower, `\temp\`) || strings.Contains(lower, `\appdata\local\temp\`) || strings.Contains(lower, ".zip.") {
		fail("Lark", "Do not run Lark from a Temp or zip preview folder.\n\n"+
			"1. Close this message\n"+
			"2. Download lark-school-windows.zip\n"+
			"3. Right-click → Extract All… to something like:\n"+
			"   C:\\Users\\"+os.Getenv("USERNAME")+"\\Lark\n"+
			"4. Open THAT folder and double-click Lark.exe\n"+
			"   (you must see Lark.exe, lark.jar, and a jdk folder together)")
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
		fail("Lark", "lark.jar is missing next to Lark.exe.\n\nExtract the FULL school zip so Lark.exe, lark.jar, and jdk\\ are in the same folder.")
		return
	}
	if !fileExists(javac) || !fileExists(jvmcfg) || (!fileExists(javaw) && !fileExists(java)) {
		fail("Lark", "The bundled JDK is missing or incomplete.\n\nRe-download lark-school-windows.zip and Extract All again — keep the jdk folder with Lark.exe.")
		return
	}
	launcher := javaw
	if !fileExists(launcher) {
		launcher = java
	}

	runDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Lark", "run")
	if runDir == filepath.Join("Lark", "run") || os.Getenv("LOCALAPPDATA") == "" {
		runDir = filepath.Join(os.TempDir(), "Lark", "run")
	}
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		fail("Lark", "Could not create run folder:\n"+runDir+"\n\n"+err.Error())
		return
	}
	runJar := filepath.Join(runDir, "lark.jar")
	_ = os.Remove(runJar)
	if err := copyFile(jar, runJar); err != nil {
		// Fall back to install jar if copy fails (locked AV, etc.).
		logf(logPath, "run copy failed: %v — using install jar\n", err)
		runJar = jar
	}

	logf(logPath, "Launching %s -jar %s\n", launcher, runJar)
	cmd := exec.Command(launcher,
		"-Dlark.install="+root,
		"-Dlark.ui=jar",
		"-jar", runJar,
	)
	cmd.Dir = root
	// No console window (school PCs / double-click). Browser UI still opens.
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		fail("Lark", "Could not start Java:\n"+err.Error()+"\n\nSee lark-school-boot.log next to Lark.exe.")
		return
	}
	// Wait so Task Manager shows Lark.exe until the IDE exits (clearer for students).
	err = cmd.Wait()
	if err != nil {
		logf(logPath, "java exit: %v\n", err)
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() != 0 {
			fail("Lark", fmt.Sprintf("Lark stopped with error code %d.\n\nSee lark-school-boot.log next to Lark.exe.\nIf you saw ClassFormatError / magic value, delete this folder and re-extract the school zip.", exitErr.ExitCode()))
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
