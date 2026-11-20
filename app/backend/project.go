package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	phpVersionMu    sync.Mutex
	phpVersionCache = map[string]string{}
	laravelVerRE    = regexp.MustCompile(`const\s+VERSION\s*=\s*'([^']+)'`)
	lintErrorRE     = regexp.MustCompile(`(?:PHP\s+)?(?:Parse|Fatal)\s+error:\s*(.+?)\s+in\s+.+?\s+on\s+line\s+(\d+)`)
)

func handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	requested := strings.TrimSpace(r.URL.Query().Get("project"))
	res := statusResponse{Project: requested, Storage: storageMode(), StoragePath: store.dbPath, DataDir: filepath.Dir(store.dbPath)}
	if isRemoteProject(requested) {
		if project, err := normalizeProject(requested); err != nil {
			res.Error = err.Error()
		} else {
			res.Project = project
			ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
			defer cancel()
			remoteProjectStatus(ctx, project, &res)
		}
		writeJSON(w, http.StatusOK, res)
		return
	}
	php, phpErr := phpBinary()
	if phpErr == nil {
		res.PHP = phpVersion(php)
		res.PHPPath = php
	}
	if requested == "" {
		res.OK = phpErr == nil
		if phpErr != nil {
			res.Error = phpErr.Error()
		}
		writeJSON(w, http.StatusOK, res)
		return
	}
	project, err := validateProject(requested)
	if err != nil {
		res.Error = err.Error()
		writeJSON(w, http.StatusOK, res)
		return
	}
	res.Project = project
	res.HasArtisan = true
	res.Laravel = laravelVersion(project)
	res.HasVendor = fileExists(filepath.Join(project, "vendor", "autoload.php"))
	switch {
	case phpErr != nil:
		res.Error = phpErr.Error()
	case !res.HasVendor:
		res.Error = "vendor/autoload.php não encontrado. Rode composer install nesse projeto"
	default:
		res.OK = true
	}
	writeJSON(w, http.StatusOK, res)
}

func phpVersion(php string) string {
	phpVersionMu.Lock()
	defer phpVersionMu.Unlock()
	if version, ok := phpVersionCache[php]; ok {
		return version
	}
	version := commandOutput(8*time.Second, "", php, "-n", "-r", "echo PHP_VERSION;")
	if version == "" {
		version = commandOutput(8*time.Second, "", php, "-r", "echo PHP_VERSION;")
	}
	if version != "" {
		phpVersionCache[php] = version
	}
	return version
}

func laravelVersion(project string) string {
	raw, err := readHead(filepath.Join(project, "vendor", "laravel", "framework", "src", "Illuminate", "Foundation", "Application.php"), 64*1024)
	if err != nil {
		return ""
	}
	if m := laravelVerRE.FindSubmatch(raw); len(m) >= 2 {
		return string(m[1])
	}
	return ""
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func handleFSList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	requested := strings.TrimSpace(r.URL.Query().Get("path"))
	res := fsListResponse{OK: true, Entries: []fsEntry{}}
	if runtime.GOOS == "windows" {
		for c := 'A'; c <= 'Z'; c++ {
			root := fmt.Sprintf("%c:\\", c)
			if info, err := os.Stat(root); err == nil && info.IsDir() {
				res.Drives = append(res.Drives, root)
			}
		}
	}
	if requested == "" {
		if len(res.Drives) > 0 {
			writeJSON(w, http.StatusOK, res)
			return
		}
		requested = string(filepath.Separator)
	}
	abs, err := filepath.Abs(requested)
	if err != nil {
		res.OK, res.Error = false, "caminho inválido"
		writeJSON(w, http.StatusOK, res)
		return
	}
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		res.OK, res.Error = false, "pasta não encontrada"
		writeJSON(w, http.StatusOK, res)
		return
	}
	res.Current = abs
	res.IsLaravel = fileExists(filepath.Join(abs, "artisan"))
	if parent := filepath.Dir(abs); parent != abs {
		res.Parent = parent
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		res.OK, res.Error = false, "sem permissão para listar essa pasta"
		writeJSON(w, http.StatusOK, res)
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() {
			if strings.EqualFold(filepath.Ext(name), ".php") {
				res.Entries = append(res.Entries, fsEntry{Name: name, Path: filepath.Join(abs, name)})
			}
			continue
		}
		if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "$") {
			continue
		}
		full := filepath.Join(abs, name)
		res.Entries = append(res.Entries, fsEntry{Name: name, Path: full, IsDir: true, IsLaravel: fileExists(filepath.Join(full, "artisan"))})
		if len(res.Entries) >= 800 {
			break
		}
	}
	sortFSEntries(res.Entries)
	writeJSON(w, http.StatusOK, res)
}

func sortFSEntries(entries []fsEntry) {
	sort.Slice(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.IsDir != b.IsDir {
			return a.IsDir
		}
		if a.IsLaravel != b.IsLaravel {
			return a.IsLaravel
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
}

func handleLint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxCodeBytes+16*1024)
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false})
		return
	}
	php, err := phpBinary()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "errors": []any{}})
		return
	}
	code := req.Code
	offset := 0
	trimmed := strings.TrimLeft(code, " \t\r\n")
	if !strings.HasPrefix(trimmed, "<?php") && !strings.HasPrefix(trimmed, "<?=") {
		code = "<?php\n" + code
		offset = 1
	}
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, php, "-n", "-l", "-d", "display_errors=stdout", "-d", "error_reporting=E_ALL")
	configureHidden(cmd)
	cmd.Stdin = strings.NewReader(code)
	out, _ := cmd.CombinedOutput()
	errs := []map[string]any{}
	seen := map[string]bool{}
	for _, m := range lintErrorRE.FindAllStringSubmatch(string(out), -1) {
		line, _ := strconv.Atoi(m[2])
		line -= offset
		if line < 1 {
			line = 1
		}
		key := m[1] + ":" + m[2]
		if seen[key] {
			continue
		}
		seen[key] = true
		errs = append(errs, map[string]any{"line": line, "message": strings.TrimSpace(m[1])})
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "errors": errs})
}

func validateProject(project string) (string, error) {
	project = strings.TrimSpace(project)
	if project == "" {
		return "", errors.New("selecione uma pasta de projeto Laravel")
	}
	abs, err := filepath.Abs(project)
	if err != nil {
		return "", errors.New("caminho do projeto inválido")
	}
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		return "", errors.New("pasta do projeto não encontrada")
	}
	if !fileExists(filepath.Join(abs, "artisan")) {
		return "", errors.New("arquivo artisan não encontrado nessa pasta")
	}
	return abs, nil
}

func phpBinary() (string, error) {
	if custom := strings.TrimSpace(os.Getenv("TINKER_PHP")); custom != "" {
		if fileExists(custom) {
			return custom, nil
		}
		if path, err := exec.LookPath(custom); err == nil {
			return path, nil
		}
		return "", fmt.Errorf("PHP configurado em TINKER_PHP não foi encontrado: %s", custom)
	}
	path, err := exec.LookPath("php")
	if err != nil {
		return "", errors.New("PHP não encontrado no PATH. Adicione o PHP ao PATH ou defina TINKER_PHP")
	}
	return path, nil
}

func commandOutput(timeout time.Duration, dir, name string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	configureHidden(cmd)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "TERM=dumb")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(stripANSI(string(out)))
}

func stripANSI(value string) string { return ansiRE.ReplaceAllString(value, "") }
