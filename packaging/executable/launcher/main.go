// Lark Executable launcher for Windows — double-click Lark.exe only.
// Runtime is buried under app\ and jdk\ (soft-hidden). No .bat required.
// Build: GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H windowsgui"
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
	root = filepath.Clean(root)

	logPath := bootLogPath("executable")
	logf(logPath, "Lark Executable boot %s\nROOT=%s\n", time.Now().Format(time.RFC3339), root)

	if unsafeInstallPath(root) {
		fail("Lark", "Do not run Lark from a Temp or zip preview folder.\n\n"+
			"1. Close this message\n"+
			"2. Download lark-executable-windows.zip\n"+
			"3. Right-click → Extract All… to something like:\n"+
			"   C:\\Users\\"+os.Getenv("USERNAME")+"\\Lark\n"+
			"4. Open THAT folder and double-click Lark.exe")
		return
	}

	hideRuntimeDirs(root)

	exePath := filepath.Join(root, "Lark.exe")
	if err := applyPending(exePath, exePath+".pending", exePath+".bak", logPath); err != nil {
		logf(logPath, "exe pending: %v\n", err)
	}

	jar, err := resolveJar(root)
	if err != nil {
		fail("Lark", err.Error())
		return
	}
	if err := applyPending(jar, jar+".pending", jar+".bak", logPath); err != nil {
		logf(logPath, "jar pending: %v\n", err)
	}
	if err := ensureInside(root, jar); err != nil {
		fail("Lark", "lark.jar must stay inside the Lark folder.\n\n"+err.Error())
		return
	}
	if err := verifyJarMagic(jar); err != nil {
		fail("Lark", "lark.jar looks damaged or was replaced.\n\nRe-download lark-executable-windows.zip and Extract All again.")
		return
	}

	javaw, java, javac, jvmcfg, err := resolveJdk(root)
	if err != nil {
		fail("Lark", err.Error()+"\n\nRe-download lark-executable-windows.zip and Extract All — keep the hidden jdk folder with Lark.exe.")
		return
	}
	for _, p := range []string{javaw, java, javac, jvmcfg} {
		if p == "" {
			continue
		}
		if err := ensureInside(root, p); err != nil {
			fail("Lark", "Bundled JDK path escaped the install folder.\n\n"+err.Error())
			return
		}
	}
	launcher := javaw
	if !fileExists(launcher) {
		launcher = java
	}

	runDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Lark", "run-executable")
	if os.Getenv("LOCALAPPDATA") == "" {
		runDir = filepath.Join(os.TempDir(), "Lark", "run-executable")
	}
	if err := os.MkdirAll(runDir, 0o700); err != nil {
		fail("Lark", "Could not create run folder:\n"+runDir+"\n\n"+err.Error())
		return
	}
	runJar := filepath.Join(runDir, "lark.jar")
	_ = os.Remove(runJar)
	if err := copyFile(jar, runJar); err != nil {
		logf(logPath, "run copy failed: %v — using install jar\n", err)
		runJar = jar
	} else {
		defer func() { _ = os.Remove(runJar) }()
	}

	logf(logPath, "Launching %s -cp %s lark.Executable\n", launcher, runJar)
	cmd := exec.Command(launcher,
		"-Dlark.install="+root,
		"-Dlark.executable=true",
		"-Dlark.channel=executable",
		"-Dlark.ui=jar",
		"-cp", runJar,
		"lark.Executable",
	)
	cmd.Dir = root
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Stdout = nil
	cmd.Stderr = nil
	if err := cmd.Start(); err != nil {
		fail("Lark", "Could not start Java:\n"+err.Error()+"\n\nSee the boot log under %LOCALAPPDATA%\\Lark\\logs.")
		return
	}
	err = cmd.Wait()
	if err != nil {
		logf(logPath, "java exit: %v\n", err)
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() != 0 {
			fail("Lark", fmt.Sprintf("Lark stopped with error code %d.\n\nSee %%LOCALAPPDATA%%\\Lark\\logs\\executable-boot.log", exitErr.ExitCode()))
		}
	}
}

