//go:build windows

// This experimental transport forwards only to loopback. Share provides TLS.
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

var sentBytes atomic.Uint64
var receivedBytes atomic.Uint64

func publishStats() {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for range ticker.C {
			fmt.Printf("STATS %d %d\n", sentBytes.Load(), receivedBytes.Load())
		}
	}()
}

const afBth = 32
const bthRfcomm = 3
const btPortAny = ^uint32(0)

var ws = syscall.NewLazyDLL("ws2_32.dll")
var bt = syscall.NewLazyDLL("bthprops.cpl")
var pSocket = ws.NewProc("socket")
var pBind = ws.NewProc("bind")
var pListen = ws.NewProc("listen")
var pAccept = ws.NewProc("accept")
var pConnect = ws.NewProc("connect")
var pGetSockName = ws.NewProc("getsockname")
var pCloseSocket = ws.NewProc("closesocket")
var pRecv = ws.NewProc("recv")
var pSend = ws.NewProc("send")
var pLastError = ws.NewProc("WSAGetLastError")
var pFindRadio = bt.NewProc("BluetoothFindFirstRadio")
var pCloseFind = bt.NewProc("BluetoothFindRadioClose")
var pRadioInfo = bt.NewProc("BluetoothGetRadioInfo")
var pFindDevice = bt.NewProc("BluetoothFindFirstDevice")
var pNextDevice = bt.NewProc("BluetoothFindNextDevice")
var pCloseDevice = bt.NewProc("BluetoothFindDeviceClose")
var pAuthenticate = bt.NewProc("BluetoothAuthenticateDeviceEx")
var pSetService = ws.NewProc("WSASetServiceW")
var pLookupBegin = ws.NewProc("WSALookupServiceBeginW")
var pLookupNext = ws.NewProc("WSALookupServiceNextW")
var pLookupEnd = ws.NewProc("WSALookupServiceEnd")
var pAddressString = ws.NewProc("WSAAddressToStringW")

// Stable, application-specific service class, shared by host and guest.
var serviceID = syscall.GUID{Data1: 0x58035785, Data2: 0x8a89, Data3: 0x463b, Data4: [8]byte{0x89, 0xc4, 0x45, 0x81, 0x4a, 0xcd, 0x77, 0x33}}

type socketAddress struct {
	Address uintptr
	Length  int32
	_       uint32
}
type csAddress struct {
	Local, Remote        socketAddress
	SocketType, Protocol int32
}
type querySet struct {
	Size                          uint32
	_                             uint32
	Name, Class, Version, Comment uintptr
	Namespace                     uint32
	_                             uint32
	Provider, Context             uintptr
	ProtocolCount                 uint32
	_                             uint32
	Protocols, Query              uintptr
	AddressCount                  uint32
	_                             uint32
	Addresses                     uintptr
	OutputFlags                   uint32
	_                             uint32
	Blob                          uintptr
}

func registerService(address *sockaddrBth) (func(), error) {
	name, _ := syscall.UTF16PtrFromString("Lark Share")
	addr := csAddress{Local: socketAddress{Address: uintptr(unsafe.Pointer(address)), Length: int32(unsafe.Sizeof(*address))}, SocketType: 1, Protocol: bthRfcomm}
	query := querySet{Size: uint32(unsafe.Sizeof(querySet{})), Name: uintptr(unsafe.Pointer(name)), Class: uintptr(unsafe.Pointer(&serviceID)), Namespace: 16, AddressCount: 1, Addresses: uintptr(unsafe.Pointer(&addr))}
	r, _, _ := pSetService.Call(uintptr(unsafe.Pointer(&query)), 0, 0)
	if int32(r) == -1 {
		return nil, fail("Register Bluetooth service")
	}
	return func() { pSetService.Call(uintptr(unsafe.Pointer(&query)), 2, 0) }, nil
}

func hasService(address uint64) bool {
	a := newSockaddr(address, 0)
	var text [80]uint16
	n := uint32(len(text))
	r, _, _ := pAddressString.Call(uintptr(unsafe.Pointer(&a)), unsafe.Sizeof(a), 0, uintptr(unsafe.Pointer(&text[0])), uintptr(unsafe.Pointer(&n)))
	if int32(r) == -1 {
		return false
	}
	query := querySet{Size: uint32(unsafe.Sizeof(querySet{})), Class: uintptr(unsafe.Pointer(&serviceID)), Namespace: 16, Context: uintptr(unsafe.Pointer(&text[0]))}
	var handle uintptr
	r, _, _ = pLookupBegin.Call(uintptr(unsafe.Pointer(&query)), 0x100, uintptr(unsafe.Pointer(&handle)))
	if int32(r) == -1 {
		return false
	}
	defer pLookupEnd.Call(handle)
	buffer := make([]byte, 4096)
	size := uint32(len(buffer))
	r, _, _ = pLookupNext.Call(handle, 0x100, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&buffer[0])))
	return int32(r) != -1
}

