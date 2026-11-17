//go:build windows

package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	electronVersion = "44.5.1"
	appVersion      = "1.4.5"
	appAuthor       = "Daniel Vitório Augusto"
	appCopyright    = "© 2026 " + appAuthor + ". Uso livre, comercialização proibida."
)

func main() {
	if len(os.Args) == 4 && os.Args[1] == "--gotinker-brand" {
		if err := brandExecutable(os.Args[2], os.Args[3], versionInfo{Description: "Go Tinker", Original: "GoTinker.exe"}, false); err != nil {
			os.Exit(1)
		}
		os.Exit(0)
	}
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
	_ = brandExecutable(runtimeExe, filepath.Join(appDir, "assets", "app.ico"), versionInfo{Description: "Go Tinker", Original: "GoTinkerRuntime.exe"}, true)
	if err := removeLegacyRuntimeApp(runtimeDir); err != nil {
		fail(err)
		return
	}
	launcherPath, err := installLauncher(base, filepath.Join(appDir, "assets", "app.ico"))
	if err != nil {
		fail(fmt.Errorf("não foi possível preparar o launcher do Go Tinker: %w", err))
		return
	}
	_ = os.Remove(filepath.Join(appDir, "GoTinkerLauncher.exe"))
	_ = os.Remove(filepath.Join(appDir, "GoTinkerLauncher.exe.gotinker-icon"))
	arguments := append([]string{appDir}, os.Args[1:]...)
	cmd := exec.Command(runtimeExe, arguments...)
	cmd.Dir = runtimeDir
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if !strings.EqualFold(key, "ELECTRON_RUN_AS_NODE") {
			cmd.Env = append(cmd.Env, entry)
		}
	}
	cmd.Env = append(cmd.Env, "GOTINKER_CMDER_ROOT="+cmderRoot, "GOTINKER_LAUNCHER="+launcherPath)
	if err := cmd.Start(); err != nil {
		fail(fmt.Errorf("não foi possível iniciar o Go Tinker: %w", err))
	}
}

func installLauncher(base, iconPath string) (string, error) {
	launcherPath := filepath.Join(base, "GoTinker.exe")
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
		tempPath := filepath.Join(base, fmt.Sprintf(".GoTinker.installing-%d.exe", os.Getpid()))
		backupPath := filepath.Join(base, fmt.Sprintf(".GoTinker.previous-%d.exe", os.Getpid()))
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
	_ = brandExecutable(launcherPath, iconPath, versionInfo{Description: "Go Tinker", Original: "GoTinker.exe"}, true)
	return launcherPath, nil
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
