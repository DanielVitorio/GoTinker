//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	electronVersion = "44.5.1"
	appVersion      = "1.3.4"
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

	cmd := exec.Command(runtimeExe, appDir)
	cmd.Dir = runtimeDir
	if err := cmd.Start(); err != nil {
		fail(fmt.Errorf("não foi possível iniciar o Go Tinker: %w", err))
	}
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
