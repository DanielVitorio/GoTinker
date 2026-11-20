package main

import (
	"bytes"
	"compress/flate"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

const (
	remotePrefix     = "ssh://"
	remoteOutMarker  = "__GOTINKER_JSON__"
	maxSSHSigners    = 4
	sshDialTimeout   = 15 * time.Second
	sshKeepAlive     = 25 * time.Second
	remoteIndexFresh = 4 * time.Second
)

type sshConnection struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Platform string `json:"platform"`
	KeyPath  string `json:"keyPath,omitempty"`
	PHP      string `json:"php,omitempty"`
	HostKey  string `json:"hostKey,omitempty"`
	Secret   string `json:"secret,omitempty"`
}

type sshConnectionView struct {
	sshConnection
	HasPassword bool `json:"hasPassword"`
}

type sshError struct {
	Code        string
	Message     string
	Fingerprint string
	KeyType     string
	Trustable   bool
}

func (e *sshError) Error() string { return e.Message }

type sshClientEntry struct {
	client *ssh.Client
	sig    string
}

var (
	sshMu        sync.Mutex
	sshClients   = map[string]*sshClientEntry{}
	sshDialLocks = map[string]*sync.Mutex{}
	sshPasswords = map[string]string{}
	sshPending   = map[string]ssh.PublicKey{}
)

func isRemoteProject(project string) bool {
	return strings.HasPrefix(strings.TrimSpace(project), remotePrefix)
}

func parseRemoteProject(project string) (string, string, error) {
	rest := strings.TrimPrefix(strings.TrimSpace(project), remotePrefix)
	slash := strings.IndexByte(rest, '/')
	if slash <= 0 {
		return "", "", errors.New("projeto remoto inválido")
	}
	clean := cleanRemotePath(rest[slash:])
	if clean == "" {
		return "", "", errors.New("projeto remoto inválido")
	}
	return rest[:slash], clean, nil
}

func cleanRemotePath(p string) string {
	p = strings.ReplaceAll(strings.TrimSpace(p), "\\", "/")
	if len(p) >= 3 && p[0] == '/' && p[2] == ':' && isASCIILetter(p[1]) {
		p = p[1:]
	}
	drive := len(p) >= 2 && p[1] == ':' && isASCIILetter(p[0])
	if !drive && !strings.HasPrefix(p, "/") {
		return ""
	}
	p = path.Clean(p)
	if drive && len(p) == 2 {
		p += "/"
	}
	return p
}

func isASCIILetter(b byte) bool { return (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') }

func remoteProjectKey(id, p string) string {
	if strings.HasPrefix(p, "/") {
		return remotePrefix + id + p
	}
	return remotePrefix + id + "/" + p
}

func normalizeProject(raw string) (string, error) {
	if !isRemoteProject(raw) {
		return validateProject(raw)
	}
	id, p, err := parseRemoteProject(raw)
	if err != nil {
		return "", err
	}
	return remoteProjectKey(id, p), nil
}

func readSSHState() (map[string]json.RawMessage, []sshConnection) {
	var state map[string]json.RawMessage
	if err := json.Unmarshal(loadState(), &state); err != nil || state == nil {
		state = map[string]json.RawMessage{}
	}
	var connections []sshConnection
	_ = json.Unmarshal(state["sshConnections"], &connections)
	return state, connections
}

func writeSSHState(state map[string]json.RawMessage, connections []sshConnection) {
	if connections == nil {
		connections = []sshConnection{}
	}
	raw, _ := json.Marshal(connections)
	state["sshConnections"] = raw
	updated, _ := json.Marshal(state)
	saveState(updated)
}

func findSSHConnection(id string) (sshConnection, error) {
	_, connections := readSSHState()
	for _, c := range connections {
		if c.ID == id {
			return c, nil
		}
	}
	return sshConnection{}, &sshError{Code: "missing", Message: "conexão SSH não encontrada"}
}

func viewSSHConnection(c sshConnection) sshConnectionView {
	sshMu.Lock()
	_, memory := sshPasswords[c.ID]
	sshMu.Unlock()
	view := sshConnectionView{sshConnection: c, HasPassword: c.Secret != "" || memory}
	view.Secret, view.HostKey = "", ""
	return view
}

func handleSSHConnections(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		_, connections := readSSHState()
		views := make([]sshConnectionView, 0, len(connections))
		for _, c := range connections {
			views = append(views, viewSSHConnection(c))
		}
		writeJSON(w, http.StatusOK, map[string]any{"connections": views})
	case http.MethodPost:
		saveSSHConnection(w, r)
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		stateEditMu.Lock()
		state, connections := readSSHState()
		kept := connections[:0]
		for _, c := range connections {
			if c.ID != id {
				kept = append(kept, c)
			}
		}
		writeSSHState(state, kept)
		stateEditMu.Unlock()
		forgetSSH(id, true)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
	}
}

func saveSSHConnection(w http.ResponseWriter, r *http.Request) {
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
	c.KeyPath = strings.TrimSpace(c.KeyPath)
	c.PHP = strings.TrimSpace(c.PHP)
	if c.Name == "" || c.Host == "" || c.User == "" || c.Port < 1 || c.Port > 65535 || (c.Platform != "linux" && c.Platform != "windows") {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "preencha nome, host, usuário, porta e sistema operacional"})
		return
	}
	if c.ID == "" {
		c.ID = fmt.Sprintf("ssh-%d", time.Now().UnixNano())
	}
	c.Secret, c.HostKey = "", ""
	if req.Save && req.Password != "" {
		secret, err := protectSecret(req.Password)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
			return
		}
		c.Secret = secret
	}
	stateEditMu.Lock()
	state, connections := readSSHState()
	updated := false
	for i := range connections {
		if connections[i].ID != c.ID {
			continue
		}
		previous := connections[i]
		if req.Password == "" {
			c.Secret = previous.Secret
		}
		if strings.EqualFold(previous.Host, c.Host) && previous.Port == c.Port {
			c.HostKey = previous.HostKey
		}
		connections[i] = c
		updated = true
		break
	}
	if !updated {
		connections = append(connections, c)
	}
	writeSSHState(state, connections)
	stateEditMu.Unlock()
	forgetSSH(c.ID, req.Password != "")
	if req.Password != "" {
		sshMu.Lock()
		sshPasswords[c.ID] = req.Password
		sshMu.Unlock()
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connection": viewSSHConnection(c)})
}

