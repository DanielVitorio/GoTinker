//go:build windows

package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const electronSHA256 = "9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db"

var electronURLs = []string{
	"https://mirrors.huaweicloud.com/electron/44.5.1/electron-v44.5.1-win32-x64.zip",
	"https://github.com/electron/electron/releases/download/v44.5.1/electron-v44.5.1-win32-x64.zip",
	"https://downloads.sourceforge.net/project/electron.mirror/v44.5.1/electron-v44.5.1-win32-x64.zip",
}

type transferProgress struct {
	Status     string
	Detail     string
	Source     string
	Downloaded int64
	Total      int64
	Speed      float64
	Percent    int
}

type progressReporter func(transferProgress)

func runRuntimeSetup(runtimeDir string) error {
	window, err := newProgressWindow()
	if err != nil {
		return installElectron(runtimeDir, nil)
	}

	go func() {
		setupErr := installElectron(runtimeDir, window.update)
		window.finish(setupErr)
	}()

	window.run()
	return window.result()
}

func installElectron(runtimeDir string, report progressReporter) error {
	base := filepath.Dir(runtimeDir)
	if err := os.MkdirAll(base, 0o755); err != nil {
		return err
	}

	archive := filepath.Join(base, "electron-"+electronVersion+".zip")
	_ = os.Remove(archive)

	var lastErr error
	for index, source := range electronURLs {
		if report != nil {
			report(transferProgress{
				Status: "Baixando o runtime desktop",
				Detail: fmt.Sprintf("Fonte %d de %d", index+1, len(electronURLs)),
				Source: sourceHost(source),
			})
		}

		if err := download(source, archive, report); err != nil {
			lastErr = err
			_ = os.Remove(archive)
			continue
		}

		if report != nil {
			report(transferProgress{
				Status:  "Verificando o download",
				Detail:  "Validando a integridade do runtime",
				Percent: 100,
			})
		}

		if err := verifySHA256(archive, electronSHA256); err != nil {
			lastErr = err
			_ = os.Remove(archive)
			continue
		}

		lastErr = nil
		break
	}

	if lastErr != nil {
		return fmt.Errorf("não foi possível baixar o runtime do aplicativo: %w", lastErr)
	}

	if report != nil {
		report(transferProgress{
			Status:  "Instalando o runtime",
			Detail:  "Extraindo os arquivos do aplicativo",
			Percent: 100,
		})
	}

	tempDir := runtimeDir + ".installing"
	_ = os.RemoveAll(tempDir)
	if err := os.MkdirAll(tempDir, 0o755); err != nil {
		return err
	}

	if err := unzip(archive, tempDir); err != nil {
		_ = os.RemoveAll(tempDir)
		return err
	}

	electronExe := filepath.Join(tempDir, "electron.exe")
	if _, err := os.Stat(electronExe); err != nil {
		_ = os.RemoveAll(tempDir)
		return errors.New("runtime baixado não contém electron.exe")
	}

	if err := os.Rename(electronExe, filepath.Join(tempDir, "GoTinkerRuntime.exe")); err != nil {
		_ = os.RemoveAll(tempDir)
		return err
	}

	_ = os.RemoveAll(runtimeDir)
	if err := os.Rename(tempDir, runtimeDir); err != nil {
		return err
	}

	_ = os.Remove(archive)

	if report != nil {
		report(transferProgress{
			Status:  "Tudo pronto",
			Detail:  "Abrindo o Go Tinker",
			Percent: 100,
		})
	}

	time.Sleep(350 * time.Millisecond)
	return nil
}

func installApp(base string) (string, error) {
	appDir := filepath.Join(base, "app", appVersion)
	marker := filepath.Join(appDir, ".ready")

	if appReady(appDir, marker) {
		return appDir, nil
	}

	tempDir := filepath.Join(base, "app", fmt.Sprintf(".%s.installing-%d", appVersion, os.Getpid()))
	_ = os.RemoveAll(tempDir)

	if err := os.MkdirAll(filepath.Join(tempDir, "backend"), 0o755); err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Join(tempDir, "assets"), 0o755); err != nil {
		return "", err
	}

	files := map[string]string{
		"payload/package.json":                 "package.json",
		"payload/main.js":                      "main.js",
		"payload/preload.js":                   "preload.js",
		"payload/backend/gotinker-backend.exe": filepath.Join("backend", "gotinker-backend.exe"),
		"payload/assets/app.ico":               filepath.Join("assets", "app.ico"),
	}

	for source, relative := range files {
		data, err := payload.ReadFile(source)
		if err != nil {
			_ = os.RemoveAll(tempDir)
			return "", err
		}

		target := filepath.Join(tempDir, relative)
		if err := os.WriteFile(target, data, 0o755); err != nil {
			_ = os.RemoveAll(tempDir)
			return "", err
		}
	}

	if err := os.WriteFile(filepath.Join(tempDir, ".ready"), []byte(appVersion), 0o644); err != nil {
		_ = os.RemoveAll(tempDir)
		return "", err
	}

	_ = os.RemoveAll(appDir)
	if err := os.Rename(tempDir, appDir); err != nil {
		_ = os.RemoveAll(tempDir)
		return "", err
	}

	return appDir, nil
}

func appReady(appDir, marker string) bool {
	data, err := os.ReadFile(marker)
	if err != nil || strings.TrimSpace(string(data)) != appVersion {
		return false
	}

	required := []string{
		"package.json",
		"main.js",
		"preload.js",
		filepath.Join("backend", "gotinker-backend.exe"),
		filepath.Join("assets", "app.ico"),
	}

	for _, relative := range required {
		if _, err := os.Stat(filepath.Join(appDir, relative)); err != nil {
			return false
		}
	}

	return true
}

