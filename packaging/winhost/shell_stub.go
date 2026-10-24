//go:build !windows

package winhost

import "fmt"

// OpenNativeShell is only available on Windows.
func OpenNativeShell(title, url, dataPath string) error {
	return fmt.Errorf("native shell is only available on Windows")
}

// ShellDataPath returns a profile path (unused on non-Windows).
func ShellDataPath(edition string) string {
	return ""
}