func resolveJar(root string) (string, error) {
	candidates := []string{
		filepath.Join(root, "app", "lark.jar"),
		filepath.Join(root, "lark.jar"),
	}
	for _, c := range candidates {
		if fileExists(c) {
			return c, nil
		}
	}
	return "", fmt.Errorf("lark.jar is missing under app\\ next to Lark.exe.\n\nExtract the FULL executable zip.")
}

func resolveJdk(root string) (javaw, java, javac, jvmcfg string, err error) {
	javaw = filepath.Join(root, "jdk", "bin", "javaw.exe")
	java = filepath.Join(root, "jdk", "bin", "java.exe")
	javac = filepath.Join(root, "jdk", "bin", "javac.exe")
	jvmcfg = filepath.Join(root, "jdk", "lib", "jvm.cfg")
	if !fileExists(javac) || !fileExists(jvmcfg) || (!fileExists(javaw) && !fileExists(java)) {
		return "", "", "", "", fmt.Errorf("the bundled JDK is missing or incomplete")
	}
	return javaw, java, javac, jvmcfg, nil
}

func unsafeInstallPath(root string) bool {
	lower := strings.ToLower(root)
	return strings.Contains(lower, `\temp\`) ||
		strings.Contains(lower, `\appdata\local\temp\`) ||
		strings.Contains(lower, ".zip.") ||
		strings.Contains(lower, `\iNetCache\`) ||
		strings.Contains(lower, `\temporary internet files\`)
}

func ensureInside(root, path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	abs = filepath.Clean(abs)
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		abs = resolved
	}
	rootResolved := root
	if r, err := filepath.EvalSymlinks(root); err == nil {
		rootResolved = r
	}
	rootResolved = filepath.Clean(rootResolved)
	sep := string(os.PathSeparator)
	if abs != rootResolved && !strings.HasPrefix(strings.ToLower(abs), strings.ToLower(rootResolved+sep)) {
		return fmt.Errorf("path outside install: %s", abs)
	}
	return nil
}

func verifyJarMagic(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	var magic [4]byte
	if _, err := f.Read(magic[:]); err != nil {
		return err
	}
	// ZIP / JAR local file header
	if magic[0] != 'P' || magic[1] != 'K' || magic[2] != 3 || magic[3] != 4 {
		if magic[0] != 'P' || magic[1] != 'K' { // also allow empty jar / directory zip variants PK\x05\x06
			return fmt.Errorf("bad jar magic")
		}
	}
	return nil
}

func hideRuntimeDirs(root string) {
	for _, name := range []string{"app", "jdk"} {
		hidePath(filepath.Join(root, name))
	}
}

func hidePath(path string) {
	if !dirExists(path) && !fileExists(path) {
		return
	}
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return
	}
	const fileAttributeHidden = 0x2
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	get := kernel32.NewProc("GetFileAttributesW")
	set := kernel32.NewProc("SetFileAttributesW")
	attrs, _, _ := get.Call(uintptr(unsafe.Pointer(p)))
	if attrs == uintptr(0xFFFFFFFF) {
		return
	}
	_, _, _ = set.Call(uintptr(unsafe.Pointer(p)), attrs|fileAttributeHidden)
}

func bootLogPath(name string) string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "Lark", "logs")
	_ = os.MkdirAll(dir, 0o700)
	return filepath.Join(dir, name+"-boot.log")
}

func applyPending(target, pending, bak, logPath string) error {
	if !fileExists(pending) {
		return nil
	}
	for try := 1; try <= 40; try++ {
		logf(logPath, "Applying pending update try %d/40\n", try)
		_ = os.Remove(bak)
		if fileExists(target) {
			if err := os.Rename(target, bak); err != nil {
				time.Sleep(400 * time.Millisecond)
				continue
			}
		}
		if err := os.Rename(pending, target); err != nil {
			if fileExists(bak) && !fileExists(target) {
				_ = os.Rename(bak, target)
			}
			time.Sleep(400 * time.Millisecond)
			continue
		}
		_ = os.Remove(bak)
		logf(logPath, "Update applied\n")
		return nil
	}
	return fmt.Errorf("could not apply pending update")
}

func fileExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && !st.IsDir()
}

func dirExists(path string) bool {
	st, err := os.Stat(path)
	return err == nil && st.IsDir()
}

func copyFile(src, dst string) error {
	in, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, in, 0o600)
}

func logf(path, format string, args ...any) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
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
