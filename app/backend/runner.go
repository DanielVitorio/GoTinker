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
	"time"
)

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxCodeBytes+128*1024)
	var req runRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, runResponse{OK: false, ExitCode: -1, Error: "requisição inválida"})
		return
	}

	project, err := validateProject(req.Project)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, runResponse{OK: false, ExitCode: -1, Error: err.Error()})
		return
	}

	code := strings.TrimSpace(req.Code)
	if code == "" {
		writeJSON(w, http.StatusBadRequest, runResponse{OK: false, ExitCode: -1, Error: "digite algum código"})
		return
	}
	if len(code) > maxCodeBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, runResponse{OK: false, ExitCode: -1, Error: "código muito grande"})
		return
	}

	php, err := phpBinary()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, runResponse{OK: false, ExitCode: -1, Error: err.Error()})
		return
	}

	timeout := time.Duration(envInt("GO_TINKER_TIMEOUT_SECONDS", 120)) * time.Second
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	evalCode := makeEvaluable(code)
	runnerPath, err := ensureRunner()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, runResponse{OK: false, ExitCode: -1, Error: err.Error()})
		return
	}

	started := time.Now()
	cmd := exec.CommandContext(ctx, php, runnerPath, project)
	configureHidden(cmd)
	cmd.Dir = project
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"FORCE_COLOR=1",
		"COLUMNS=180",
	)
	cmd.Stdin = strings.NewReader(evalCode)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	duration := time.Since(started).Milliseconds()

	if ctx.Err() == context.DeadlineExceeded {
		writeJSON(w, http.StatusRequestTimeout, runResponse{
			OK: false, Output: strings.TrimSpace(stdout.String() + "\n" + stderr.String()), ExitCode: -1,
			DurationMS: duration, Error: fmt.Sprintf("execução excedeu %d segundos", int(timeout.Seconds())),
		})
		return
	}

	parsed, parseErr := parseRunnerPayload(stdout.String())
	if parseErr != nil {
		combined := strings.TrimSpace(stdout.String())
		if strings.TrimSpace(stderr.String()) != "" {
			if combined != "" {
				combined += "\n"
			}
			combined += strings.TrimSpace(stderr.String())
		}
		exit := exitCode(runErr)
		writeJSON(w, http.StatusOK, runResponse{
			OK: runErr == nil, Output: combined, ExitCode: exit, DurationMS: duration,
			Error: firstNonEmpty(errorString(runErr), parseErr.Error()),
		})
		return
	}

	if strings.TrimSpace(stderr.String()) != "" {
		if parsed.Output != "" {
			parsed.Output += "\n"
		}
		parsed.Output += strings.TrimSpace(stderr.String())
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
func parseRunnerPayload(stdout string) (runResponse, error) {
	const marker = "__GOTINKER_PAYLOAD__"
	idx := strings.LastIndex(stdout, marker)
	if idx < 0 {
		return runResponse{}, errors.New("o executor não retornou um resultado reconhecível")
	}
	encoded := strings.TrimSpace(stdout[idx+len(marker):])
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return runResponse{}, errors.New("não foi possível decodificar a resposta")
	}
	var result runResponse
	if err := json.Unmarshal(raw, &result); err != nil {
		return runResponse{}, errors.New("não foi possível interpretar a resposta")
	}
	return result, nil
}
func ensureRunner() (string, error) {
	base := filepath.Dir(store.dbPath)
	path := filepath.Join(base, "runner-v3.php")
	data := []byte(phpRunner)
	current, err := os.ReadFile(path)
	if err == nil && bytes.Equal(current, data) {
		return path, nil
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", fmt.Errorf("não foi possível preparar o executor PHP: %w", err)
	}
	return path, nil
}

