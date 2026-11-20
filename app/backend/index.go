package main

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type classRef struct {
	Name string `json:"n"`
	Path string `json:"p"`
	Kind string `json:"k"`
	mod  int64
	size int64
}

type kindEntry struct {
	mod  int64
	size int64
	kind string
}

type composerMaps struct {
	PSR4     map[string][]string `json:"psr4"`
	Classmap map[string]string   `json:"classmap"`
}

type projectIndex struct {
	stamp    string
	rev      string
	root     string
	built    time.Time
	composer *composerMaps
	vendor   []classRef
	project  []classRef
	byName   map[string]classRef
}

type indexCacheFile struct {
	Version  int           `json:"version"`
	Stamp    string        `json:"stamp"`
	Composer *composerMaps `json:"composer"`
	Vendor   []classRef    `json:"vendor"`
}

type indexCall struct {
	done chan struct{}
	idx  *projectIndex
	err  error
}

var (
	indexMu      sync.Mutex
	indexEntries = map[string]*projectIndex{}
	indexCalls   = map[string]*indexCall{}
	kindMu       sync.Mutex
	kindCache    = map[string]kindEntry{}
	identRE      = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	headNsRE     = regexp.MustCompile(`(?m)^\s*namespace\s+([^;{\s]+)`)
	headClassRE  = regexp.MustCompile(`(?m)^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)`)
)

const indexCacheVersion = 2

var skippedDirs = map[string]bool{
	"tests": true, "test": true, "docs": true, "doc": true, "examples": true, "example": true,
	"fixtures": true, "fixture": true, "stubs": true, "benchmarks": true, "benchmark": true,
	"node_modules": true, "storage": true,
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	project, err := normalizeProject(r.URL.Query().Get("project"))
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	started := time.Now()
	force := r.URL.Query().Get("force") == "1"
	idx, err := loadProjectIndex(project, force)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "project": project, "error": err.Error()})
		return
	}
	if rev := r.URL.Query().Get("rev"); !force && rev != "" && rev == idx.rev {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true, "project": project, "rev": idx.rev, "unchanged": true,
			"durationMs": time.Since(started).Milliseconds(),
		})
		return
	}
	list := make([][3]string, 0, len(idx.project)+len(idx.vendor))
	own := make(map[string]bool, len(idx.project))
	for _, ref := range idx.project {
		own[strings.ToLower(ref.Name)] = true
		list = append(list, [3]string{ref.Name, ref.Kind, "p"})
	}
	for _, ref := range idx.vendor {
		if !own[strings.ToLower(ref.Name)] {
			list = append(list, [3]string{ref.Name, ref.Kind, ""})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "project": project, "rev": idx.rev, "classes": list, "count": len(list),
		"durationMs": time.Since(started).Milliseconds(),
	})
}

func loadProjectIndex(project string, force bool) (*projectIndex, error) {
	key := strings.ToLower(filepath.Clean(project))
	remote := isRemoteProject(project)

	indexMu.Lock()
	if call, ok := indexCalls[key]; ok {
		indexMu.Unlock()
		<-call.done
		return call.idx, call.err
	}
	prev := indexEntries[key]
	if remote && !force && prev != nil && time.Since(prev.built) < remoteIndexFresh {
		indexMu.Unlock()
		return prev, nil
	}
	call := &indexCall{done: make(chan struct{})}
	indexCalls[key] = call
	indexMu.Unlock()

	if force {
		prev = nil
	}
	var idx *projectIndex
	var err error
	if remote {
		idx, err = buildRemoteIndex(project, prev, force)
	} else {
		idx, err = buildProjectIndex(project, composerStamp(project), prev, force)
	}

	indexMu.Lock()
	if err == nil {
		indexEntries[key] = idx
	}
	delete(indexCalls, key)
	indexMu.Unlock()
	call.idx, call.err = idx, err
	close(call.done)
	return idx, err
}

func cachedProjectIndex(project string) (*projectIndex, error) {
	key := strings.ToLower(filepath.Clean(project))
	indexMu.Lock()
	idx := indexEntries[key]
	indexMu.Unlock()
	if idx != nil {
		return idx, nil
	}
	return loadProjectIndex(project, false)
}