type sockaddrBth struct {
	Family  uint16
	Address [8]byte
	Service [16]byte
	Port    [4]byte
}

func newSockaddr(address uint64, port uint32) sockaddrBth {
	a := sockaddrBth{Family: afBth}
	binary.LittleEndian.PutUint64(a.Address[:], address)
	binary.LittleEndian.PutUint32(a.Port[:], port)
	return a
}

type radioInfo struct {
	Size         uint32
	_            uint32
	Address      uint64
	Name         [248]uint16
	Class        uint32
	Subversion   uint16
	Manufacturer uint16
}
type searchParams struct {
	Size                                                   uint32
	Authenticated, Remembered, Unknown, Connected, Inquiry int32
	Timeout                                                byte
	_                                                      [7]byte
	Radio                                                  uintptr
}
type deviceInfo struct {
	Size                                 uint32
	_                                    uint32
	Address                              uint64
	Class                                uint32
	Connected, Remembered, Authenticated int32
	LastSeen, LastUsed                   [8]uint16
	Name                                 [248]uint16
}
type deviceCard struct {
	Address   string `json:"address"`
	Name      string `json:"name"`
	Paired    bool   `json:"paired"`
	Connected bool   `json:"connected"`
	Lark      bool   `json:"lark"`
}

func discover() error {
	if _, err := localRadio(); err != nil {
		return err
	}
	params := searchParams{Size: uint32(unsafe.Sizeof(searchParams{})), Authenticated: 1, Remembered: 1, Unknown: 1, Connected: 1, Inquiry: 1, Timeout: 4}
	info := deviceInfo{Size: uint32(unsafe.Sizeof(deviceInfo{}))}
	find, _, _ := pFindDevice.Call(uintptr(unsafe.Pointer(&params)), uintptr(unsafe.Pointer(&info)))
	cards := []deviceCard{}
	if find != 0 {
		defer pCloseDevice.Call(find)
		for {
			cards = append(cards, deviceCard{Address: fmt.Sprintf("%012x", info.Address), Name: syscall.UTF16ToString(info.Name[:]), Paired: info.Authenticated != 0, Connected: info.Connected != 0, Lark: hasService(info.Address)})
			info = deviceInfo{Size: uint32(unsafe.Sizeof(deviceInfo{}))}
			ok, _, _ := pNextDevice.Call(find, uintptr(unsafe.Pointer(&info)))
			if ok == 0 {
				break
			}
		}
	}
	return json.NewEncoder(os.Stdout).Encode(cards)
}

// Windows owns the pairing confirmation and any PIN or numeric comparison.
func pair(address uint64) error {
	if _, err := localRadio(); err != nil {
		return err
	}
	info := deviceInfo{Size: uint32(unsafe.Sizeof(deviceInfo{})), Address: address}
	code, _, _ := pAuthenticate.Call(0, 0, uintptr(unsafe.Pointer(&info)), 0, 2)
	if code != 0 && code != 259 {
		return fmt.Errorf("Bluetooth pairing did not complete (Windows error %d)", code)
	}
	fmt.Println("PAIRED")
	return nil
}