func forgetSSH(id string, password bool) {
	sshMu.Lock()
	entry := sshClients[id]
	delete(sshClients, id)
	delete(sshPending, id)
	if password {
		delete(sshPasswords, id)
	}
	sshMu.Unlock()
	if entry != nil {
		_ = entry.client.Close()
	}
}

func handleSSHConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	var req struct {
		ID       string `json:"id"`
		Password string `json:"password"`
		Save     bool   `json:"save"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "conexão inválida"})
		return
	}
	if req.Password != "" {
		forgetSSH(req.ID, true)
		sshMu.Lock()
		sshPasswords[req.ID] = req.Password
		sshMu.Unlock()
		if req.Save {
			if secret, err := protectSecret(req.Password); err == nil {
				stateEditMu.Lock()
				state, connections := readSSHState()
				for i := range connections {
					if connections[i].ID == req.ID {
						connections[i].Secret = secret
					}
				}
				writeSSHState(state, connections)
				stateEditMu.Unlock()
			}
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()
	var info struct {
		PHP  string `json:"php"`
		OS   string `json:"os"`
		Home string `json:"home"`
	}
	if err := remotePHP(ctx, req.ID, remoteInfoScript, map[string]any{}, &info); err != nil {
		writeSSHError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "php": info.PHP, "os": info.OS, "home": info.Home})
}

func handleSSHTrust(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	var req struct {
		ID          string `json:"id"`
		Fingerprint string `json:"fingerprint"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "requisição inválida"})
		return
	}
	sshMu.Lock()
	key := sshPending[req.ID]
	sshMu.Unlock()
	if key == nil || ssh.FingerprintSHA256(key) != req.Fingerprint {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "a chave do servidor mudou durante a confirmação; conecte novamente"})
		return
	}
	stateEditMu.Lock()
	state, connections := readSSHState()
	found := false
	for i := range connections {
		if connections[i].ID == req.ID {
			connections[i].HostKey = strings.TrimSpace(string(ssh.MarshalAuthorizedKey(key)))
			found = true
		}
	}
	if found {
		writeSSHState(state, connections)
	}
	stateEditMu.Unlock()
	sshMu.Lock()
	delete(sshPending, req.ID)
	sshMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"ok": found})
}

func handleSSHFS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()
	var res fsListResponse
	if err := remotePHP(ctx, id, remoteFSScript, map[string]any{"path": r.URL.Query().Get("path")}, &res); err != nil {
		writeSSHError(w, err)
		return
	}
	if res.Entries == nil {
		res.Entries = []fsEntry{}
	}
	sortFSEntries(res.Entries)
	writeJSON(w, http.StatusOK, res)
}

func writeSSHError(w http.ResponseWriter, err error) {
	var se *sshError
	if errors.As(err, &se) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": se.Message, "code": se.Code, "fingerprint": se.Fingerprint, "keyType": se.KeyType, "trustable": se.Trustable})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
}

func sshPassword(c sshConnection) string {
	sshMu.Lock()
	password, ok := sshPasswords[c.ID]
	sshMu.Unlock()
	if ok {
		return password
	}
	if c.Secret != "" {
		if password, err := unprotectSecret(c.Secret); err == nil {
			return password
		}
	}
	return ""
}