func installCmder(base string) (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", err
	}
	source := filepath.Join(filepath.Dir(executable), "cmder")
	initScript := filepath.Join(source, "vendor", "init.bat")
	destination := filepath.Join(base, "cmder")
	if info, statErr := os.Stat(initScript); statErr != nil || info.IsDir() {
		if installedInfo, installedErr := os.Stat(filepath.Join(destination, "vendor", "init.bat")); installedErr == nil && !installedInfo.IsDir() {
			return destination, nil
		}
		return "", fmt.Errorf("Cmder integrado não foi encontrado em %s", source)
	}
	version, _ := os.ReadFile(filepath.Join(source, "Version"))
	marker := filepath.Join(destination, ".gotinker-version")
	installed, _ := os.ReadFile(marker)
	if strings.TrimSpace(string(installed)) == strings.TrimSpace(string(version)) {
		if info, statErr := os.Stat(filepath.Join(destination, "vendor", "init.bat")); statErr == nil && !info.IsDir() {
			return destination, nil
		}
	}
	temp := filepath.Join(base, fmt.Sprintf(".cmder.installing-%d", os.Getpid()))
	_ = os.RemoveAll(temp)
	if err := copyCmderTree(source, temp); err != nil {
		_ = os.RemoveAll(temp)
		return "", err
	}
	config := filepath.Join(destination, "config")
	if _, statErr := os.Stat(config); statErr == nil {
		if err := copyDirectory(config, filepath.Join(temp, "config")); err != nil {
			_ = os.RemoveAll(temp)
			return "", err
		}
	} else if err := os.MkdirAll(filepath.Join(temp, "config"), 0o755); err != nil {
		_ = os.RemoveAll(temp)
		return "", err
	}
	if err := os.WriteFile(filepath.Join(temp, ".gotinker-version"), version, 0o644); err != nil {
		_ = os.RemoveAll(temp)
		return "", err
	}
	_ = os.RemoveAll(destination)
	if err := os.Rename(temp, destination); err != nil {
		_ = os.RemoveAll(temp)
		return "", err
	}
	return destination, nil
}

func copyCmderTree(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if relative == "config" || strings.HasPrefix(relative, "config"+string(os.PathSeparator)) {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		return copyFile(path, target, info.Mode().Perm())
	})
}

func copyDirectory(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		return copyFile(path, target, info.Mode().Perm())
	})
}

func copyFile(source, destination string, mode os.FileMode) error {
	if mode == 0 {
		mode = 0o644
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func download(source, target string, report progressReporter) error {
	client := &http.Client{Timeout: 30 * time.Minute}
	request, err := http.NewRequest(http.MethodGet, source, nil)
	if err != nil {
		return err
	}

	request.Header.Set("User-Agent", "GoTinker/1.1")
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", response.StatusCode)
	}

	file, err := os.Create(target)
	if err != nil {
		return err
	}

	buffer := make([]byte, 256*1024)
	total := response.ContentLength
	downloaded := int64(0)
	startedAt := time.Now()
	lastUpdate := time.Time{}
	host := sourceHost(source)

	for {
		count, readErr := response.Body.Read(buffer)
		if count > 0 {
			if _, writeErr := file.Write(buffer[:count]); writeErr != nil {
				_ = file.Close()
				return writeErr
			}

			downloaded += int64(count)
			now := time.Now()
			if report != nil && (lastUpdate.IsZero() || now.Sub(lastUpdate) >= 100*time.Millisecond || readErr == io.EOF) {
				elapsed := now.Sub(startedAt).Seconds()
				speed := float64(0)
				if elapsed > 0 {
					speed = float64(downloaded) / elapsed
				}

				percent := 0
				if total > 0 {
					percent = int(float64(downloaded) / float64(total) * 100)
					if percent > 100 {
						percent = 100
					}
				}

				report(transferProgress{
					Status:     "Baixando o runtime desktop",
					Detail:     "O download acontece somente na primeira execução",
					Source:     host,
					Downloaded: downloaded,
					Total:      total,
					Speed:      speed,
					Percent:    percent,
				})
				lastUpdate = now
			}
		}

		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			_ = file.Close()
			return readErr
		}
	}

	return file.Close()
}

func verifySHA256(path, expected string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}

	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, expected) {
		return fmt.Errorf("checksum inválido: %s", actual)
	}

	return nil
}

func unzip(path, destination string) error {
	archive, err := zip.OpenReader(path)
	if err != nil {
		return err
	}
	defer archive.Close()

	cleanDestination := filepath.Clean(destination) + string(os.PathSeparator)

	for _, entry := range archive.File {
		target := filepath.Join(destination, entry.Name)
		cleanTarget := filepath.Clean(target)

		if !strings.HasPrefix(cleanTarget+string(os.PathSeparator), cleanDestination) && cleanTarget != filepath.Clean(destination) {
			return errors.New("arquivo inválido no pacote do runtime")
		}

		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanTarget, entry.Mode()); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0o755); err != nil {
			return err
		}

		source, err := entry.Open()
		if err != nil {
			return err
		}

		destinationFile, err := os.OpenFile(cleanTarget, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, entry.Mode())
		if err != nil {
			_ = source.Close()
			return err
		}

		_, copyErr := io.Copy(destinationFile, source)
		closeDestinationErr := destinationFile.Close()
		closeSourceErr := source.Close()

		if copyErr != nil {
			return copyErr
		}
		if closeDestinationErr != nil {
			return closeDestinationErr
		}
		if closeSourceErr != nil {
			return closeSourceErr
		}
	}

	return nil
}

func sourceHost(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return value
	}
	return parsed.Host
}
