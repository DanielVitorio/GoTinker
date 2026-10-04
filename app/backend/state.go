package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"time"
)

func handleStateLoad(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	raw := loadState()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-GoTinker-Storage", storageMode())
	_, _ = w.Write(raw)
}
func handleStateSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxStateSize)
	raw, err := io.ReadAll(r.Body)
	if err != nil || len(raw) == 0 || !json.Valid(raw) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "estado inválido"})
		return
	}
	saveState(raw)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "storage": storageMode(), "path": store.dbPath})
}
func loadState() []byte {
	store.mu.RLock()
	if store.loaded {
		raw := append([]byte(nil), store.raw...)
		store.mu.RUnlock()
		if len(raw) > 0 {
			return raw
		}
		return []byte(`{"version":1}`)
	}
	store.mu.RUnlock()

	raw, err := readSQLiteState()
	if err != nil || len(raw) == 0 || !json.Valid(raw) {
		if fallback, ferr := os.ReadFile(store.jsonPath); ferr == nil && json.Valid(fallback) {
			raw = fallback
		} else {
			raw = []byte(`{"version":1}`)
		}
	}

	store.mu.Lock()
	store.raw = append([]byte(nil), raw...)
	store.loaded = true
	store.mu.Unlock()
	return raw
}
func saveState(raw []byte) {
	store.mu.Lock()
	store.raw = append([]byte(nil), raw...)
	store.loaded = true
	store.dirty = true
	if store.timer != nil {
		store.timer.Stop()
	}
	store.timer = time.AfterFunc(900*time.Millisecond, flushState)
	store.mu.Unlock()
}
func flushState() {
	store.mu.Lock()
	if !store.dirty {
		store.mu.Unlock()
		return
	}
	raw := append([]byte(nil), store.raw...)
	store.dirty = false
	store.mu.Unlock()

	if err := writeSQLiteState(raw); err != nil {
		_ = os.WriteFile(store.jsonPath, raw, 0o600)
	} else {
		_ = os.Remove(store.jsonPath)
	}
}
func storageMode() string {
	if nativeSQLiteAvailable() {
		return "SQLite"
	}
	return "JSON fallback"
}
func readSQLiteState() ([]byte, error) {
	if nativeSQLiteAvailable() {
		return nativeSQLiteRead(store.dbPath)
	}
	return nil, errors.New("SQLite nativo indisponível")
}
func writeSQLiteState(raw []byte) error {
	if nativeSQLiteAvailable() {
		return nativeSQLiteWrite(store.dbPath, raw)
	}
	return errors.New("SQLite nativo indisponível")
}
