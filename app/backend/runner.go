package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

var runnerMu sync.Mutex

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxCodeBytes+256*1024)
	var req runRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, runResponse{ExitCode: -1, Error: "requisição inválida"})
		return
	}
	project, err := normalizeProject(req.Project)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, runResponse{ExitCode: -1, Error: err.Error()})
		return
	}
	code := req.Code
	if strings.TrimSpace(code) == "" {
		writeJSON(w, http.StatusBadRequest, runResponse{ExitCode: -1, Error: "digite algum código"})
		return
	}
	if len(code) > maxCodeBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, runResponse{ExitCode: -1, Error: "código muito grande"})
		return
	}
	envelope := map[string]any{
		"code":          makeEvaluable(code),
		"vars":          nonNilMap(req.Variables),
		"previewParams": nonNilMap(req.PreviewParams),
	}
	remote := isRemoteProject(project)
	var php, runnerPath string
	if !remote {
		if php, err = phpBinary(); err != nil {
			writeJSON(w, http.StatusBadRequest, runResponse{ExitCode: -1, Error: err.Error()})
			return
		}
		if runnerPath, err = ensureRunner(); err != nil {
			writeJSON(w, http.StatusInternalServerError, runResponse{ExitCode: -1, Error: err.Error()})
			return
		}
	}

	timeout := time.Duration(envInt("GO_TINKER_TIMEOUT_SECONDS", 120)) * time.Second
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	started := time.Now()
	var stdout, stderr bytes.Buffer
	var runErr error
	if remote {
		id, root, _ := parseRemoteProject(project)
		envelope["project"] = root
		out, errOut, err := sshExecPHP(ctx, id, remoteRunnerScript(envelope))
		stdout.Write(out)
		stderr.Write(errOut)
		runErr = err
	} else {
		raw, _ := json.Marshal(envelope)
		cmd := exec.CommandContext(ctx, php, runnerPath, project)
		configureHidden(cmd)
		cmd.Dir = project
		cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor", "FORCE_COLOR=1", "COLUMNS=160")
		cmd.Stdin = bytes.NewReader(raw)
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr
		runErr = cmd.Run()
	}
	duration := time.Since(started).Milliseconds()

	if ctx.Err() == context.DeadlineExceeded {
		writeJSON(w, http.StatusOK, runResponse{
			Output: strings.TrimSpace(stdout.String() + "\n" + stderr.String()), ExitCode: -1,
			DurationMS: duration, Error: fmt.Sprintf("execução excedeu %d segundos", int(timeout.Seconds())),
		})
		return
	}
	if r.Context().Err() != nil {
		return
	}

	parsed, parseErr := parseRunnerPayload(stdout.String())
	if parseErr != nil {
		combined := strings.TrimSpace(stdout.String())
		if extra := strings.TrimSpace(stderr.String()); extra != "" {
			combined = strings.TrimSpace(combined + "\n" + extra)
		}
		writeJSON(w, http.StatusOK, runResponse{
			Output: combined, ExitCode: exitCode(runErr), DurationMS: duration,
			Error: firstNonEmpty(errorString(runErr), parseErr.Error()),
		})
		return
	}
	if extra := strings.TrimSpace(stderr.String()); extra != "" {
		parsed.Output = strings.TrimSpace(parsed.Output + "\n" + extra)
	}
	parsed.DurationMS = duration
	parsed.ExitCode = exitCode(runErr)
	if runErr != nil && parsed.Error == "" {
		parsed.Error = runErr.Error()
	}
	if !parsed.OK && parsed.ExitCode == 0 {
		parsed.ExitCode = 1
	}
	writeJSON(w, http.StatusOK, parsed)
}

func nonNilMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

func parseRunnerPayload(stdout string) (runResponse, error) {
	const marker = "__GOTINKER_PAYLOAD__"
	idx := strings.LastIndex(stdout, marker)
	if idx < 0 {
		return runResponse{}, errors.New("o executor não retornou um resultado reconhecível")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(stdout[idx+len(marker):]))
	if err != nil {
		return runResponse{}, errors.New("não foi possível decodificar a resposta")
	}
	var result runResponse
	if err := json.Unmarshal(raw, &result); err != nil {
		return runResponse{}, errors.New("não foi possível interpretar a resposta")
	}
	if prefix := strings.TrimSpace(stdout[:idx]); prefix != "" {
		result.Output = strings.TrimSpace(prefix + "\n" + result.Output)
	}
	return result, nil
}

