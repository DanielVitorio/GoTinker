package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

func handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}

	requested := strings.TrimSpace(r.URL.Query().Get("project"))
	project, err := validateProject(requested)
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{OK: false, Project: requested, Storage: storageMode(), StoragePath: store.dbPath, Error: err.Error()})
		return
	}

	php, err := phpBinary()
	if err != nil {
		writeJSON(w, http.StatusOK, statusResponse{OK: false, Project: project, HasArtisan: true, Storage: storageMode(), StoragePath: store.dbPath, Error: err.Error()})
		return
	}

	phpVersion := commandOutput(6*time.Second, project, php, "-r", "echo PHP_VERSION;")
	laravelVersion := commandOutput(12*time.Second, project, php, "artisan", "--version")

	ok := phpVersion != "" && laravelVersion != ""
	res := statusResponse{
		OK: ok, Project: project, PHP: phpVersion, Laravel: laravelVersion, HasArtisan: true,
		Storage: storageMode(), StoragePath: store.dbPath,
	}
	if !ok {
		res.Error = "não foi possível validar PHP/Laravel nesse projeto"
	}
	writeJSON(w, http.StatusOK, res)
}
func handleFSList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}

	requested := strings.TrimSpace(r.URL.Query().Get("path"))
	res := fsListResponse{OK: true, Entries: []fsEntry{}}

	if requested == "" {
		if runtime.GOOS == "windows" {
			for c := 'A'; c <= 'Z'; c++ {
				root := fmt.Sprintf("%c:\\", c)
				if info, err := os.Stat(root); err == nil && info.IsDir() {
					res.Drives = append(res.Drives, root)
				}
			}
			if len(res.Drives) > 0 {
				res.Current = ""
				writeJSON(w, http.StatusOK, res)
				return
			}
		}
		requested = string(filepath.Separator)
	}

	abs, err := filepath.Abs(requested)
	if err != nil {
		res.OK = false
		res.Error = "caminho inválido"
		writeJSON(w, http.StatusOK, res)
		return
	}
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		res.OK = false
		res.Error = "pasta não encontrada"
		writeJSON(w, http.StatusOK, res)
		return
	}

	res.Current = abs
	parent := filepath.Dir(abs)
	if parent != abs {
		res.Parent = parent
	}

	entries, err := os.ReadDir(abs)
	if err != nil {
		res.OK = false
		res.Error = "sem permissão para listar essa pasta"
		writeJSON(w, http.StatusOK, res)
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() {
			if strings.EqualFold(filepath.Ext(name), ".php") {
				res.Entries = append(res.Entries, fsEntry{Name: name, Path: filepath.Join(abs, name), IsDir: false})
			}
			continue
		}
		if strings.HasPrefix(name, ".") && name != ".config" {
			continue
		}
		full := filepath.Join(abs, name)
		_, artisanErr := os.Stat(filepath.Join(full, "artisan"))
		res.Entries = append(res.Entries, fsEntry{Name: name, Path: full, IsDir: true, IsLaravel: artisanErr == nil})
		if len(res.Entries) >= 500 {
			break
		}
	}

	sort.Slice(res.Entries, func(i, j int) bool {
		if res.Entries[i].IsLaravel != res.Entries[j].IsLaravel {
			return res.Entries[i].IsLaravel
		}
		return strings.ToLower(res.Entries[i].Name) < strings.ToLower(res.Entries[j].Name)
	})

	writeJSON(w, http.StatusOK, res)
}
func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	project, err := validateProject(r.URL.Query().Get("project"))
	if err != nil {
		writeJSON(w, http.StatusOK, indexResponse{OK: false, Error: err.Error()})
		return
	}

	completions, err := scanProject(project)
	if err != nil {
		writeJSON(w, http.StatusOK, indexResponse{OK: false, Project: project, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, indexResponse{OK: true, Project: project, Completions: completions, Count: len(completions)})
}
func scanProject(project string) ([]completion, error) {
	roots := []string{filepath.Join(project, "app"), filepath.Join(project, "vendor")}
	var out []completion
	seen := map[string]bool{}

	for _, root := range roots {
		if info, err := os.Stat(root); err != nil || !info.IsDir() {
			continue
		}
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				base := strings.ToLower(d.Name())
				if base == "storage" || base == "node_modules" || base == "tests" || base == "test" || base == "docs" || base == "examples" || base == "example" || base == "benchmarks" || base == "benchmark" || base == "fixtures" || base == "fixture" || strings.HasPrefix(base, ".") {
					if path != root {
						return filepath.SkipDir
					}
				}
				if filepath.Clean(root) == filepath.Clean(filepath.Join(project, "vendor")) && path == root && len(d.Name()) > 0 {
					return nil
				}
				return nil
			}
			if !strings.HasSuffix(strings.ToLower(d.Name()), ".php") {
				return nil
			}
			info, err := d.Info()
			if err != nil || info.Size() > 2*1024*1024 {
				return nil
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return nil
			}
			text := string(raw)
			nsMatch := namespaceRE.FindStringSubmatch(text)
			classMatch := classRE.FindStringSubmatch(text)
			if len(classMatch) < 3 {
				return nil
			}
			namespace := ""
			if len(nsMatch) >= 2 {
				namespace = strings.TrimSpace(nsMatch[1])
			}
			short := classMatch[2]
			fqcn := short
			if namespace != "" {
				fqcn = namespace + "\\" + short
			}
			if seen[fqcn] {
				return nil
			}
			seen[fqcn] = true

			kind := classMatch[1]
			rel, _ := filepath.Rel(project, path)
			relSlash := filepath.ToSlash(rel)
			lowerPath := strings.ToLower(relSlash)
			if strings.Contains(lowerPath, "app/models/") || strings.Contains(text, "extends Model") || strings.Contains(text, "extends Authenticatable") {
				kind = "model"
			} else if strings.Contains(lowerPath, "app/http/controllers/") {
				kind = "controller"
			} else if strings.Contains(lowerPath, "app/services/") {
				kind = "service"
			} else if strings.Contains(lowerPath, "vendor/") {
				kind = "package"
			}

			methodMatches := methodRE.FindAllStringSubmatch(text, -1)
			methods := make([]string, 0, len(methodMatches))
			methodSeen := map[string]bool{}
			for _, m := range methodMatches {
				if len(m) >= 2 && !methodSeen[m[1]] {
					methodSeen[m[1]] = true
					methods = append(methods, m[1])
				}
			}
			signatures := map[string]methodSignature{}
			for _, m := range methodSignatureRE.FindAllStringSubmatch(text, -1) {
				if len(m) < 3 {
					continue
				}
				name := m[1]
				if !methodSeen[name] {
					methodSeen[name] = true
					methods = append(methods, name)
				}
				signature := methodSignature{Name: name, Parameters: strings.Join(strings.Fields(m[2]), " ")}
				if len(m) > 3 {
					signature.ReturnType = m[3]
				}
				signatures[name] = signature
			}
			for _, m := range docMethodRE.FindAllStringSubmatch(text, -1) {
				if len(m) < 4 {
					continue
				}
				name := m[2]
				if !methodSeen[name] {
					methodSeen[name] = true
					methods = append(methods, name)
				}
				if _, exists := signatures[name]; !exists {
					signatures[name] = methodSignature{Name: name, Parameters: strings.Join(strings.Fields(m[3]), " "), ReturnType: m[1]}
				}
			}
			sort.Strings(methods)
			methodDetails := make([]methodSignature, 0, len(signatures))
			for _, name := range methods {
				if signature, ok := signatures[name]; ok {
					methodDetails = append(methodDetails, signature)
				}
			}
			imports := map[string]string{}
			for _, match := range phpImportRE.FindAllStringSubmatch(text, -1) {
				alias := match[2]
				if alias == "" {
					alias = match[1][strings.LastIndex(match[1], "\\")+1:]
				}
				imports[strings.ToLower(alias)] = match[1]
			}
			traitUses := []string{}
			for _, match := range traitUseRE.FindAllStringSubmatch(text, -1) {
				for _, name := range strings.Split(match[1], ",") {
					fields := strings.Fields(name)
					if len(fields) == 0 {
						continue
					}
					name = strings.TrimSpace(fields[0])
					if strings.HasPrefix(name, "$") || strings.HasPrefix(name, "function ") || strings.HasPrefix(name, "const ") {
						continue
					}
					if imported, ok := imports[strings.ToLower(name)]; ok {
						name = imported
					} else if !strings.Contains(name, "\\") {
						name = namespace + "\\" + name
					}
					traitUses = append(traitUses, strings.Trim(name, "\\"))
				}
			}

			fillable := extractArrayKeys(text, fillableRE)
			properties := append([]string{}, fillable...)
			properties = append(properties, extractArrayKeys(text, castsArrayRE)...)
			properties = append(properties, extractArrayKeys(text, castsMethodRE)...)
			for _, match := range docPropertyRE.FindAllStringSubmatch(text, -1) {
				if len(match) >= 2 {
					properties = append(properties, match[1])
				}
			}
			properties = uniqueSorted(properties)
			fillable = uniqueSorted(fillable)

			out = append(out, completion{
				Label: fqcn, Insert: fqcn, Kind: kind, Detail: relSlash,
				Namespace: namespace, ShortName: short, Methods: methods, MethodDetails: methodDetails, TraitUses: uniqueSorted(traitUses), Properties: properties, Fillable: fillable,
			})
			return nil
		})
		if err != nil {
			return nil, err
		}
	}

	mergeTraitMethods(out)
	sort.Slice(out, func(i, j int) bool {
		ki := completionRank(out[i].Kind)
		kj := completionRank(out[j].Kind)
		if ki != kj {
			return ki < kj
		}
		return strings.ToLower(out[i].Label) < strings.ToLower(out[j].Label)
	})
	return out, nil
}