func sshSignature(c sshConnection) string {
	return strings.ToLower(c.Host) + "|" + strconv.Itoa(c.Port) + "|" + c.User + "|" + c.KeyPath
}

func sshClientFor(id string) (*ssh.Client, sshConnection, error) {
	c, err := findSSHConnection(id)
	if err != nil {
		return nil, c, err
	}
	sig := sshSignature(c)
	sshMu.Lock()
	if entry := sshClients[id]; entry != nil && entry.sig == sig {
		sshMu.Unlock()
		return entry.client, c, nil
	}
	lock := sshDialLocks[id]
	if lock == nil {
		lock = &sync.Mutex{}
		sshDialLocks[id] = lock
	}
	sshMu.Unlock()

	lock.Lock()
	defer lock.Unlock()
	sshMu.Lock()
	entry := sshClients[id]
	if entry != nil && entry.sig == sig {
		sshMu.Unlock()
		return entry.client, c, nil
	}
	delete(sshClients, id)
	sshMu.Unlock()
	if entry != nil {
		_ = entry.client.Close()
	}
	client, err := dialSSH(c)
	if err != nil {
		return nil, c, err
	}
	entry = &sshClientEntry{client: client, sig: sig}
	sshMu.Lock()
	sshClients[id] = entry
	sshMu.Unlock()
	go keepAliveSSH(id, entry)
	return client, c, nil
}

func dropSSHClient(id string, client *ssh.Client) {
	sshMu.Lock()
	if entry := sshClients[id]; entry != nil && entry.client == client {
		delete(sshClients, id)
	}
	sshMu.Unlock()
	_ = client.Close()
}

func keepAliveSSH(id string, entry *sshClientEntry) {
	closed := make(chan struct{})
	go func() {
		_ = entry.client.Wait()
		close(closed)
	}()
	ticker := time.NewTicker(sshKeepAlive)
	defer ticker.Stop()
	for {
		select {
		case <-closed:
			dropSSHClient(id, entry.client)
			return
		case <-ticker.C:
			reply := make(chan error, 1)
			go func() {
				_, _, err := entry.client.SendRequest("keepalive@openssh.com", true, nil)
				reply <- err
			}()
			select {
			case err := <-reply:
				if err != nil {
					_ = entry.client.Close()
				}
			case <-time.After(15 * time.Second):
				_ = entry.client.Close()
			case <-closed:
			}
		}
	}
}

func dialSSH(c sshConnection) (*ssh.Client, error) {
	password := sshPassword(c)
	var signers []ssh.Signer
	if c.KeyPath != "" {
		signer, err := loadSigner(expandHome(c.KeyPath), password)
		if err != nil {
			return nil, &sshError{Code: "key", Message: "não foi possível usar a chave privada: " + err.Error()}
		}
		signers = append(signers, signer)
	} else {
		if conn, client := openAgent(); client != nil {
			defer conn.Close()
			if list, err := client.Signers(); err == nil {
				signers = appendSigners(signers, list...)
			}
		}
		signers = appendSigners(signers, defaultSigners(password)...)
	}
	if len(signers) > maxSSHSigners {
		signers = signers[:maxSSHSigners]
	}
	var auths []ssh.AuthMethod
	if len(signers) > 0 {
		auths = append(auths, ssh.PublicKeys(signers...))
	}
	if password != "" {
		auths = append(auths, ssh.Password(password), ssh.KeyboardInteractive(func(name, instruction string, questions []string, echos []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range answers {
				answers[i] = password
			}
			return answers, nil
		}))
	}
	if len(auths) == 0 {
		return nil, &sshError{Code: "auth", Message: "informe a senha ou configure uma chave SSH para " + c.User + "@" + c.Host}
	}
	addr := net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
	client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{User: c.User, Auth: auths, HostKeyCallback: sshHostKeyCallback(c), Timeout: sshDialTimeout})
	if err == nil {
		return client, nil
	}
	var se *sshError
	if errors.As(err, &se) {
		return nil, se
	}
	if strings.Contains(err.Error(), "unable to authenticate") {
		message := "autenticação recusada para " + c.User + "@" + c.Host + ". Confira o usuário, a senha ou a chave"
		if password == "" {
			message = "o servidor recusou as chaves SSH disponíveis. Informe a senha de " + c.User + "@" + c.Host
		}
		return nil, &sshError{Code: "auth", Message: message}
	}
	return nil, &sshError{Code: "connect", Message: "não foi possível conectar em " + addr + ": " + strings.TrimPrefix(err.Error(), "ssh: ")}
}

func appendSigners(list []ssh.Signer, more ...ssh.Signer) []ssh.Signer {
	for _, signer := range more {
		duplicate := false
		for _, existing := range list {
			if bytes.Equal(existing.PublicKey().Marshal(), signer.PublicKey().Marshal()) {
				duplicate = true
				break
			}
		}
		if !duplicate {
			list = append(list, signer)
		}
	}
	return list
}

