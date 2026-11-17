package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"

	pty "github.com/aymanbagabas/go-pty"
	"github.com/gorilla/websocket"
)

type terminalSession struct {
	process  *pty.Cmd
	terminal pty.Pty
	mu       sync.Mutex
	data     chan []byte
	done     chan struct{}
}

type terminalSize struct {
	Type string `json:"type"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

var (
	terminalSessionsMu sync.Mutex
	terminalSessions   = map[string]*terminalSession{}
	terminalUpgrader   = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			return true
		}
		parsed, err := url.Parse(origin)
		return err == nil && parsed.Host == r.Host && (parsed.Scheme == "http" || parsed.Scheme == "https")
	}}
)

func handleTerminal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "método inválido"})
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("session"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sessão inválida"})
		return
	}
	project, err := validateProject(r.URL.Query().Get("project"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	session, err := getTerminalSession(id, project)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	connection, err := terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer connection.Close()
	type terminalInput struct {
		data []byte
		err  error
	}
	input := make(chan terminalInput, 8)
	go func() {
		for {
			_, data, err := connection.ReadMessage()
			select {
			case input <- terminalInput{data: data, err: err}:
			case <-session.done:
				return
			}
			if err != nil {
				return
			}
		}
	}()
	for {
		select {
		case data := <-session.data:
			if err := connection.WriteMessage(websocket.BinaryMessage, data); err != nil {
				return
			}
		case message := <-input:
			if message.err != nil {
				return
			}
			var size terminalSize
			if json.Unmarshal(message.data, &size) == nil && size.Type == "resize" && size.Cols > 0 && size.Rows > 0 {
				_ = session.terminal.Resize(size.Rows, size.Cols)
				continue
			}
			session.mu.Lock()
			_, err := session.terminal.Write(message.data)
			session.mu.Unlock()
			if err != nil {
				return
			}
		case <-session.done:
			return
		}
	}
}

func getTerminalSession(id, project string) (*terminalSession, error) {
	terminalSessionsMu.Lock()
	defer terminalSessionsMu.Unlock()
	if session := terminalSessions[id]; session != nil {
		return session, nil
	}
	root := strings.TrimSpace(os.Getenv("GOTINKER_CMDER_ROOT"))
	if root == "" {
		if executable, err := os.Executable(); err == nil {
			root = filepath.Join(filepath.Dir(executable), "cmder")
		}
	}
	init := ""
	if root != "" {
		init = filepath.Join(root, "vendor", "init.bat")
		if info, err := os.Stat(init); err != nil || info.IsDir() {
			root = ""
			init = ""
		}
	}
	terminal, err := pty.New()
	if err != nil {
		return nil, fmt.Errorf("não foi possível preparar o terminal integrado: %w", err)
	}
	arguments := []string{"/d", "/q", "/k"}
	if init != "" {
		arguments = append(arguments, `call "`+init+`"`)
	}
	process := terminal.Command(`C:\Windows\System32\cmd.exe`, arguments...)
	process.Dir = project
	commandLine := `"C:\Windows\System32\cmd.exe" /d /q /k`
	if init != "" {
		commandLine += ` call "` + init + `"`
	}
	process.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CmdLine: commandLine}
	process.Env = os.Environ()
	if root != "" {
		process.Env = append(process.Env, "CMDER_ROOT="+root)
	}
	if err := process.Start(); err != nil {
		_ = terminal.Close()
		return nil, fmt.Errorf("não foi possível iniciar o terminal integrado: %w", err)
	}
	session := &terminalSession{process: process, terminal: terminal, data: make(chan []byte, 128), done: make(chan struct{})}
	terminalSessions[id] = session
	go func() {
		buffer := make([]byte, 8192)
		for {
			count, readErr := terminal.Read(buffer)
			if count > 0 {
				chunk := append([]byte(nil), buffer[:count]...)
				select {
				case session.data <- chunk:
				case <-session.done:
					return
				}
			}
			if readErr != nil {
				return
			}
		}
	}()
	go func() {
		_ = process.Wait()
		_ = terminal.Close()
		close(session.done)
	}()
	return session, nil
}

func handleTerminalClose(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Session string `json:"session"`
	}
	if r.Method != http.MethodPost || json.NewDecoder(r.Body).Decode(&request) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sessão inválida"})
		return
	}
	terminalSessionsMu.Lock()
	if session := terminalSessions[request.Session]; session != nil {
		delete(terminalSessions, request.Session)
		closeTerminalProcess(session)
	}
	terminalSessionsMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func handleTerminalShutdown(w http.ResponseWriter, r *http.Request) {
	terminalSessionsMu.Lock()
	for id, session := range terminalSessions {
		delete(terminalSessions, id)
		closeTerminalProcess(session)
	}
	terminalSessionsMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func closeTerminalProcess(session *terminalSession) {
	session.mu.Lock()
	if session.process.Process != nil {
		_ = session.process.Process.Kill()
	}
	session.mu.Unlock()
}