func mergeTraitMethods(completions []completion) {
	for depth := 0; depth < 6; depth++ {
		byName := make(map[string]int, len(completions))
		for index := range completions {
			byName[strings.ToLower(completions[index].Label)] = index
		}
		changed := false
		for index := range completions {
			if len(completions[index].TraitUses) == 0 {
				continue
			}
			methods := make(map[string]bool, len(completions[index].Methods))
			for _, method := range completions[index].Methods {
				methods[method] = true
			}
			details := make(map[string]methodSignature, len(completions[index].MethodDetails))
			for _, signature := range completions[index].MethodDetails {
				details[signature.Name] = signature
			}
			for _, traitName := range completions[index].TraitUses {
				traitIndex, ok := byName[strings.ToLower(traitName)]
				if !ok {
					continue
				}
				trait := completions[traitIndex]
				for _, method := range trait.Methods {
					if !methods[method] {
						completions[index].Methods = append(completions[index].Methods, method)
						methods[method] = true
						changed = true
					}
				}
				for _, signature := range trait.MethodDetails {
					if _, ok := details[signature.Name]; !ok {
						completions[index].MethodDetails = append(completions[index].MethodDetails, signature)
						details[signature.Name] = signature
					}
				}
			}
			sort.Strings(completions[index].Methods)
			sort.Slice(completions[index].MethodDetails, func(a, b int) bool {
				return completions[index].MethodDetails[a].Name < completions[index].MethodDetails[b].Name
			})
		}
		if !changed {
			return
		}
	}
}
func extractArrayKeys(text string, blockRE *regexp.Regexp) []string {
	match := blockRE.FindStringSubmatch(text)
	if len(match) < 2 {
		return nil
	}
	var out []string
	for _, item := range arrayStringRE.FindAllStringSubmatch(match[1], -1) {
		if len(item) >= 2 {
			out = append(out, strings.TrimSpace(item[1]))
		}
	}
	return out
}

func uniqueSorted(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func completionRank(kind string) int {
	switch kind {
	case "model":
		return 0
	case "service":
		return 1
	case "controller":
		return 2
	default:
		return 3
	}
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
	artisan := filepath.Join(abs, "artisan")
	if info, err := os.Stat(artisan); err != nil || info.IsDir() {
		return "", errors.New("arquivo artisan não encontrado nessa pasta")
	}
	return abs, nil
}
func phpBinary() (string, error) {
	if custom := strings.TrimSpace(os.Getenv("TINKER_PHP")); custom != "" {
		if info, err := os.Stat(custom); err == nil && !info.IsDir() {
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
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "TERM=dumb")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(stripANSI(string(out)))
}
func stripANSI(value string) string { return ansiRE.ReplaceAllString(value, "") }