const phpRunner = `<?php
$project = $argv[1] ?? '';
$project = rtrim($project, "\\/");
$started = microtime(true);
$payload = [
    'ok' => false,
    'output' => '',
    'json' => '',
    'resultType' => '',
    'exitCode' => 0,
    'durationMs' => 0,
    'error' => '',
];
try {
    if ($project === '' || !is_file($project . DIRECTORY_SEPARATOR . 'artisan')) {
        throw new RuntimeException('Projeto Laravel inválido.');
    }
    require $project . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
    $app = require $project . DIRECTORY_SEPARATOR . 'bootstrap' . DIRECTORY_SEPARATOR . 'app.php';
    $kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
    $kernel->bootstrap();

    $code = stream_get_contents(STDIN);
    $captured = '';
    ob_start();
    try {
        $result = eval($code);
        $captured = (string) ob_get_clean();
    } catch (Throwable $e) {
        $captured = (string) ob_get_clean();
        throw $e;
    }

    $payload['ok'] = true;
    $payload['resultType'] = get_debug_type($result);

    $dump = '';
    if ($result !== null) {
        ob_start();
        if (class_exists(Symfony\Component\VarDumper\Dumper\CliDumper::class) && class_exists(Symfony\Component\VarDumper\Cloner\VarCloner::class)) {
            $cloner = new Symfony\Component\VarDumper\Cloner\VarCloner();
            $dumper = new Symfony\Component\VarDumper\Dumper\CliDumper('php://output');
            $dumper->setColors(true);
            $dumper->dump($cloner->cloneVar($result));
        } else {
            var_dump($result);
        }
        $dump = (string) ob_get_clean();
    }

    $payload['output'] = trim($captured . (($captured !== '' && $dump !== '') ? "\n" : '') . $dump);

    try {
        $jsonValue = $result;
        if (is_object($result) && method_exists($result, 'toArray')) {
            $jsonValue = $result->toArray();
        }
        if (is_array($jsonValue) || is_scalar($jsonValue) || $jsonValue === null || $jsonValue instanceof JsonSerializable) {
            $encoded = json_encode($jsonValue, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $payload['json'] = $encoded === 'null' && $result !== null ? '' : $encoded;
        }
    } catch (Throwable $ignore) {
        $payload['json'] = '';
    }
} catch (Throwable $e) {
    $payload['ok'] = false;
    $payload['error'] = get_class($e) . ': ' . $e->getMessage();
    $payload['output'] = "\033[31;1m" . get_class($e) . "\033[0m\n"
        . $e->getMessage() . "\n\n"
        . "\033[90m" . $e->getFile() . ':' . $e->getLine() . "\033[0m\n"
        . $e->getTraceAsString();
}
$payload['durationMs'] = (int) round((microtime(true) - $started) * 1000);
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
echo "__GOTINKER_PAYLOAD__" . base64_encode($json ?: '{}');
`

func makeEvaluable(code string) string {
	code = strings.TrimSpace(code)
	if code == "" {
		return code
	}

	code = strings.TrimSpace(strings.TrimPrefix(code, "<?php"))
	code = strings.TrimSuffix(code, "?>")
	code = strings.TrimSpace(code)

	semis := topLevelSemicolons(code)
	trimmed := strings.TrimSpace(code)

	if len(semis) == 0 {
		if looksLikeExpression(trimmed) {
			return "return (" + trimmed + ");"
		}
		return trimmed
	}

	end := len(code)
	for end > 0 && isSpace(code[end-1]) {
		end--
	}
	if end == 0 || code[end-1] != ';' {
		return trimmed
	}

	lastSemi := semis[len(semis)-1]
	prev := -1
	if len(semis) > 1 {
		prev = semis[len(semis)-2]
	}
	expr := strings.TrimSpace(code[prev+1 : lastSemi])
	prefix := code[:prev+1]

	if expr == "" || !looksLikeExpression(expr) {
		return trimmed
	}

	if strings.TrimSpace(prefix) == "" {
		return "return (" + expr + ");"
	}
	return prefix + "\nreturn (" + expr + ");"
}
func looksLikeExpression(s string) bool {
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