func buildProjectIndex(project, stamp string, prev *projectIndex, force bool) (*projectIndex, error) {
	idx := &projectIndex{stamp: stamp, root: project, built: time.Now()}
	switch {
	case prev != nil && prev.stamp == stamp:
		idx.composer, idx.vendor = prev.composer, prev.vendor
	default:
		if cache := readIndexCache(project, stamp); cache != nil && !force {
			idx.composer, idx.vendor = cache.Composer, cache.Vendor
		} else {
			idx.composer = readComposerMaps(project)
			if idx.composer != nil {
				idx.vendor = scanComposerVendor(project, idx.composer)
			} else {
				idx.vendor = scanFallback(filepath.Join(project, "vendor"), "package")
			}
			writeIndexCache(project, stamp, idx.composer, idx.vendor)
		}
	}
	idx.project = scanProjectClasses(project, idx.composer)
	finishIndex(idx)
	return idx, nil
}

func finishIndex(idx *projectIndex) {
	idx.rev = projectRev(idx.stamp, idx.project)
	idx.byName = make(map[string]classRef, len(idx.vendor)+len(idx.project))
	for _, ref := range idx.vendor {
		idx.byName[strings.ToLower(ref.Name)] = ref
	}
	for _, ref := range idx.project {
		idx.byName[strings.ToLower(ref.Name)] = ref
	}
}

func sortClassRefs(refs []classRef) {
	sort.Slice(refs, func(i, j int) bool { return strings.ToLower(refs[i].Name) < strings.ToLower(refs[j].Name) })
}

func sortProjectRefs(refs []classRef) {
	sort.Slice(refs, func(i, j int) bool {
		ri, rj := kindRank(refs[i].Kind), kindRank(refs[j].Kind)
		if ri != rj {
			return ri < rj
		}
		return strings.ToLower(refs[i].Name) < strings.ToLower(refs[j].Name)
	})
}

func projectRev(stamp string, refs []classRef) string {
	h := sha1.New()
	h.Write([]byte(stamp))
	for _, ref := range refs {
		h.Write([]byte("\x00" + ref.Name + "\x00" + ref.Path + "\x00" + ref.Kind + "\x00" + strconv.FormatInt(ref.mod, 10) + ":" + strconv.FormatInt(ref.size, 10)))
	}
	return hex.EncodeToString(h.Sum(nil))
}

func composerStamp(project string) string {
	parts := []string{}
	for _, name := range []string{"autoload_psr4.php", "autoload_classmap.php", "installed.json"} {
		if info, err := os.Stat(filepath.Join(project, "vendor", "composer", name)); err == nil {
			parts = append(parts, name+":"+info.ModTime().UTC().Format(time.RFC3339Nano)+":"+strconv.FormatInt(info.Size(), 10))
		}
	}
	if len(parts) == 0 {
		if info, err := os.Stat(filepath.Join(project, "vendor")); err == nil {
			return "vendor:" + info.ModTime().UTC().Format(time.RFC3339Nano)
		}
		return "none"
	}
	return strings.Join(parts, "|")
}

func indexCachePath(project string) string {
	sum := sha1.Sum([]byte(strings.ToLower(filepath.Clean(project))))
	return filepath.Join(cacheDir, "index", hex.EncodeToString(sum[:])+".json")
}

func readIndexCache(project, stamp string) *indexCacheFile {
	if cache := readIndexCacheFile(project); cache != nil && cache.Stamp == stamp {
		return cache
	}
	return nil
}

func readIndexCacheFile(project string) *indexCacheFile {
	raw, err := os.ReadFile(indexCachePath(project))
	if err != nil {
		return nil
	}
	var cache indexCacheFile
	if json.Unmarshal(raw, &cache) != nil || cache.Version != indexCacheVersion {
		return nil
	}
	return &cache
}

func writeIndexCache(project, stamp string, composer *composerMaps, vendor []classRef) {
	path := indexCachePath(project)
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	raw, err := json.Marshal(indexCacheFile{Version: indexCacheVersion, Stamp: stamp, Composer: composer, Vendor: vendor})
	if err != nil {
		return
	}
	tmp := path + ".tmp"
	if os.WriteFile(tmp, raw, 0o600) == nil {
		_ = os.Rename(tmp, path)
	}
}

const composerMapScript = `$d=getcwd().DIRECTORY_SEPARATOR.'vendor'.DIRECTORY_SEPARATOR.'composer'.DIRECTORY_SEPARATOR;$o=['psr4'=>new stdClass,'classmap'=>new stdClass];if(is_file($d.'autoload_psr4.php')){$o['psr4']=(object)require $d.'autoload_psr4.php';}if(is_file($d.'autoload_classmap.php')){$o['classmap']=(object)require $d.'autoload_classmap.php';}echo json_encode($o,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);`

