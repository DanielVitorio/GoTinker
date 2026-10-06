//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	electronVersion = "44.5.1"
	appVersion      = "1.3.10"
)

func main() {
	runtime.LockOSThread()

	base, err := installBase()
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
	if err := removeLegacyRuntimeApp(runtimeDir); err != nil {
		fail(err)
		return
	}

	cmd := exec.Command(runtimeExe, appDir)
	cmd.Dir = runtimeDir
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.EqualFold(key, "ELECTRON_RUN_AS_NODE") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	if err := cmd.Start(); err != nil {
		fail(fmt.Errorf("não foi possível iniciar o Go Tinker: %w", err))
	}
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
