//go:build windows

package main

import (
	"bytes"
	"io"
	"net"
	"os"
	"strings"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

func TestSocketFailureKeepsWindowsError(t *testing.T) {
	s, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_STREAM, syscall.IPPROTO_TCP)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Closesocket(s)
	a := newSockaddr(0, btPortAny)
	err = callSocket(pBind, uintptr(s), &a)
	if err == nil || strings.HasSuffix(err.Error(), "error 0") || strings.Contains(err.Error(), "completed successfully") {
		t.Fatalf("missing actual bind error: %v", err)
	}
}

func TestWindowsLayouts(t *testing.T) {
	if unsafe.Sizeof(querySet{}) != 120 || unsafe.Sizeof(csAddress{}) != 40 {
		t.Fatal("Bluetooth service discovery structures do not match the Windows ABI")
	}
	if unsafe.Sizeof(searchParams{}) != 40 || unsafe.Sizeof(deviceInfo{}) != 560 {
		t.Fatal("Bluetooth discovery structures do not match the Windows ABI")
	}
	var address sockaddrBth
	if unsafe.Sizeof(address) != 30 || unsafe.Offsetof(address.Address) != 2 || unsafe.Offsetof(address.Port) != 26 {
		t.Fatal("Bluetooth socket address does not match the Windows ABI")
	}
	var radio radioInfo
	if unsafe.Sizeof(radio) != 520 || unsafe.Offsetof(radio.Address) != 8 {
		t.Fatal("Bluetooth radio information does not match the Windows ABI")
	}
}

// Exercise the same Winsock send/recv forwarding used for RFCOMM with a
// loopback TCP socket. This verifies stream handling, not the Bluetooth radio.
func TestTransferWithWinsock(t *testing.T) {
	sentBefore, receivedBefore := sentBytes.Load(), receivedBytes.Load()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	raw, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_STREAM, syscall.IPPROTO_TCP)
	if err != nil {
		t.Fatal(err)
	}
	addr := &syscall.SockaddrInet4{Port: listener.Addr().(*net.TCPAddr).Port, Addr: [4]byte{127, 0, 0, 1}}
	if err = syscall.Connect(raw, addr); err != nil {
		syscall.Closesocket(raw)
		t.Fatal(err)
	}
	peer, err := listener.Accept()
	if err != nil {
		syscall.Closesocket(raw)
		t.Fatal(err)
	}
	defer peer.Close()
	peer.SetDeadline(time.Now().Add(10 * time.Second))
	client, bridge := net.Pipe()
	defer client.Close()
	client.SetDeadline(time.Now().Add(10 * time.Second))
	done := make(chan struct{})
	go func() { transfer(uintptr(raw), bridge); close(done) }()
	want := bytes.Repeat([]byte("Lark encrypted stream\x00"), 8192)
	writeDone := make(chan error, 1)
	go func() { _, e := client.Write(want); writeDone <- e }()
	got := make([]byte, len(want))
	if _, err := io.ReadFull(peer, got); err != nil {
		t.Fatal(err)
	}
	if err := <-writeDone; err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(want, got) {
		t.Fatal("data changed while forwarding toward host")
	}
	go func() { _, e := peer.Write(want); writeDone <- e }()
	if _, err := io.ReadFull(client, got); err != nil {
		t.Fatal(err)
	}
	if err := <-writeDone; err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(want, got) {
		t.Fatal("data changed while forwarding toward guest")
	}
	client.Close()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("transfer did not stop after disconnect")
	}
	if sentBytes.Load()-sentBefore != uint64(len(want)) || receivedBytes.Load()-receivedBefore != uint64(len(want)) {
		t.Fatal("traffic counters did not match transferred bytes")
	}
}

func TestInvalidArguments(t *testing.T) {
	original := os.Args
	defer func() { os.Args = original }()
	for _, args := range [][]string{
		{"helper"}, {"helper", "host", "0"}, {"helper", "host", "65536"},
		{"helper", "guest", "0", "1"}, {"helper", "guest", "bad-address", "1"},
		{"helper", "guest", "1", "31"},
	} {
		os.Args = args
		if run() == nil {
			t.Fatalf("accepted invalid arguments %v", args)
		}
	}
}