func readComposerMaps(project string) *composerMaps {
	if _, err := os.Stat(filepath.Join(project, "vendor", "composer", "autoload_psr4.php")); err != nil {
		return nil
	}
	php, err := phpBinary()
	if err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, php, "-n", "-r", composerMapScript)
	configureHidden(cmd)
	cmd.Dir = project
	out, err := cmd.Output()
	if err != nil {
		cmd = exec.CommandContext(ctx, php, "-r", composerMapScript)
		configureHidden(cmd)
		cmd.Dir = project
		if out, err = cmd.Output(); err != nil {
			return nil
		}
	}
	var maps composerMaps
	if json.Unmarshal(out, &maps) != nil || len(maps.PSR4) == 0 {
		return nil
	}
	return &maps
}

func pathInside(path, root string) bool {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func scanComposerVendor(project string, maps *composerMaps) []classRef {
	vendorDir := filepath.Join(project, "vendor")
	type job struct {
		prefix string
		dir    string
	}
	var jobs []job
	for prefix, dirs := range maps.PSR4 {
		for _, dir := range dirs {
			dir = filepath.Clean(dir)
			if pathInside(dir, vendorDir) {
				jobs = append(jobs, job{prefix: prefix, dir: dir})
			}
		}
	}
	results := make([][]classRef, len(jobs))
	var wg sync.WaitGroup
	sem := make(chan struct{}, max(4, runtime.NumCPU()))
	for i, j := range jobs {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, j job) {
			defer wg.Done()
			defer func() { <-sem }()
			results[i] = walkPSR4(j.prefix, j.dir, "", false)
		}(i, j)
	}
	wg.Wait()

	seen := map[string]bool{}
	var out []classRef
	add := func(ref classRef) {
		key := strings.ToLower(ref.Name)
		if seen[key] {
			return
		}
		seen[key] = true
		out = append(out, ref)
	}
	for _, list := range results {
		for _, ref := range list {
			add(ref)
		}
	}
	for name, path := range maps.Classmap {
		path = filepath.Clean(path)
		if !pathInside(path, vendorDir) || isTestClass(name) {
			continue
		}
		add(classRef{Name: name, Path: path, Kind: vendorKind(name)})
	}
	sortClassRefs(out)
	return out
}

func isTestClass(name string) bool {
	for _, part := range strings.Split(name, "\\") {
		if part == "Tests" || part == "Test" || part == "Fixtures" {
			return true
		}
	}
	return false
}

func vendorKind(name string) string {
	switch {
	case strings.Contains(name, "\\Facades\\"):
		return "facade"
	case strings.HasSuffix(name, "Interface") || strings.HasSuffix(name, "Contract"):
		return "interface"
	case strings.HasSuffix(name, "Trait"):
		return "trait"
	case strings.HasSuffix(name, "Exception"):
		return "exception"
	}
	return "class"
}

func walkPSR4(prefix, dir, kind string, stat bool) []classRef {
	var out []classRef
	_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if path != dir && (skippedDirs[strings.ToLower(name)] || strings.HasPrefix(name, ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(name, ".php") || len(name) < 5 || name[0] < 'A' || name[0] > 'Z' {
			return nil
		}
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			return nil
		}
		rel = strings.TrimSuffix(rel, ".php")
		segments := strings.Split(rel, string(filepath.Separator))
		for _, segment := range segments {
			if !identRE.MatchString(segment) {
				return nil
			}
		}
		fqcn := prefix + strings.Join(segments, "\\")
		if isTestClass(fqcn) {
			return nil
		}
		k := kind
		if k == "" {
			k = vendorKind(fqcn)
		}
		ref := classRef{Name: fqcn, Path: path, Kind: k}
		if stat {
			if info, err := d.Info(); err == nil {
				ref.mod, ref.size = info.ModTime().UnixNano(), info.Size()
			}
		}
		out = append(out, ref)
		return nil
	})
	return out
}

func scanProjectClasses(project string, maps *composerMaps) []classRef {
	vendorDir := filepath.Join(project, "vendor")
	var refs []classRef
	seen := map[string]bool{}
	if maps != nil {
		for prefix, dirs := range maps.PSR4 {
			if strings.HasPrefix(prefix, "Tests\\") {
				continue
			}
			for _, dir := range dirs {
				dir = filepath.Clean(dir)
				if pathInside(dir, vendorDir) || !pathInside(dir, project) {
					continue
				}
				for _, ref := range walkPSR4(prefix, dir, "class", true) {
					key := strings.ToLower(ref.Name)
					if !seen[key] {
						seen[key] = true
						refs = append(refs, ref)
					}
				}
			}
		}
	}
	if len(refs) == 0 {
		refs = scanFallback(filepath.Join(project, "app"), "class")
	}
	appDir := filepath.Join(project, "app")
	var wg sync.WaitGroup
	sem := make(chan struct{}, max(4, runtime.NumCPU()))
	for i := range refs {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int) {
			defer wg.Done()
			defer func() { <-sem }()
			refs[i].Kind = cachedProjectKind(project, appDir, refs[i])
		}(i)
	}
	wg.Wait()
	sortProjectRefs(refs)
	return refs
}