func ensureRunner() (string, error) {
	runnerMu.Lock()
	defer runnerMu.Unlock()
	dir := filepath.Join(cacheDir, "runner")
	path := filepath.Join(dir, "runner-v4.php")
	data := []byte(phpRunner)
	if current, err := os.ReadFile(path); err == nil && bytes.Equal(current, data) {
		return path, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("não foi possível preparar o executor PHP: %w", err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", fmt.Errorf("não foi possível preparar o executor PHP: %w", err)
	}
	return path, nil
}

const phpRunner = `<?php
$input = isset($gotinkerInput) && is_array($gotinkerInput) ? $gotinkerInput : json_decode((string) stream_get_contents(STDIN), true);
if (!is_array($input)) $input = [];
$project = rtrim((string) ($input['project'] ?? ($argv[1] ?? '')), "\\/");
$code = (string) ($input['code'] ?? '');
$previewParams = is_array($input['previewParams'] ?? null) ? $input['previewParams'] : [];
$variables = [];
foreach ((is_array($input['vars'] ?? null) ? $input['vars'] : []) as $name => $raw) {
    $name = ltrim((string) $name, '$');
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name) || $name === 'this') continue;
    $raw = (string) $raw;
    $decoded = json_decode($raw, true);
    $variables[$name] = (trim($raw) !== '' && json_last_error() === JSON_ERROR_NONE) ? $decoded : $raw;
}
$started = microtime(true);
$payload = ['ok' => false, 'output' => '', 'json' => '', 'resultType' => '', 'exitCode' => 0, 'durationMs' => 0, 'error' => ''];
$gotinkerDump = static function ($value): string {
    if ($value === null) return '';
    ob_start();
    if (class_exists(Symfony\Component\VarDumper\Dumper\CliDumper::class) && class_exists(Symfony\Component\VarDumper\Cloner\VarCloner::class)) {
        $cloner = new Symfony\Component\VarDumper\Cloner\VarCloner();
        $dumper = new Symfony\Component\VarDumper\Dumper\CliDumper('php://output');
        $dumper->setColors(true);
        $dumper->dump($cloner->cloneVar($value));
    } else {
        var_dump($value);
    }
    return (string) ob_get_clean();
};
try {
    if ($project === '' || !is_file($project . DIRECTORY_SEPARATOR . 'artisan')) {
        throw new RuntimeException('Projeto Laravel inválido.');
    }
    @chdir($project);
    require $project . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    $app = require $project . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php';
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    $gotinkerEval = static function (string $__gotinkerCode, array $__gotinkerVars) {
        extract($__gotinkerVars, EXTR_SKIP);
        unset($__gotinkerVars);
        return eval($__gotinkerCode);
    };
    $captured = '';
    ob_start();
    try {
        $result = $gotinkerEval($code, $variables);
        $captured = (string) ob_get_clean();
    } catch (Throwable $e) {
        $captured = (string) ob_get_clean();
        throw $e;
    }

    $payload['ok'] = true;
    $payload['resultType'] = get_debug_type($result);
    $dump = $gotinkerDump($result);
    $payload['output'] = trim($captured . (($captured !== '' && $dump !== '') ? "\n" : '') . $dump);

    $htmlPattern = '/^\s*(?:<!doctype\s+html|<html\b|<(?:div|main|section|article|svg|img|table|form|h[1-6])\b)/i';
    if (is_string($result) && preg_match($htmlPattern, $result)) {
        $payload['previewHtml'] = $result;
    } elseif ($result instanceof \Symfony\Component\HttpFoundation\Response) {
        $contentType = strtolower((string) $result->headers->get('Content-Type', ''));
        $content = (string) $result->getContent();
        $payload['previewData'] = base64_encode($content);
        $payload['previewMime'] = $contentType ?: 'text/html; charset=utf-8';
        $payload['previewStatus'] = $result->getStatusCode();
        if (str_contains($contentType, 'text/html') || preg_match($htmlPattern, $content)) {
            $payload['previewHtml'] = $content;
        }
    }

    if ($result instanceof \Illuminate\Routing\Route) {
        $methods = $result->methods();
        $method = in_array('GET', $methods, true) ? 'GET' : ($methods[0] ?? 'GET');
        $uri = $result->uri();
        preg_match_all('/\{([^}?]+)(\?)?\}/', $uri, $matches, PREG_SET_ORDER);
        $routeParameters = [];
        $missingParameters = [];
        foreach ($matches as $match) {
            $parameterName = $match[1];
            $optional = ($match[2] ?? '') === '?';
            $routeParameters[] = ['name' => $parameterName, 'optional' => $optional];
            if (!$optional && trim((string) ($previewParams[$parameterName] ?? '')) === '') {
                $missingParameters[] = $parameterName;
            }
        }
        $payload['previewRoute'] = ['uri' => $uri, 'method' => $method, 'parameters' => $routeParameters, 'missing' => $missingParameters];
        if ($method === 'GET' && !$missingParameters) {
            $path = preg_replace_callback('/\{([^}?]+)(\?)?\}/', function ($match) use ($previewParams) {
                $value = trim((string) ($previewParams[$match[1]] ?? ''));
                return $value === '' ? '' : rawurlencode($value);
            }, $uri);
            $path = preg_replace('~/+~', '/', '/' . trim((string) $path, '/'));
            $request = \Illuminate\Http\Request::create($path, $method);
            $httpKernel = $app->make(\Illuminate\Contracts\Http\Kernel::class);
            $response = $httpKernel->handle($request);
            $content = (string) $response->getContent();
            $contentType = strtolower((string) $response->headers->get('Content-Type', ''));
            $payload['previewData'] = base64_encode($content);
            $payload['previewMime'] = $contentType ?: 'text/html; charset=utf-8';
            $payload['previewStatus'] = $response->getStatusCode();
            if (str_contains($contentType, 'text/html')) {
                $payload['previewHtml'] = $content;
            }
            $httpKernel->terminate($request, $response);
        }
    }

    try {
        $jsonValue = $result;
        if (is_object($result) && method_exists($result, 'toArray')) {
            $jsonValue = $result->toArray();
        }
        if (is_array($jsonValue) || is_scalar($jsonValue) || $jsonValue instanceof JsonSerializable) {
            $encoded = json_encode($jsonValue, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $payload['json'] = $encoded === 'null' ? '' : $encoded;
        }
    } catch (Throwable $ignore) {
        $payload['json'] = '';
    }
} catch (Throwable $e) {
    $payload['ok'] = false;
    $payload['resultType'] = get_class($e);
    $payload['error'] = get_class($e) . ': ' . $e->getMessage();
    $runnerFile = __FILE__;
    $where = static function (string $file, int $line) use ($project): string {
        if (str_contains($file, "eval()'d code")) return 'tinker:' . $line;
        if ($project !== '' && stripos($file, $project . DIRECTORY_SEPARATOR) === 0) $file = substr($file, strlen($project) + 1);
        return str_replace('\\', '/', $file) . ':' . $line;
    };
    if (str_contains($e->getFile(), "eval()'d code")) {
        $payload['errorLine'] = $e->getLine();
    }
    $frames = [];
    foreach ($e->getTrace() as $frame) {
        $file = (string) ($frame['file'] ?? '');
        if ($file === $runnerFile) continue;
        $call = ($frame['class'] ?? '') . ($frame['type'] ?? '') . ($frame['function'] ?? '') . '()';
        $frames[] = "\033[90m#" . count($frames) . "\033[0m " . ($file !== '' ? $where($file, (int) ($frame['line'] ?? 0)) . ' ' : '') . "\033[36m" . $call . "\033[0m";
        if (count($frames) >= 40) break;
    }
    $payload['output'] = trim(($captured ?? '') . "\n" . "\033[31;1m" . get_class($e) . "\033[0m\n"
        . $e->getMessage() . "\n\n"
        . "\033[90mat\033[0m " . $where($e->getFile(), $e->getLine()) . "\n"
        . implode("\n", $frames));
}
$payload['durationMs'] = (int) round((microtime(true) - $started) * 1000);
$payload['memoryBytes'] = memory_get_peak_usage(true);
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
echo "__GOTINKER_PAYLOAD__" . base64_encode($json ?: '{}');
`

func makeEvaluable(code string) string {
	left := strings.TrimLeft(code, " \t\r\n")
	if strings.HasPrefix(left, "<?php") {
		at := len(code) - len(left)
		code = code[:at] + "     " + code[at+5:]
	}
	code = strings.TrimRight(code, " \t\r\n")
	code = strings.TrimRight(strings.TrimSuffix(code, "?>"), " \t\r\n")
	if strings.TrimSpace(code) == "" {
		return code
	}
	semis := topLevelSemicolons(code)
	if len(semis) == 0 {
		lead, body := splitLeading(code)
		if looksLikeExpression(body) {
			return lead + "return (" + body + "\n);"
		}
		return code
	}
	lastSemi := semis[len(semis)-1]
	if lastSemi != len(code)-1 {
		tail := code[lastSemi+1:]
		lead, expr := splitLeading(tail)
		if strings.HasSuffix(expr, "}") || !looksLikeExpression(expr) {
			return code
		}
		return code[:lastSemi+1] + lead + "return (" + expr + "\n);"
	}
	prev := -1
	if len(semis) > 1 {
		prev = semis[len(semis)-2]
	}
	lead, expr := splitLeading(code[prev+1 : lastSemi])
	if strings.TrimSpace(expr) == "" || !looksLikeExpression(expr) {
		return code
	}
	return code[:prev+1] + lead + "return (" + expr + "\n);"
}

func splitLeading(s string) (string, string) {
	trimmed := strings.TrimLeft(s, " \t\r\n")
	return s[:len(s)-len(trimmed)], trimmed
}

func stripLeadingComments(s string) string {
	for {
		s = strings.TrimLeft(s, " \t\r\n")
		switch {
		case strings.HasPrefix(s, "//") || strings.HasPrefix(s, "#") && !strings.HasPrefix(s, "#["):
			nl := strings.IndexByte(s, '\n')
			if nl < 0 {
				return ""
			}
			s = s[nl+1:]
		case strings.HasPrefix(s, "/*"):
			end := strings.Index(s, "*/")
			if end < 0 {
				return ""
			}
			s = s[end+2:]
		default:
			return s
		}
	}
}

func looksLikeExpression(s string) bool {
	s = stripLeadingComments(s)
	if strings.TrimSpace(s) == "" {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(s))
	bad := []string{
		"if ", "if(", "foreach ", "foreach(", "for ", "for(", "while ", "while(", "switch ", "switch(",
		"function ", "class ", "interface ", "trait ", "enum ", "try ", "try{", "return ", "throw ",
		"echo ", "print ", "unset ", "include ", "include_once ", "require ", "require_once ", "namespace ",
		"use ", "declare ", "do ", "break", "continue",
	}
	for _, prefix := range bad {
		if strings.HasPrefix(lower, prefix) {
			return false
		}
	}
	return true
}
func topLevelSemicolons(s string) []int {
	var out []int
	paren, bracket, brace := 0, 0, 0
	state := byte(0)
	escaped := false

	for i := 0; i < len(s); i++ {
		c := s[i]
		var n byte
		if i+1 < len(s) {
			n = s[i+1]
		}

		switch state {
		case 1, 2, 3:
			if escaped {
				escaped = false
				continue
			}
			if c == '\\' {
				escaped = true
				continue
			}
			if (state == 1 && c == '\'') || (state == 2 && c == '"') || (state == 3 && c == '`') {
				state = 0
			}
			continue
		case 4:
			if c == '\n' {
				state = 0
			}
			continue
		case 5:
			if c == '*' && n == '/' {
				state = 0
				i++
			}
			continue
		}

		if c == '/' && n == '/' {
			state = 4
			i++
			continue
		}
		if c == '#' {
			state = 4
			continue
		}
		if c == '/' && n == '*' {
			state = 5
			i++
			continue
		}
		if c == '\'' {
			state = 1
			continue
		}
		if c == '"' {
			state = 2
			continue
		}
		if c == '`' {
			state = 3
			continue
		}

		switch c {
		case '(':
			paren++
		case ')':
			if paren > 0 {
				paren--
			}
		case '[':
			bracket++
		case ']':
			if bracket > 0 {
				bracket--
			}
		case '{':
			brace++
		case '}':
			if brace > 0 {
				brace--
			}
		case ';':
			if paren == 0 && bracket == 0 && brace == 0 {
				out = append(out, i)
			}
		}
	}
	return out
}
func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\r' || b == '\n'
}
func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	var sshExit *ssh.ExitError
	if errors.As(err, &sshExit) {
		return sshExit.ExitStatus()
	}
	return -1
}
func errorString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