func defaultSigners(passphrase string) []ssh.Signer {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	var out []ssh.Signer
	for _, name := range []string{"id_ed25519", "id_ecdsa", "id_rsa"} {
		if signer, err := loadSigner(filepath.Join(home, ".ssh", name), passphrase); err == nil {
			out = append(out, signer)
		}
	}
	return out
}

func loadSigner(file, passphrase string) (ssh.Signer, error) {
	raw, err := os.ReadFile(file)
	if err != nil {
		return nil, errors.New("arquivo não encontrado: " + file)
	}
	signer, err := ssh.ParsePrivateKey(raw)
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) {
		if passphrase == "" {
			return nil, errors.New("a chave tem senha; informe-a no campo senha")
		}
		return ssh.ParsePrivateKeyWithPassphrase(raw, []byte(passphrase))
	}
	if err != nil {
		return nil, errors.New("formato de chave não suportado (use OpenSSH/PEM, não .ppk)")
	}
	return signer, nil
}

func expandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[1:])
		}
	}
	return p
}

func openAgent() (io.Closer, agent.ExtendedAgent) {
	if runtime.GOOS == "windows" {
		pipe, err := os.OpenFile(`\\.\pipe\openssh-ssh-agent`, os.O_RDWR, 0)
		if err != nil {
			return nil, nil
		}
		return pipe, agent.NewClient(pipe)
	}
	socket := os.Getenv("SSH_AUTH_SOCK")
	if socket == "" {
		return nil, nil
	}
	conn, err := net.DialTimeout("unix", socket, 2*time.Second)
	if err != nil {
		return nil, nil
	}
	return conn, agent.NewClient(conn)
}

func sshHostKeyCallback(c sshConnection) ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		fingerprint := ssh.FingerprintSHA256(key)
		if known := userKnownHosts(); known != nil {
			err := known(hostname, remote, key)
			if err == nil {
				return nil
			}
			var keyErr *knownhosts.KeyError
			if errors.As(err, &keyErr) {
				for _, want := range keyErr.Want {
					if want.Key.Type() == key.Type() {
						return &sshError{Code: "hostkey-changed", Fingerprint: fingerprint, KeyType: key.Type(),
							Message: "a identidade de " + c.Host + " não confere com o seu ~/.ssh/known_hosts (" + fingerprint + "). Se o servidor foi reinstalado, remova a linha antiga desse arquivo"}
					}
				}
			}
		}
		if c.HostKey != "" {
			if trusted, _, _, _, err := ssh.ParseAuthorizedKey([]byte(c.HostKey)); err == nil {
				if bytes.Equal(trusted.Marshal(), key.Marshal()) {
					return nil
				}
				sshMu.Lock()
				sshPending[c.ID] = key
				sshMu.Unlock()
				return &sshError{Code: "hostkey-changed", Fingerprint: fingerprint, KeyType: key.Type(), Trustable: true,
					Message: "a identidade de " + c.Host + " mudou desde a última conexão"}
			}
		}
		sshMu.Lock()
		sshPending[c.ID] = key
		sshMu.Unlock()
		return &sshError{Code: "hostkey", Fingerprint: fingerprint, KeyType: key.Type(), Trustable: true,
			Message: "confirme a identidade de " + c.Host}
	}
}

func userKnownHosts() ssh.HostKeyCallback {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	file := filepath.Join(home, ".ssh", "known_hosts")
	if _, err := os.Stat(file); err != nil {
		return nil
	}
	callback, err := knownhosts.New(file)
	if err != nil {
		return nil
	}
	return callback
}

func sshSession(id string) (*ssh.Session, sshConnection, error) {
	for attempt := 0; attempt < 2; attempt++ {
		client, c, err := sshClientFor(id)
		if err != nil {
			return nil, c, err
		}
		session, err := client.NewSession()
		if err == nil {
			return session, c, nil
		}
		dropSSHClient(id, client)
	}
	return nil, sshConnection{}, &sshError{Code: "connect", Message: "a conexão SSH caiu; tente novamente"}
}

func phpCommand(c sshConnection) string {
	if php := strings.TrimSpace(c.PHP); php != "" {
		return php
	}
	return "php"
}

func sshExecPHP(ctx context.Context, id string, script []byte) ([]byte, []byte, error) {
	session, c, err := sshSession(id)
	if err != nil {
		return nil, nil, err
	}
	var stdout, stderr bytes.Buffer
	session.Stdin = bytes.NewReader(script)
	session.Stdout = &stdout
	session.Stderr = &stderr
	if err := session.Start(phpCommand(c)); err != nil {
		_ = session.Close()
		return nil, nil, err
	}
	done := make(chan error, 1)
	go func() { done <- session.Wait() }()
	select {
	case err := <-done:
		_ = session.Close()
		return stdout.Bytes(), stderr.Bytes(), err
	case <-ctx.Done():
		_ = session.Signal(ssh.SIGKILL)
		_ = session.Close()
		select {
		case <-done:
			return stdout.Bytes(), stderr.Bytes(), ctx.Err()
		case <-time.After(2 * time.Second):
			return nil, nil, ctx.Err()
		}
	}
}

