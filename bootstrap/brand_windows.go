//go:build windows

package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

type versionInfo struct {
	Description string
	Original    string
}

func brandExecutable(executablePath, iconPath string, info versionInfo, useMarker bool) error {
	icon, err := os.ReadFile(iconPath)
	if err != nil {
		return err
	}
	images, group, err := parseIcon(icon)
	if err != nil {
		return err
	}
	version := versionResource(info)
	digest := sha256.New()
	digest.Write(icon)
	digest.Write(version)
	sum := hex.EncodeToString(digest.Sum(nil))
	markerPath := executablePath + ".gotinker-icon"
	if useMarker {
		if marker, readErr := os.ReadFile(markerPath); readErr == nil && strings.TrimSpace(string(marker)) == sum {
			return nil
		}
	}

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	begin := kernel32.NewProc("BeginUpdateResourceW")
	update := kernel32.NewProc("UpdateResourceW")
	finish := kernel32.NewProc("EndUpdateResourceW")
	pathPointer, err := syscall.UTF16PtrFromString(executablePath)
	if err != nil {
		return err
	}
	handle, _, callErr := begin.Call(uintptr(unsafe.Pointer(pathPointer)), 0)
	if handle == 0 {
		return callErr
	}
	failed := true
	defer func() {
		if failed {
			finish.Call(handle, 1)
		}
	}()
	put := func(kind, id, language uintptr, data []byte) error {
		result, _, updateErr := update.Call(handle, kind, id, language, uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)))
		if result != 0 {
			return nil
		}
		if updateErr != syscall.Errno(0) {
			return updateErr
		}
		return errors.New("falha ao atualizar os recursos do executável")
	}
	for _, language := range []uintptr{0, 0x0409} {
		for index, image := range images {
			if err := put(3, uintptr(index+1), language, image); err != nil {
				return err
			}
		}
		if err := put(14, 1, language, group); err != nil {
			return err
		}
		if err := put(16, 1, language, version); err != nil {
			return err
		}
	}
	if result, _, callErr := finish.Call(handle, 0); result == 0 {
		return callErr
	}
	failed = false
	notifyIconChange(executablePath)
	if !useMarker {
		return nil
	}
	return os.WriteFile(markerPath, []byte(sum), 0o644)
}

func parseIcon(icon []byte) ([][]byte, []byte, error) {
	if len(icon) < 6 || binary.LittleEndian.Uint16(icon[0:2]) != 0 || binary.LittleEndian.Uint16(icon[2:4]) != 1 {
		return nil, nil, errors.New("arquivo ICO inválido")
	}
	count := int(binary.LittleEndian.Uint16(icon[4:6]))
	if count < 1 || len(icon) < 6+count*16 {
		return nil, nil, errors.New("arquivo ICO inválido")
	}
	images := make([][]byte, 0, count)
	group := make([]byte, 6, 6+count*14)
	copy(group, icon[:6])
	for i := 0; i < count; i++ {
		entry := icon[6+i*16 : 6+(i+1)*16]
		size := int(binary.LittleEndian.Uint32(entry[8:12]))
		offset := int(binary.LittleEndian.Uint32(entry[12:16]))
		if size < 1 || offset < 6+count*16 || offset+size > len(icon) {
			return nil, nil, errors.New("dados do ícone inválidos")
		}
		images = append(images, icon[offset:offset+size])
		item := make([]byte, 14)
		copy(item[0:12], entry[0:12])
		binary.LittleEndian.PutUint16(item[12:14], uint16(i+1))
		group = append(group, item...)
	}
	return images, group, nil
}

func notifyIconChange(path string) {
	shell32 := syscall.NewLazyDLL("shell32.dll")
	notify := shell32.NewProc("SHChangeNotify")
	if pointer, err := syscall.UTF16PtrFromString(path); err == nil {
		notify.Call(0x00002000, 0x0005, uintptr(unsafe.Pointer(pointer)), 0)
	}
	notify.Call(0x08000000, 0, 0, 0)
}

func versionResource(info versionInfo) []byte {
	pairs := [][2]string{
		{"CompanyName", "Go Tinker"},
		{"FileDescription", info.Description},
		{"FileVersion", appVersion},
		{"InternalName", "GoTinker"},
		{"LegalCopyright", appCopyright},
		{"OriginalFilename", info.Original},
		{"ProductName", "Go Tinker"},
		{"ProductVersion", appVersion},
	}
	var items [][]byte
	for _, pair := range pairs {
		value := utf16z(pair[1])
		items = append(items, versionBlock(pair[0], value, 1, uint16(len(value)/2), nil))
	}
	table := versionBlock("040904B0", nil, 1, 0, joinBlocks(items...))
	stringFileInfo := versionBlock("StringFileInfo", nil, 1, 0, table)
	translation := versionBlock("Translation", []byte{0x09, 0x04, 0xB0, 0x04}, 0, 4, nil)
	varFileInfo := versionBlock("VarFileInfo", nil, 1, 0, translation)
	return versionBlock("VS_VERSION_INFO", fixedFileInfo(), 0, 52, joinBlocks(stringFileInfo, varFileInfo))
}

func fixedFileInfo() []byte {
	parts := [4]uint32{}
	for i, part := range strings.SplitN(appVersion, ".", 4) {
		value, _ := strconv.Atoi(part)
		parts[i] = uint32(value)
	}
	most := parts[0]<<16 | parts[1]
	least := parts[2]<<16 | parts[3]
	fields := []uint32{0xFEEF04BD, 0x00010000, most, least, most, least, 0x3F, 0, 0x00040004, 1, 0, 0, 0}
	out := make([]byte, len(fields)*4)
	for i, field := range fields {
		binary.LittleEndian.PutUint32(out[i*4:], field)
	}
	return out
}

func versionBlock(key string, value []byte, valueType, valueLength uint16, children []byte) []byte {
	block := make([]byte, 6)
	block = append(block, utf16z(key)...)
	block = align4(block)
	if len(value) > 0 {
		block = append(block, value...)
	}
	if len(children) > 0 {
		block = align4(block)
		block = append(block, children...)
	}
	binary.LittleEndian.PutUint16(block[0:2], uint16(len(block)))
	binary.LittleEndian.PutUint16(block[2:4], valueLength)
	binary.LittleEndian.PutUint16(block[4:6], valueType)
	return block
}

func joinBlocks(blocks ...[]byte) []byte {
	var out []byte
	for i, block := range blocks {
		if i > 0 {
			out = align4(out)
		}
		out = append(out, block...)
	}
	return out
}

func align4(data []byte) []byte {
	for len(data)%4 != 0 {
		data = append(data, 0)
	}
	return data
}

func utf16z(value string) []byte {
	units := utf16.Encode([]rune(value))
	out := make([]byte, (len(units)+1)*2)
	for i, unit := range units {
		binary.LittleEndian.PutUint16(out[i*2:], unit)
	}
	return out
}