func cachedProjectKind(project, appDir string, ref classRef) string {
	if ref.mod == 0 {
		return projectKind(project, appDir, ref)
	}
	kindMu.Lock()
	entry, ok := kindCache[ref.Path]
	kindMu.Unlock()
	if ok && entry.mod == ref.mod && entry.size == ref.size {
		return entry.kind
	}
	kind := projectKind(project, appDir, ref)
	kindMu.Lock()
	kindCache[ref.Path] = kindEntry{mod: ref.mod, size: ref.size, kind: kind}
	kindMu.Unlock()
	return kind
}

func projectKind(project, appDir string, ref classRef) string {
	raw, err := readHead(ref.Path, 64*1024)
	if err != nil {
		return "class"
	}
	text := string(raw)
	declared := "class"
	if m := headClassRE.FindStringSubmatch(text); len(m) >= 2 {
		declared = m[1]
	}
	if declared != "class" {
		return declared
	}
	rel, _ := filepath.Rel(project, ref.Path)
	lower := strings.ToLower(filepath.ToSlash(rel))
	switch {
	case strings.Contains(lower, "app/models/") || strings.Contains(text, "extends Model") || strings.Contains(text, "extends Authenticatable") || strings.Contains(text, "extends Pivot"):
		return "model"
	case strings.Contains(lower, "app/jobs/"):
		return "job"
	case strings.Contains(lower, "app/events/"):
		return "event"
	case strings.Contains(lower, "app/listeners/"):
		return "listener"
	case strings.Contains(lower, "app/notifications/"):
		return "notification"
	case strings.Contains(lower, "app/mail/"):
		return "mail"
	case strings.Contains(lower, "app/http/controllers/"):
		return "controller"
	case strings.Contains(lower, "app/services/"):
		return "service"
	case strings.HasPrefix(lower, "database/"):
		return "database"
	}
	return "class"
}

func kindRank(kind string) int {
	switch kind {
	case "model":
		return 0
	case "service":
		return 1
	case "job", "event", "listener", "notification", "mail":
		return 2
	case "controller":
		return 3
	}
	return 4
}

func readHead(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	buf := make([]byte, limit)
	n, err := file.Read(buf)
	if n > 0 {
		return buf[:n], nil
	}
	return nil, err
}

func scanFallback(root, kind string) []classRef {
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		return nil
	}
	var files []classRef
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if path != root && (skippedDirs[strings.ToLower(d.Name())] || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(strings.ToLower(d.Name()), ".php") {
			file := classRef{Path: path}
			if info, err := d.Info(); err == nil {
				file.mod, file.size = info.ModTime().UnixNano(), info.Size()
			}
			files = append(files, file)
		}
		return nil
	})
	refs := make([]classRef, len(files))
	var wg sync.WaitGroup
	sem := make(chan struct{}, max(4, runtime.NumCPU()*2))
	for i, file := range files {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, file classRef) {
			defer wg.Done()
			defer func() { <-sem }()
			path := file.Path
			raw, err := readHead(path, 32*1024)
			if err != nil {
				return
			}
			masked := string(scanPHP(raw).masked)
			cm := headClassRE.FindStringSubmatch(masked)
			if len(cm) < 3 {
				return
			}
			ns := ""
			if nm := headNsRE.FindStringSubmatch(masked); len(nm) >= 2 {
				ns = strings.TrimSpace(nm[1])
			}
			name := cm[2]
			if ns != "" {
				name = ns + "\\" + name
			}
			if isTestClass(name) {
				return
			}
			k := kind
			if k == "package" {
				k = vendorKind(name)
			}
			refs[i] = classRef{Name: name, Path: path, Kind: k, mod: file.mod, size: file.size}
		}(i, file)
	}
	wg.Wait()
	seen := map[string]bool{}
	out := refs[:0]
	for _, ref := range refs {
		key := strings.ToLower(ref.Name)
		if ref.Name == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, ref)
	}
	sortClassRefs(out)
	return out
}
