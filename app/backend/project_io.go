package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type fileRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type sshConnection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Platform string `json:"platform"`
	Secret   string `json:"secret,omitempty"`
}

func handleSSHConnections(w http.ResponseWriter, r *http.Request) {
	var state map[string]json.RawMessage
	if err := json.Unmarshal(loadState(), &state); err != nil {
		state = map[string]json.RawMessage{}
	}
	var connections []sshConnection
	_ = json.Unmarshal(state["sshConnections"], &connections)
	if r.Method == http.MethodGet {
		for i := range connections {
			connections[i].Secret = ""
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": connections})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	var req struct {
		Connection sshConnection `json:"connection"`
		Password   string        `json:"password"`
		Save       bool          `json:"save"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "conexão inválida"})
		return
	}
	c := req.Connection
	c.Name = strings.TrimSpace(c.Name)
	c.Host = strings.TrimSpace(c.Host)
	c.User = strings.TrimSpace(c.User)
	if c.Name == "" || c.Host == "" || c.User == "" || c.Port < 1 || c.Port > 65535 || (c.Platform != "linux" && c.Platform != "windows") {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "preencha nome, host, usuário, porta e sistema operacional"})
		return
	}
	if c.ID == "" {
		c.ID = fmt.Sprintf("ssh-%d", time.Now().UnixNano())
	}
	c.Secret = ""
	if req.Save && req.Password != "" {
		secret, err := protectSecret(req.Password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		c.Secret = secret
	}
	updated := false
	for i := range connections {
		if connections[i].ID == c.ID {
			if c.Secret == "" {
				c.Secret = connections[i].Secret
			}
			connections[i] = c
			updated = true
			break
		}
	}
	if !updated {
		connections = append(connections, c)
	}
	rawConnections, _ := json.Marshal(connections)
	state["sshConnections"] = rawConnections
	updatedState, _ := json.Marshal(state)
	saveState(updatedState)
	c.Secret = ""
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connection": c})
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