func fail(op string) error {
	e, _, _ := pLastError.Call()
	return fmt.Errorf("%s: Windows Bluetooth error %d", op, e)
}
func socket() (uintptr, error) {
	s, _, _ := pSocket.Call(afBth, 1, bthRfcomm)
	if s == ^uintptr(0) {
		return 0, fail("socket")
	}
	return s, nil
}
func callSocket(p *syscall.LazyProc, s uintptr, a *sockaddrBth) error {
	r, _, lastErr := p.Call(s, uintptr(unsafe.Pointer(a)), unsafe.Sizeof(*a))
	if int32(r) == -1 {
		return fmt.Errorf("%s: Windows Bluetooth error %v", p.Name, lastErr)
	}
	return nil
}
func closeSocket(s uintptr) { pCloseSocket.Call(s) }
func localRadio() (uint64, error) {
	size := uint32(4)
	var radio syscall.Handle
	find, _, _ := pFindRadio.Call(uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&radio)))
	if find == 0 {
		return 0, fmt.Errorf("No available Bluetooth radio. Turn on Bluetooth and try again.")
	}
	defer pCloseFind.Call(find)
	defer syscall.CloseHandle(radio)
	info := radioInfo{Size: uint32(unsafe.Sizeof(radioInfo{}))}
	code, _, _ := pRadioInfo.Call(uintptr(radio), uintptr(unsafe.Pointer(&info)))
	if code != 0 {
		return 0, fmt.Errorf("Cannot read Bluetooth radio: Windows error %d", code)
	}
	return info.Address, nil
}
func transfer(s uintptr, c net.Conn) {
	done := make(chan struct{}, 2)
	go func() {
		defer func() { done <- struct{}{} }()
		b := make([]byte, 8192)
		for {
			n, e := c.Read(b)
			if n > 0 {
				for off := 0; off < n; {
					r, _, _ := pSend.Call(s, uintptr(unsafe.Pointer(&b[off])), uintptr(n-off), 0)
					if int32(r) <= 0 {
						return
					}
					off += int(r)
					sentBytes.Add(uint64(r))
				}
			}
			if e != nil {
				return
			}
		}
	}()
	go func() {
		defer func() { done <- struct{}{} }()
		b := make([]byte, 8192)
		for {
			r, _, _ := pRecv.Call(s, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), 0)
			if int32(r) <= 0 {
				return
			}
			receivedBytes.Add(uint64(r))
			if _, e := c.Write(b[:int(r)]); e != nil {
				return
			}
		}
	}()
	<-done
	c.Close()
	closeSocket(s)
	<-done
}
func host(port int) error {
	addr, err := localRadio()
	if err != nil {
		return err
	}
	s, err := socket()
	if err != nil {
		return err
	}
	defer closeSocket(s)
	a := newSockaddr(0, btPortAny)
	if err = callSocket(pBind, s, &a); err != nil {
		return err
	}
	n := int32(unsafe.Sizeof(a))
	r, _, _ := pGetSockName.Call(s, uintptr(unsafe.Pointer(&a)), uintptr(unsafe.Pointer(&n)))
	if int32(r) == -1 {
		return fail("getsockname")
	}
	r, _, _ = pListen.Call(s, 8)
	if int32(r) == -1 {
		return fail("listen")
	}
	unregister, err := registerService(&a)
	if err != nil {
		return err
	}
	defer unregister()
	fmt.Printf("READY %012x %d\n", addr, binary.LittleEndian.Uint32(a.Port[:]))
	publishStats()
	// Bound simultaneous peer sockets so an untrusted nearby device cannot
	// create an unbounded number of forwarding goroutines.
	slots := make(chan struct{}, 8)
	for {
		peer, _, _ := pAccept.Call(s, 0, 0)
		if peer == ^uintptr(0) {
			return fail("accept")
		}
		select {
		case slots <- struct{}{}:
		default:
			closeSocket(peer)
			continue
		}
		go func() {
			defer func() { <-slots }()
			c, e := net.Dial("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
			if e != nil {
				closeSocket(peer)
				return
			}
			transfer(peer, c)
		}()
	}
}
func guest(address uint64, channel uint32) error {
	if _, err := localRadio(); err != nil {
		return err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer listener.Close()
	fmt.Printf("READY %d\n", listener.Addr().(*net.TCPAddr).Port)
	publishStats()
	slots := make(chan struct{}, 8)
	for {
		c, e := listener.Accept()
		if e != nil {
			return e
		}
		select {
		case slots <- struct{}{}:
		default:
			c.Close()
			continue
		}
		go func() {
			defer func() { <-slots }()
			s, e := socket()
			if e != nil {
				c.Close()
				return
			}
			a := newSockaddr(address, channel)
			if channel == 0 {
				a.Service = *(*[16]byte)(unsafe.Pointer(&serviceID))
			}
			if e = callSocket(pConnect, s, &a); e != nil {
				closeSocket(s)
				c.Close()
				return
			}
			transfer(s, c)
		}()
	}
}
func run() error {
	if len(os.Args) == 3 && os.Args[1] == "pair" {
		address, err := strconv.ParseUint(os.Args[2], 16, 48)
		if err != nil || address == 0 {
			return fmt.Errorf("invalid Bluetooth address")
		}
		return pair(address)
	}
	if len(os.Args) == 2 && os.Args[1] == "discover" {
		return discover()
	}
	if len(os.Args) == 3 && os.Args[1] == "host" {
		port, e := strconv.Atoi(os.Args[2])
		if e != nil || port < 1 || port > 65535 {
			return fmt.Errorf("invalid loopback port")
		}
		return host(port)
	}
	if len(os.Args) == 4 && os.Args[1] == "guest" {
		address, e := strconv.ParseUint(os.Args[2], 16, 48)
		if e != nil || address == 0 {
			return fmt.Errorf("invalid Bluetooth address")
		}
		channel, e := strconv.ParseUint(os.Args[3], 10, 32)
		if e != nil || channel > 30 {
			return fmt.Errorf("invalid Bluetooth channel")
		}
		return guest(address, uint32(channel))
	}
	return fmt.Errorf("usage: lark-bluetooth host PORT | guest ADDRESS CHANNEL")
}
func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
