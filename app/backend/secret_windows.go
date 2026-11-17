package main

import (
	"encoding/base64"
	"errors"
	"syscall"
	"unsafe"
)

type dataBlob struct {
	Size uint32
	Data *byte
}

var crypt32 = syscall.NewLazyDLL("Crypt32.dll")
var kernel32 = syscall.NewLazyDLL("Kernel32.dll")
var cryptProtectData = crypt32.NewProc("CryptProtectData")
var cryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
var localFree = kernel32.NewProc("LocalFree")

func protectSecret(value string) (string, error) {
	input := []byte(value)
	if len(input) == 0 {
		return "", nil
	}
	source := dataBlob{Size: uint32(len(input)), Data: &input[0]}
	var destination dataBlob
	result, _, callErr := cryptProtectData.Call(uintptr(unsafe.Pointer(&source)), 0, 0, 0, 0, 1, uintptr(unsafe.Pointer(&destination)))
	if result == 0 {
		return "", callErr
	}
	defer localFree.Call(uintptr(unsafe.Pointer(destination.Data)))
	protected := unsafe.Slice(destination.Data, destination.Size)
	return base64.StdEncoding.EncodeToString(protected), nil
}

func unprotectSecret(value string) (string, error) {
	input, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(input) == 0 {
		return "", errors.New("senha criptografada inválida")
	}
	source := dataBlob{Size: uint32(len(input)), Data: &input[0]}
	var destination dataBlob
	result, _, callErr := cryptUnprotectData.Call(uintptr(unsafe.Pointer(&source)), 0, 0, 0, 0, 1, uintptr(unsafe.Pointer(&destination)))
	if result == 0 {
		return "", callErr
	}
	defer localFree.Call(uintptr(unsafe.Pointer(destination.Data)))
	return string(unsafe.Slice(destination.Data, destination.Size)), nil
}