func remoteScript(input any, body string) []byte {
	raw, _ := json.Marshal(input)
	return []byte("<?php\n$gotinkerInput = json_decode(base64_decode('" + base64.StdEncoding.EncodeToString(raw) + "'), true);\n" + strings.TrimPrefix(body, "<?php\n"))
}

func remotePHP(ctx context.Context, id, body string, input any, out any) error {
	stdout, stderr, err := sshExecPHP(ctx, id, remoteScript(input, remotePrelude+body))
	var se *sshError
	if errors.As(err, &se) {
		return se
	}
	text := string(stdout)
	at := strings.LastIndex(text, remoteOutMarker)
	if at < 0 || len(text) <= at+len(remoteOutMarker) {
		message := strings.TrimSpace(stripANSI(string(stderr) + "\n" + text))
		if message == "" && err != nil {
			message = err.Error()
		}
		if len(message) > 400 {
			message = message[:400] + "…"
		}
		if message == "" {
			message = "o servidor não respondeu"
		}
		return &sshError{Code: "php", Message: "falha ao executar o PHP no servidor: " + message}
	}
	payload := strings.TrimSpace(text[at+len(remoteOutMarker):])
	decoded, derr := base64.StdEncoding.DecodeString(payload[1:])
	if derr == nil && payload[0] == 'z' {
		decoded, derr = io.ReadAll(flate.NewReader(bytes.NewReader(decoded)))
	}
	if derr != nil {
		return errors.New("resposta inválida do servidor")
	}
	if err := json.Unmarshal(decoded, out); err != nil {
		return errors.New("resposta inválida do servidor")
	}
	return nil
}

const remotePrelude = `function gotinker_out($value) {
    $json = (string) json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    if (function_exists('gzdeflate')) {
        echo "\n__GOTINKER_JSON__z", base64_encode(gzdeflate($json, 6));
        return;
    }
    echo "\n__GOTINKER_JSON__j", base64_encode($json);
}
`

const remoteInfoScript = `gotinker_out(['php' => PHP_VERSION, 'os' => PHP_OS_FAMILY, 'home' => str_replace('\\', '/', (string) (getenv('HOME') ?: getenv('USERPROFILE') ?: getcwd()))]);
`

const remoteStatusScript = `$p = rtrim(str_replace('\\', '/', (string) ($gotinkerInput['project'] ?? '')), '/');
$out = ['php' => PHP_VERSION, 'isDir' => $p !== '' && is_dir($p), 'hasArtisan' => false, 'hasVendor' => false, 'laravel' => ''];
if ($out['isDir']) {
    $out['hasArtisan'] = is_file($p . '/artisan');
    $out['hasVendor'] = is_file($p . '/vendor/autoload.php');
    $app = $p . '/vendor/laravel/framework/src/Illuminate/Foundation/Application.php';
    if (is_file($app) && preg_match("/const\\s+VERSION\\s*=\\s*'([^']+)'/", (string) file_get_contents($app, false, null, 0, 65536), $m)) {
        $out['laravel'] = $m[1];
    }
}
gotinker_out($out);
`

const remoteFSScript = `$path = (string) ($gotinkerInput['path'] ?? '');
if ($path === '') {
    $path = (string) (getenv('HOME') ?: getenv('USERPROFILE') ?: getcwd());
}
$real = @realpath($path);
if ($real === false || !is_dir($real)) {
    gotinker_out(['ok' => false, 'error' => 'pasta não encontrada no servidor', 'entries' => []]);
    exit;
}
$real = str_replace('\\', '/', $real);
$names = @scandir($real);
if ($names === false) {
    gotinker_out(['ok' => false, 'error' => 'sem permissão para listar essa pasta', 'current' => $real, 'entries' => []]);
    exit;
}
$parent = str_replace('\\', '/', dirname($real));
if ($parent === $real || $parent === '.') {
    $parent = '';
}
$base = rtrim($real, '/');
$entries = [];
foreach ($names as $name) {
    if ($name === '.' || $name === '..' || $name[0] === '.') {
        continue;
    }
    $full = $base . '/' . $name;
    if (@is_dir($full)) {
        $entries[] = ['name' => $name, 'path' => $full, 'isDir' => true, 'isLaravel' => @is_file($full . '/artisan')];
        if (count($entries) >= 800) {
            break;
        }
    }
}
gotinker_out(['ok' => true, 'current' => $real, 'parent' => $parent, 'isLaravel' => @is_file($base . '/artisan'), 'entries' => $entries]);
`

