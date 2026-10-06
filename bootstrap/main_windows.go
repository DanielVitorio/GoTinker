//go:build windows

package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

const (
	electronVersion = "44.5.1"
	appVersion      = "1.3.48"
)

func main() {
	runtime.LockOSThread()

	base, err := installBase()
	if err != nil {
		fail(err)
		return
	}
	cmderRoot, err := installCmder(base)
	if err != nil {
		fail(err)
		return
	}

	runtimeDir := filepath.Join(base, "runtime", electronVersion)
	runtimeExe := filepath.Join(runtimeDir, "GoTinkerRuntime.exe")

	if !runtimeReady(runtimeDir, runtimeExe) {
		if err := runRuntimeSetup(runtimeDir); err != nil {
			fail(err)
			return
		}
	}

	appDir, err := installApp(base)
	if err != nil {
		fail(err)
		return
	}
	if err := setExecutableIcon(runtimeExe, filepath.Join(appDir, "assets", "app.ico")); err != nil {
		fail(fmt.Errorf("não foi possível aplicar o ícone do Go Tinker ao runtime: %w", err))
		return
	}
	if err := removeLegacyRuntimeApp(runtimeDir); err != nil {
		fail(err)
		return
	}
	_, err = installLauncher(appDir, filepath.Join(appDir, "assets", "app.ico"))
	if err != nil {
		fail(fmt.Errorf("não foi possível preparar o launcher do Go Tinker: %w", err))
		return
	}
	arguments := append([]string{appDir}, os.Args[1:]...)
	cmd := exec.Command(runtimeExe, arguments...)
	cmd.Dir = runtimeDir
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.EqualFold(key, "ELECTRON_RUN_AS_NODE") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	cmd.Env = append(cmd.Env, "GOTINKER_CMDER_ROOT="+cmderRoot)
	if err := cmd.Start(); err != nil {
		fail(fmt.Errorf("não foi possível iniciar o Go Tinker: %w", err))
	}
}

func installLauncher(appDir, iconPath string) (string, error) {
	launcherPath := filepath.Join(appDir, "GoTinkerLauncher.exe")
	sourcePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	sourceAbs, sourceErr := filepath.Abs(sourcePath)
	targetAbs, targetErr := filepath.Abs(launcherPath)
	if sourceErr != nil || targetErr != nil {
		return "", errors.Join(sourceErr, targetErr)
	}
	if !strings.EqualFold(sourceAbs, targetAbs) {
		source, err := os.Open(sourcePath)
		if err != nil {
			return "", err
		}
		tempPath := filepath.Join(appDir, fmt.Sprintf(".GoTinkerLauncher.installing-%d.exe", os.Getpid()))
		backupPath := filepath.Join(appDir, fmt.Sprintf(".GoTinkerLauncher.previous-%d.exe", os.Getpid()))
		_ = os.Remove(tempPath)
		_ = os.Remove(backupPath)
		output, err := os.Create(tempPath)
		if err != nil {
			_ = source.Close()
			return "", err
		}
		_, copyErr := io.Copy(output, source)
		closeOutputErr := output.Close()
		closeSourceErr := source.Close()
		if copyErr != nil || closeOutputErr != nil || closeSourceErr != nil {
			_ = os.Remove(tempPath)
			if copyErr != nil {
				return "", copyErr
			}
			if closeOutputErr != nil {
				return "", closeOutputErr
			}
			return "", closeSourceErr
		}
		if _, err := os.Stat(launcherPath); err == nil {
			if err := os.Rename(launcherPath, backupPath); err != nil {
				_ = os.Remove(tempPath)
				return "", err
			}
		}
		if err := os.Rename(tempPath, launcherPath); err != nil {
			_ = os.Remove(tempPath)
			_ = os.Rename(backupPath, launcherPath)
			return "", err
		}
		_ = os.Remove(backupPath)
	}
	if err := setExecutableIcon(launcherPath, iconPath); err != nil {
		return "", err
	}
	return launcherPath, nil
}
func setExecutableIcon(executablePath, iconPath string) error {
	icon, err := os.ReadFile(iconPath)
	if err != nil {
		return err
	}
	if len(icon) < 22 || binary.LittleEndian.Uint16(icon[0:2]) != 0 || binary.LittleEndian.Uint16(icon[2:4]) != 1 || binary.LittleEndian.Uint16(icon[4:6]) != 1 {
		return errors.New("arquivo ICO inválido")
	}
	imageSize := int(binary.LittleEndian.Uint32(icon[14:18]))
	imageOffset := int(binary.LittleEndian.Uint32(icon[18:22]))
	if imageSize < 1 || imageOffset < 22 || imageOffset+imageSize > len(icon) {
		return errors.New("dados do ícone inválidos")
	}

	hash := sha256.Sum256(icon)
	markerPath := executablePath + ".gotinker-icon"
	if marker, readErr := os.ReadFile(markerPath); readErr == nil && strings.TrimSpace(string(marker)) == hex.EncodeToString(hash[:]) {
		notifyWindowsIconChange()
		return nil
	}

	group := make([]byte, 20)
	copy(group[:6], icon[:6])
	copy(group[6:14], icon[6:14])
	binary.LittleEndian.PutUint32(group[14:18], uint32(imageSize))
	binary.LittleEndian.PutUint16(group[18:20], 1)
	image := icon[imageOffset : imageOffset+imageSize]

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

	for _, language := range []uintptr{0, 0x0409} {
		if result, _, updateErr := update.Call(handle, 3, 1, language, uintptr(unsafe.Pointer(&image[0])), uintptr(len(image))); result == 0 {
			if updateErr != syscall.Errno(0) {
				return updateErr
			}
			return errors.New("falha ao atualizar o recurso do ícone")
		}
		if result, _, updateErr := update.Call(handle, 14, 1, language, uintptr(unsafe.Pointer(&group[0])), uintptr(len(group))); result == 0 {
			if updateErr != syscall.Errno(0) {
				return updateErr
			}
			return errors.New("falha ao atualizar o grupo do ícone")
		}
	}
	if result, _, callErr := finish.Call(handle, 0); result == 0 {
		return callErr
	}
	failed = false
	notifyWindowsIconChange()
	return os.WriteFile(markerPath, []byte(hex.EncodeToString(hash[:])), 0o644)
}

func notifyWindowsIconChange() {
	shell32 := syscall.NewLazyDLL("shell32.dll")
	shell32.NewProc("SHChangeNotify").Call(0x08000000, 0, 0, 0)
}

func removeLegacyRuntimeApp(runtimeDir string) error {
	root, err := filepath.Abs(runtimeDir)
	if err != nil {
		return err
	}
	legacyApp := filepath.Join(root, "resources", "app")
	legacy, err := filepath.Abs(legacyApp)
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(root, legacy)
	if err != nil || relative == "." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) || relative == ".." {
		return fmt.Errorf("caminho legado do runtime inválido")
	}
	if _, err := os.Stat(legacy); errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err := os.RemoveAll(legacy); err != nil {
		return fmt.Errorf("não foi possível remover a aplicação antiga do runtime: %w", err)
	}
	return nil
}

func installBase() (string, error) {
	local := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if local == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		local = filepath.Join(home, "AppData", "Local")
	}

	base := filepath.Join(local, "GoTinker")
	if err := os.MkdirAll(base, 0o755); err != nil {
		return "", err
	}

	return base, nil
}

func runtimeReady(runtimeDir, runtimeExe string) bool {
	if _, err := os.Stat(runtimeExe); err != nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(runtimeDir, "resources.pak")); err != nil {
		return false
	}
	return true
}
