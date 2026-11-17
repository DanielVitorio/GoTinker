//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func fail(err error) {
	messageBox("Go Tinker", "Não foi possível iniciar o Go Tinker.\n\n"+err.Error(), 0x10)
}

func messageBox(title, message string, flags uintptr) {
	proc := user32.NewProc("MessageBoxW")
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	messagePtr, _ := syscall.UTF16PtrFromString(message)
	proc.Call(0, uintptr(unsafe.Pointer(messagePtr)), uintptr(unsafe.Pointer(titlePtr)), flags)
}