const remoteReadScript = `$files = [];
foreach ((array) ($gotinkerInput['paths'] ?? []) as $p) {
    $size = @filesize($p);
    $content = ($size === false || $size > 4194304) ? false : @file_get_contents($p);
    $files[$p] = $content === false ? null : base64_encode($content);
}
gotinker_out(['ok' => true, 'files' => (object) $files]);
`

const remoteIndexScript = `$in = $gotinkerInput;
$norm = function ($p) { return rtrim(str_replace('\\', '/', (string) $p), '/'); };
$root = @realpath((string) ($in['project'] ?? ''));
if ($root === false || !is_dir($root)) {
    gotinker_out(['ok' => false, 'error' => 'pasta do projeto não encontrada no servidor']);
    exit;
}
$root = $norm($root);
$inside = function ($p, $base) { return $p === $base || strncmp($p, $base . '/', strlen($base) + 1) === 0; };
$rel = function ($p) use ($root) { return (string) substr($p, strlen($root) + 1); };
$load = function ($file) { return (array) (require $file); };
$cd = $root . '/vendor/composer/';
$stamp = [];
foreach (['autoload_psr4.php', 'autoload_classmap.php', 'installed.json'] as $f) {
    if (is_file($cd . $f)) {
        $stamp[] = $f . ':' . filemtime($cd . $f) . ':' . filesize($cd . $f);
    }
}
$stamp = $stamp ? implode('|', $stamp) : 'none';
$psr4 = is_file($cd . 'autoload_psr4.php') ? $load($cd . 'autoload_psr4.php') : [];
$skip = array_flip(['tests', 'test', 'docs', 'doc', 'examples', 'example', 'fixtures', 'fixture', 'stubs', 'benchmarks', 'benchmark', 'node_modules', 'storage']);
$isTest = function ($name) {
    foreach (explode('\\', $name) as $part) {
        if ($part === 'Tests' || $part === 'Test' || $part === 'Fixtures') return true;
    }
    return false;
};
$walk = function ($prefix, $dir, $stat) use ($skip, $isTest) {
    $out = [];
    $stack = [[$dir, []]];
    while ($stack) {
        list($current, $segments) = array_pop($stack);
        $names = @scandir($current);
        if ($names === false) continue;
        foreach ($names as $name) {
            if ($name === '.' || $name === '..') continue;
            $full = $current . '/' . $name;
            if (is_dir($full)) {
                if ($name[0] !== '.' && !isset($skip[strtolower($name)])) $stack[] = [$full, array_merge($segments, [$name])];
                continue;
            }
            if (strlen($name) < 5 || substr($name, -4) !== '.php' || $name[0] < 'A' || $name[0] > 'Z') continue;
            $parts = array_merge($segments, [substr($name, 0, -4)]);
            foreach ($parts as $part) {
                if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $part)) continue 2;
            }
            $fqcn = $prefix . implode('\\', $parts);
            if ($isTest($fqcn)) continue;
            $row = [$fqcn, $full];
            if ($stat) {
                $row[] = (int) @filemtime($full);
                $row[] = (int) @filesize($full);
            }
            $out[] = $row;
        }
    }
    return $out;
};
$vendorRoot = $root . '/vendor';
$project = [];
$seen = [];
foreach ($psr4 as $prefix => $dirs) {
    if (strncmp($prefix, 'Tests\\', 6) === 0) continue;
    foreach ((array) $dirs as $dir) {
        $dir = $norm($dir);
        if ($inside($dir, $vendorRoot) || !$inside($dir, $root)) continue;
        foreach ($walk($prefix, $dir, true) as $row) {
            $key = strtolower($row[0]);
            if (isset($seen[$key])) continue;
            $seen[$key] = true;
            $project[] = $row;
        }
    }
}
if (!$project && is_dir($root . '/app')) {
    $stack = [$root . '/app'];
    while ($stack) {
        $current = array_pop($stack);
        $names = @scandir($current);
        if ($names === false) continue;
        foreach ($names as $name) {
            if ($name === '.' || $name === '..') continue;
            $full = $current . '/' . $name;
            if (is_dir($full)) {
                if ($name[0] !== '.' && !isset($skip[strtolower($name)])) $stack[] = $full;
                continue;
            }
            if (strtolower(substr($name, -4)) !== '.php') continue;
            $head = (string) @file_get_contents($full, false, null, 0, 32768);
            if (!preg_match('/^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/m', $head, $cm)) continue;
            $ns = preg_match('/^\s*namespace\s+([^;{\s]+)/m', $head, $nm) ? trim($nm[1]) : '';
            $fqcn = $ns !== '' ? $ns . '\\' . $cm[1] : $cm[1];
            $key = strtolower($fqcn);
            if ($isTest($fqcn) || isset($seen[$key])) continue;
            $seen[$key] = true;
            $project[] = [$fqcn, $full, (int) @filemtime($full), (int) @filesize($full)];
        }
    }
}
$known = is_array($in['known'] ?? null) ? $in['known'] : [];
$kindOf = function ($path) use ($rel) {
    $text = (string) @file_get_contents($path, false, null, 0, 65536);
    if (preg_match('/^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+[A-Za-z_]/m', $text, $m) && $m[1] !== 'class') return $m[1];
    $lower = strtolower($rel($path));
    if (strpos($lower, 'app/models/') !== false || strpos($text, 'extends Model') !== false || strpos($text, 'extends Authenticatable') !== false || strpos($text, 'extends Pivot') !== false) return 'model';
    foreach (['app/jobs/' => 'job', 'app/events/' => 'event', 'app/listeners/' => 'listener', 'app/notifications/' => 'notification', 'app/mail/' => 'mail', 'app/http/controllers/' => 'controller', 'app/services/' => 'service'] as $needle => $kind) {
        if (strpos($lower, $needle) !== false) return $kind;
    }
    return strncmp($lower, 'database/', 9) === 0 ? 'database' : 'class';
};
$rows = [];
foreach ($project as $row) {
    $r = $rel($row[1]);
    $same = isset($known[$r]) && $known[$r] === $row[2] . ':' . $row[3];
    $rows[] = [$row[0], $r, $row[2], $row[3], $same ? '' : $kindOf($row[1])];
}
$vendor = null;
if ((string) ($in['stamp'] ?? '') !== $stamp) {
    $vendor = [];
    $vseen = [];
    foreach ($psr4 as $prefix => $dirs) {
        foreach ((array) $dirs as $dir) {
            $dir = $norm($dir);
            if (!$inside($dir, $vendorRoot)) continue;
            foreach ($walk($prefix, $dir, false) as $row) {
                $key = strtolower($row[0]);
                if (isset($vseen[$key])) continue;
                $vseen[$key] = true;
                $vendor[] = [$row[0], $rel($row[1])];
            }
        }
    }
    $classmap = is_file($cd . 'autoload_classmap.php') ? $load($cd . 'autoload_classmap.php') : [];
    foreach ($classmap as $name => $file) {
        $file = $norm($file);
        $key = strtolower($name);
        if (!$inside($file, $vendorRoot) || $isTest($name) || isset($vseen[$key])) continue;
        $vseen[$key] = true;
        $vendor[] = [$name, $rel($file)];
    }
}
gotinker_out(['ok' => true, 'root' => $root, 'stamp' => $stamp, 'project' => $rows, 'vendor' => $vendor]);
`

