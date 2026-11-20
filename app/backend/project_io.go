package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type fileRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func handleFile(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		path := strings.TrimSpace(r.URL.Query().Get("path"))
		content, err := os.ReadFile(path)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "não foi possível abrir o arquivo"})
			return
		}
		project := findLaravelRoot(filepath.Dir(path))
		writeJSON(w, http.StatusOK, map[string]string{"path": path, "content": string(content), "project": project})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxStateSize)
	var req fileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Path) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "arquivo inválido"})
		return
	}
	if err := os.WriteFile(req.Path, []byte(req.Content), 0o600); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "não foi possível salvar o arquivo"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "path": req.Path})
}

func findLaravelRoot(path string) string {
	current, err := filepath.Abs(path)
	if err != nil {
		return ""
	}
	for {
		if info, err := os.Stat(filepath.Join(current, "artisan")); err == nil && !info.IsDir() {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}
		current = parent
	}
}
