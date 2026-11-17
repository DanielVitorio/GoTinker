package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

//go:embed web
var webFiles embed.FS

const (
	defaultPort  = 48765
	maxCodeBytes = 512 * 1024
	maxStateSize = 16 * 1024 * 1024
)

var cacheDir string

func main() {
	initStorePaths()

	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("/", staticHandler(http.FileServer(http.FS(sub))))
	mux.HandleFunc("/api/run", handleRun)
	mux.HandleFunc("/api/lint", handleLint)
	mux.HandleFunc("/api/status", handleStatus)
	mux.HandleFunc("/api/fs/list", handleFSList)
	mux.HandleFunc("/api/index", handleIndex)
	mux.HandleFunc("/api/class", handleClass)
	mux.HandleFunc("/api/file", handleFile)
	mux.HandleFunc("/api/terminal", handleTerminal)
	mux.HandleFunc("/api/terminal/close", handleTerminalClose)
	mux.HandleFunc("/api/terminal/shutdown", handleTerminalShutdown)
	mux.HandleFunc("/api/ssh/connections", handleSSHConnections)
	mux.HandleFunc("/api/state/load", handleStateLoad)
	mux.HandleFunc("/api/state/save", handleStateSave)
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	port := envInt("GO_TINKER_PORT", defaultPort)
	ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	go warmUp()

	server := &http.Server{
		Handler:           securityHeaders(localOnly(mux)),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	if err := server.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(3)
	}
}

func warmUp() {
	if php, err := phpBinary(); err == nil {
		phpVersion(php)
	}
	var saved struct {
		LastProject string `json:"lastProject"`
		ActiveTabID string `json:"activeTabId"`
		Tabs        []struct {
			ID      string `json:"id"`
			Project string `json:"project"`
		} `json:"tabs"`
	}
	if json.Unmarshal(loadState(), &saved) != nil {
		return
	}
	project := saved.LastProject
	for _, tab := range saved.Tabs {
		if tab.ID == saved.ActiveTabID && strings.TrimSpace(tab.Project) != "" {
			project = tab.Project
		}
	}
	if abs, err := validateProject(project); err == nil {
		_, _ = loadProjectIndex(abs, false)
	}
}

func initStorePaths() {
	base := os.Getenv("APPDATA")
	if strings.TrimSpace(base) == "" {
		if home, err := os.UserHomeDir(); err == nil {
			base = filepath.Join(home, ".gotinker")
		} else {
			base = os.TempDir()
		}
	} else {
		base = filepath.Join(base, "GoTinker")
	}
	_ = os.MkdirAll(base, 0o755)
	store.dbPath = filepath.Join(base, "gotinker.sqlite")
	store.jsonPath = filepath.Join(base, "workspace-fallback.json")

	cacheDir = filepath.Join(base, "cache")
	if local := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); local != "" {
		cacheDir = filepath.Join(local, "GoTinker", "cache")
	} else if dir, err := os.UserCacheDir(); err == nil {
		cacheDir = filepath.Join(dir, "GoTinker")
	}
	_ = os.MkdirAll(cacheDir, 0o755)
	_ = os.Remove(filepath.Join(base, "runner-v3.php"))
}