type remoteIndexResult struct {
	OK      bool     `json:"ok"`
	Error   string   `json:"error"`
	Root    string   `json:"root"`
	Stamp   string   `json:"stamp"`
	Project [][]any  `json:"project"`
	Vendor  *[][]any `json:"vendor"`
}

func rowString(row []any, i int) string {
	if i < len(row) {
		if s, ok := row[i].(string); ok {
			return s
		}
	}
	return ""
}

func rowInt(row []any, i int) int64 {
	if i < len(row) {
		if f, ok := row[i].(float64); ok {
			return int64(f)
		}
	}
	return 0
}

func buildRemoteIndex(project string, prev *projectIndex, force bool) (*projectIndex, error) {
	id, root, err := parseRemoteProject(project)
	if err != nil {
		return nil, err
	}
	knownStamp := ""
	var vendor []classRef
	if !force {
		if prev != nil {
			knownStamp, vendor = prev.stamp, prev.vendor
		} else if cache := readIndexCacheFile(project); cache != nil {
			knownStamp, vendor = cache.Stamp, cache.Vendor
		}
	}
	known := map[string]string{}
	kinds := map[string]string{}
	if prev != nil && !force {
		for _, ref := range prev.project {
			rel := strings.TrimPrefix(ref.Path, prev.root+"/")
			known[rel] = strconv.FormatInt(ref.mod, 10) + ":" + strconv.FormatInt(ref.size, 10)
			kinds[rel] = ref.Kind
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	var res remoteIndexResult
	if err := remotePHP(ctx, id, remoteIndexScript, map[string]any{"project": root, "stamp": knownStamp, "known": known}, &res); err != nil {
		return nil, err
	}
	if !res.OK {
		return nil, errors.New(firstNonEmpty(res.Error, "não foi possível indexar o projeto remoto"))
	}
	idx := &projectIndex{stamp: res.Stamp, root: res.Root, built: time.Now()}
	if res.Vendor != nil {
		vendor = make([]classRef, 0, len(*res.Vendor))
		for _, row := range *res.Vendor {
			name := rowString(row, 0)
			vendor = append(vendor, classRef{Name: name, Path: res.Root + "/" + rowString(row, 1), Kind: vendorKind(name)})
		}
		sortClassRefs(vendor)
		writeIndexCache(project, res.Stamp, nil, vendor)
	}
	idx.vendor = vendor
	for _, row := range res.Project {
		rel := rowString(row, 1)
		ref := classRef{Name: rowString(row, 0), Path: res.Root + "/" + rel, Kind: rowString(row, 4), mod: rowInt(row, 2), size: rowInt(row, 3)}
		if ref.Kind == "" {
			ref.Kind = firstNonEmpty(kinds[rel], "class")
		}
		idx.project = append(idx.project, ref)
	}
	sortProjectRefs(idx.project)
	finishIndex(idx)
	return idx, nil
}

type remoteParsed struct {
	mod    int64
	size   int64
	stamp  string
	parsed *parsedClass
}

var (
	remoteParseMu    sync.Mutex
	remoteParseCache = map[string]remoteParsed{}
)

func remoteClassLoader(ctx context.Context, project string, idx *projectIndex) func(classRef) *parsedClass {
	id, _, _ := parseRemoteProject(project)
	key := func(ref classRef) string { return project + "\x00" + ref.Path }
	lookup := func(ref classRef) (*parsedClass, bool) {
		remoteParseMu.Lock()
		entry, ok := remoteParseCache[key(ref)]
		remoteParseMu.Unlock()
		if !ok {
			return nil, false
		}
		if ref.mod != 0 || ref.size != 0 {
			return entry.parsed, entry.mod == ref.mod && entry.size == ref.size
		}
		return entry.parsed, entry.stamp == idx.stamp
	}
	fetch := func(refs []classRef) {
		paths := make([]string, 0, len(refs))
		for _, ref := range refs {
			paths = append(paths, ref.Path)
		}
		var res struct {
			Files map[string]*string `json:"files"`
		}
		if remotePHP(ctx, id, remoteReadScript, map[string]any{"paths": paths}, &res) != nil {
			return
		}
		remoteParseMu.Lock()
		defer remoteParseMu.Unlock()
		for _, ref := range refs {
			var parsed *parsedClass
			if content := res.Files[ref.Path]; content != nil {
				if raw, err := base64.StdEncoding.DecodeString(*content); err == nil {
					parsed = parsePHPClass(raw)
				}
			}
			remoteParseCache[key(ref)] = remoteParsed{mod: ref.mod, size: ref.size, stamp: idx.stamp, parsed: parsed}
		}
	}
	return func(ref classRef) *parsedClass {
		if parsed, ok := lookup(ref); ok {
			return parsed
		}
		level := []classRef{ref}
		seen := map[string]bool{strings.ToLower(ref.Name): true}
		for depth := 0; len(level) > 0 && depth < 8; depth++ {
			var missing []classRef
			for _, item := range level {
				if _, ok := lookup(item); !ok {
					missing = append(missing, item)
				}
			}
			if len(missing) > 0 {
				fetch(missing)
			}
			var next []classRef
			for _, item := range level {
				pc, _ := lookup(item)
				if pc == nil {
					continue
				}
				for _, dep := range append(append([]string{}, pc.Traits...), pc.Extends...) {
					lower := strings.ToLower(dep)
					if seen[lower] {
						continue
					}
					seen[lower] = true
					if dref, ok := idx.byName[lower]; ok {
						next = append(next, dref)
					}
				}
			}
			level = next
		}
		parsed, _ := lookup(ref)
		return parsed
	}
}

type remoteStatus struct {
	PHP        string `json:"php"`
	IsDir      bool   `json:"isDir"`
	HasArtisan bool   `json:"hasArtisan"`
	HasVendor  bool   `json:"hasVendor"`
	Laravel    string `json:"laravel"`
}

func remoteProjectStatus(ctx context.Context, project string, res *statusResponse) {
	res.Remote = true
	id, root, err := parseRemoteProject(project)
	if err != nil {
		res.Error = err.Error()
		return
	}
	var info remoteStatus
	if err := remotePHP(ctx, id, remoteStatusScript, map[string]any{"project": root}, &info); err != nil {
		res.Error = err.Error()
		var se *sshError
		if errors.As(err, &se) {
			res.SSHCode = se.Code
		}
		return
	}
	res.PHP, res.Laravel, res.HasArtisan, res.HasVendor = info.PHP, info.Laravel, info.HasArtisan, info.HasVendor
	switch {
	case !info.IsDir:
		res.Error = "pasta do projeto não encontrada no servidor"
	case !info.HasArtisan:
		res.Error = "arquivo artisan não encontrado nessa pasta do servidor"
	case !info.HasVendor:
		res.Error = "vendor/autoload.php não encontrado no servidor. Rode composer install nesse projeto"
	default:
		res.OK = true
	}
}

func remoteRunnerScript(envelope map[string]any) []byte {
	return remoteScript(envelope, phpRunner)
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}
