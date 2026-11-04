package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunCopiesAreIndependent(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "source.jar")
	if err := os.WriteFile(source, []byte("jar contents"), 0600); err != nil {
		t.Fatal(err)
	}
	first, err := copyRunJar(source, dir)
	if err != nil {
		t.Fatal(err)
	}
	second, err := copyRunJar(source, dir)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatal("concurrent launches share a run jar")
	}
	if err := os.Remove(second); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(first)
	if err != nil || string(content) != "jar contents" {
		t.Fatalf("first launch copy was damaged: %q, %v", content, err)
	}
}
