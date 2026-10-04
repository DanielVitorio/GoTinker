package main

import (
	"embed"
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

//go:embed web/*
var webFiles embed.FS

const (
	defaultPort  = 48765
	maxCodeBytes = 512 * 1024
	maxStateSize = 8 * 1024 * 1024
)

func main() {
	initStorePaths()

	sub, err := fs.Sub(webFiles, "web")
	if err != nil {
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(sub)))
	mux.HandleFunc("/api/run", handleRun)
	mux.HandleFunc("/api/status", handleStatus)
	mux.HandleFunc("/api/fs/list", handleFSList)
	mux.HandleFunc("/api/index", handleIndex)
	mux.HandleFunc("/api/state/load", handleStateLoad)
	mux.HandleFunc("/api/state/save", handleStateSave)
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	port := envInt("GO_TINKER_PORT", defaultPort)
	ln, err := listenLocalExact(port)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	server := &http.Server{
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	if err := server.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(3)
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
}

func listenLocalExact(port int) (net.Listener, error) {
	return net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
}
