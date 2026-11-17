package main

import (
	"bytes"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

type methodInfo struct {
	Name       string `json:"name"`
	Params     string `json:"params"`
	Returns    string `json:"returns,omitempty"`
	Static     bool   `json:"static,omitempty"`
	Visibility string `json:"-"`
	Doc        string `json:"doc,omitempty"`
	Owner      string `json:"owner,omitempty"`
	Scope      bool   `json:"-"`
	Body       string `json:"-"`
}

type relationInfo struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	Related string `json:"related,omitempty"`
	Many    bool   `json:"many"`
}

type parsedClass struct {
	Name       string
	Namespace  string
	Kind       string
	Extends    []string
	Traits     []string
	Mixins     []string
	Doc        string
	Methods    []methodInfo
	Properties []string
	Attributes []string
	Fillable   []string
	Relations  []relationInfo
	Scopes     []string
	Constants  []string
}

type classDetail struct {
	OK         bool           `json:"ok"`
	Name       string         `json:"name"`
	Kind       string         `json:"kind"`
	File       string         `json:"file"`
	Doc        string         `json:"doc,omitempty"`
	Parents    []string       `json:"parents"`
	IsModel    bool           `json:"isModel"`
	IsFacade   bool           `json:"isFacade"`
	Methods    []methodInfo   `json:"methods"`
	Properties []string       `json:"properties"`
	Attributes []string       `json:"attributes"`
	Fillable   []string       `json:"fillable"`
	Relations  []relationInfo `json:"relations"`
	Scopes     []string       `json:"scopes"`
	Constants  []string       `json:"constants"`
	Mixins     []string       `json:"mixins"`
	Error      string         `json:"error,omitempty"`
}

type parsedEntry struct {
	mod    time.Time
	size   int64
	parsed *parsedClass
}

var (
	parseMu    sync.Mutex
	parseCache = map[string]parsedEntry{}

	ciNamespaceRE = regexp.MustCompile(`(?m)^\s*namespace\s+([^;{\s]+)`)
	ciUseRE       = regexp.MustCompile(`(?m)^\s*use\s+([^;]+);`)
	ciClassRE     = regexp.MustCompile(`\b(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)`)
	ciExtendsRE   = regexp.MustCompile(`\bextends\s+([\\A-Za-z_][\\A-Za-z0-9_]*(?:\s*,\s*[\\A-Za-z_][\\A-Za-z0-9_]*)*)`)
	ciMethodRE    = regexp.MustCompile(`\b((?:(?:public|protected|private|static|final|abstract)\s+)*)function\s*&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	ciTraitRE     = regexp.MustCompile(`\buse\s+([^;{]+)[;{]`)
	ciConstRE     = regexp.MustCompile(`\bconst\s+(?:[A-Za-z_\\?|]+\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=`)
	ciCaseRE      = regexp.MustCompile(`\bcase\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=;]`)
	ciPropRE      = regexp.MustCompile(`\b(public|protected|private)\s+((?:(?:static|readonly)\s+)*)(?:\??[\\A-Za-z_][\\A-Za-z0-9_|]*\s+)?\$([A-Za-z_][A-Za-z0-9_]*)`)
	ciDocMethodRE = regexp.MustCompile(`@method\s+(static\s+)?(?:([^\s(]+)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)`)
	ciDocPropRE   = regexp.MustCompile(`@property(?:-read|-write)?\s+(?:([^\s$]+)\s+)?\$([A-Za-z_][A-Za-z0-9_]*)`)
	ciDocMixinRE  = regexp.MustCompile(`@mixin\s+([\\A-Za-z_][\\A-Za-z0-9_]*)`)
	ciDocReturnRE = regexp.MustCompile(`@return\s+([^\s*]+)`)
	ciRelationRE  = regexp.MustCompile(`\$this\s*->\s*(hasOne|hasMany|belongsTo|belongsToMany|morphTo|morphOne|morphMany|morphToMany|morphedByMany|hasOneThrough|hasManyThrough)\s*\(\s*(?:([\\A-Za-z_][\\A-Za-z0-9_]*)::class|['"]([^'"]+)['"])?`)
	ciFillableRE  = regexp.MustCompile(`(?s)\$fillable\s*=\s*\[(.*?)\]\s*;`)
	ciCastsRE     = regexp.MustCompile(`(?s)\$casts\s*=\s*\[(.*?)\]\s*;`)
	ciCastsFnRE   = regexp.MustCompile(`(?s)function\s+casts\s*\([^)]*\)\s*:\s*array\s*\{.*?return\s*\[(.*?)\]\s*;`)
	ciAppendsRE   = regexp.MustCompile(`(?s)\$appends\s*=\s*\[(.*?)\]\s*;`)
	ciArrayKeyRE  = regexp.MustCompile(`["']([^"']+)["']\s*(?:=>|,|$)`)
	ciMapKeyRE    = regexp.MustCompile(`["']([^"']+)["']\s*=>`)
	ciAttrNameRE  = regexp.MustCompile(`#\[\s*\\?(?:[A-Za-z_\\]*\\)?Scope\b`)
)

var builtinTypes = map[string]bool{
	"int": true, "integer": true, "string": true, "bool": true, "boolean": true, "float": true, "double": true,
	"array": true, "mixed": true, "void": true, "null": true, "callable": true, "iterable": true, "object": true,
	"false": true, "true": true, "never": true, "static": true, "$this": true, "resource": true, "class-string": true,
	"list": true, "non-empty-array": true, "non-empty-string": true, "positive-int": true, "array-key": true, "scalar": true,
}

var (
	genericRE  = regexp.MustCompile(`<[^<>]*>|\{[^{}]*\}`)
	templateRE = regexp.MustCompile(`^T(?:[A-Z][A-Za-z]*)?$`)
)

func stripGenerics(s string) string {
	for i := 0; i < 6 && strings.ContainsAny(s, "<{"); i++ {
		next := genericRE.ReplaceAllString(s, "")
		if next == s {
			break
		}
		s = next
	}
	return s
}

var relationMany = map[string]bool{"hasMany": true, "belongsToMany": true, "morphMany": true, "morphToMany": true, "morphedByMany": true, "hasManyThrough": true}

func handleClass(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "método não permitido"})
		return
	}
	project, err := validateProject(r.URL.Query().Get("project"))
	if err != nil {
		writeJSON(w, http.StatusOK, classDetail{Error: err.Error()})
		return
	}
	name := strings.Trim(strings.TrimSpace(r.URL.Query().Get("name")), "\\")
	idx, err := cachedProjectIndex(project)
	if err != nil {
		writeJSON(w, http.StatusOK, classDetail{Error: err.Error()})
		return
	}
	if _, ok := idx.byName[strings.ToLower(name)]; !ok {
		idx, _ = loadProjectIndex(project, false)
	}
	detail := resolveClassDetail(project, idx, name)
	writeJSON(w, http.StatusOK, detail)
}

func resolveClassDetail(project string, idx *projectIndex, name string) classDetail {
	ref, ok := idx.byName[strings.ToLower(name)]
	if !ok {
		return classDetail{Name: name, Error: "classe não encontrada"}
	}
	root := parseClassFile(ref.Path)
	if root == nil {
		return classDetail{Name: ref.Name, Error: "não foi possível ler a classe"}
	}
	rel, _ := filepath.Rel(project, ref.Path)
	detail := classDetail{
		OK: true, Name: ref.Name, Kind: root.Kind, File: filepath.ToSlash(rel), Doc: root.Doc,
		Parents: []string{}, Methods: []methodInfo{}, Properties: []string{}, Attributes: []string{},
		Fillable: []string{}, Relations: []relationInfo{}, Scopes: []string{}, Constants: []string{}, Mixins: []string{},
	}
	methods := map[string]bool{}
	relations := map[string]bool{}
	visited := map[string]bool{}
	var props, attrs, fillable, scopes, constants, mixins []string

	var merge func(fqcn string, pc *parsedClass, depth int)
	merge = func(fqcn string, pc *parsedClass, depth int) {
		key := strings.ToLower(fqcn)
		if pc == nil || visited[key] || depth > 10 {
			return
		}
		visited[key] = true
		short := fqcn[strings.LastIndex(fqcn, "\\")+1:]
		for _, m := range pc.Methods {
			lower := strings.ToLower(m.Name)
			if methods[lower] || m.Visibility != "public" {
				continue
			}
			methods[lower] = true
			m.Owner = short
			detail.Methods = append(detail.Methods, m)
		}
		for _, rel := range pc.Relations {
			if !relations[strings.ToLower(rel.Name)] {
				relations[strings.ToLower(rel.Name)] = true
				detail.Relations = append(detail.Relations, rel)
			}
		}
		props = append(props, pc.Properties...)
		attrs = append(attrs, pc.Attributes...)
		fillable = append(fillable, pc.Fillable...)
		scopes = append(scopes, pc.Scopes...)
		constants = append(constants, pc.Constants...)
		mixins = append(mixins, pc.Mixins...)
		for _, trait := range pc.Traits {
			if tref, ok := idx.byName[strings.ToLower(trait)]; ok {
				merge(tref.Name, parseClassFile(tref.Path), depth+1)
			}
		}
		for _, parent := range pc.Extends {
			if strings.EqualFold(parent, "Illuminate\\Database\\Eloquent\\Model") {
				detail.IsModel = true
			}
			if strings.EqualFold(parent, "Illuminate\\Support\\Facades\\Facade") {
				detail.IsFacade = true
			}
			detail.Parents = append(detail.Parents, parent)
			if pref, ok := idx.byName[strings.ToLower(parent)]; ok {
				merge(pref.Name, parseClassFile(pref.Path), depth+1)
			}
		}
	}
	merge(ref.Name, root, 0)

	if strings.EqualFold(ref.Name, "Illuminate\\Database\\Eloquent\\Model") {
		detail.IsModel = true
	}
	if detail.IsModel && root.Kind == "class" {
		detail.Kind = "model"
	}
	sort.Slice(detail.Methods, func(i, j int) bool {
		return strings.ToLower(detail.Methods[i].Name) < strings.ToLower(detail.Methods[j].Name)
	})
	detail.Properties = uniqueSorted(props)
	detail.Attributes = uniqueSorted(attrs)
	detail.Fillable = uniqueSorted(fillable)
	detail.Scopes = uniqueSorted(scopes)
	detail.Constants = uniqueSorted(constants)
	detail.Mixins = []string{}
	for _, mixin := range uniqueSorted(mixins) {
		if !strings.EqualFold(mixin, ref.Name) {
			detail.Mixins = append(detail.Mixins, mixin)
		}
	}
	return detail
}

func parseClassFile(path string) *parsedClass {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() || info.Size() > 4*1024*1024 {
		return nil
	}
	parseMu.Lock()
	if entry, ok := parseCache[path]; ok && entry.mod.Equal(info.ModTime()) && entry.size == info.Size() {
		parseMu.Unlock()
		return entry.parsed
	}
	parseMu.Unlock()
	src, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	parsed := parsePHPClass(src)
	parseMu.Lock()
	parseCache[path] = parsedEntry{mod: info.ModTime(), size: info.Size(), parsed: parsed}
	parseMu.Unlock()
	return parsed
}

type phpScanResult struct {
	masked []byte
	docs   [][2]int
}

func scanPHP(src []byte) phpScanResult {
	n := len(src)
	m := make([]byte, n)
	copy(m, src)
	var docs [][2]int
	blank := func(a, b int) {
		for i := a; i < b && i < n; i++ {
			if m[i] != '\n' && m[i] != '\r' {
				m[i] = ' '
			}
		}
	}
	for i := 0; i < n; {
		c := src[i]
		switch {
		case (c == '/' && i+1 < n && src[i+1] == '/') || (c == '#' && !(i+1 < n && src[i+1] == '[')):
			j := i
			for j < n && src[j] != '\n' {
				j++
			}
			blank(i, j)
			i = j
		case c == '/' && i+1 < n && src[i+1] == '*':
			j := n
			if end := bytes.Index(src[i+2:], []byte("*/")); end >= 0 {
				j = i + 2 + end + 2
			}
			if i+2 < n && src[i+2] == '*' {
				docs = append(docs, [2]int{i, j})
			}
			blank(i, j)
			i = j
		case c == '\'' || c == '"' || c == '`':
			j := i + 1
			for j < n {
				if src[j] == '\\' {
					j += 2
					continue
				}
				if src[j] == c {
					break
				}
				j++
			}
			if j > n {
				j = n
			}
			blank(i+1, j)
			i = j + 1
		case c == '<' && bytes.HasPrefix(src[i:], []byte("<<<")):
			j := i + 3
			for j < n && (src[j] == ' ' || src[j] == '\t') {
				j++
			}
			quote := byte(0)
			if j < n && (src[j] == '\'' || src[j] == '"') {
				quote = src[j]
				j++
			}
			start := j
			for j < n && (src[j] == '_' || unicode.IsLetter(rune(src[j])) || unicode.IsDigit(rune(src[j]))) {
				j++
			}
			label := string(src[start:j])
			if quote != 0 && j < n && src[j] == quote {
				j++
			}
			if label == "" {
				i += 3
				continue
			}
			end := n
			for k := j; k < n; k++ {
				if src[k] != '\n' {
					continue
				}
				p := k + 1
				for p < n && (src[p] == ' ' || src[p] == '\t') {
					p++
				}
				if bytes.HasPrefix(src[p:], []byte(label)) {
					after := p + len(label)
					if after >= n || !(src[after] == '_' || unicode.IsLetter(rune(src[after])) || unicode.IsDigit(rune(src[after]))) {
						end = after
						break
					}
				}
			}
			blank(j, end)
			i = end
		default:
			i++
		}
	}
	return phpScanResult{masked: m, docs: docs}
}

func matchPair(m []byte, open int, left, right byte) int {
	depth := 0
	for i := open; i < len(m); i++ {
		switch m[i] {
		case left:
			depth++
		case right:
			depth--
			if depth == 0 {
				return i
			}
		}
	}
	return len(m) - 1
}

func parsePHPClass(src []byte) *parsedClass {
	scan := scanPHP(src)
	masked := scan.masked
	text := string(src)
	mtext := string(masked)
	pc := &parsedClass{Kind: "class"}

	decl := -1
	declEnd := -1
	for _, loc := range ciClassRE.FindAllStringSubmatchIndex(mtext, -1) {
		name := mtext[loc[4]:loc[5]]
		if name == "extends" || name == "implements" {
			continue
		}
		if loc[0] >= 2 && strings.HasSuffix(strings.TrimRight(mtext[:loc[0]], " \t"), "::") {
			continue
		}
		decl = loc[0]
		declEnd = loc[5]
		pc.Kind = mtext[loc[2]:loc[3]]
		pc.Name = name
		break
	}
	if decl < 0 {
		return pc
	}
	if nm := ciNamespaceRE.FindStringSubmatch(mtext[:decl]); len(nm) >= 2 {
		pc.Namespace = strings.TrimSpace(nm[1])
	}
	imports := parseImports(mtext[:decl])
	self := pc.Name
	if pc.Namespace != "" {
		self = pc.Namespace + "\\" + pc.Name
	}
	resolve := func(name string) string { return resolveTypeName(name, pc.Namespace, imports, self) }

	brace := strings.IndexByte(mtext[declEnd:], '{')
	if brace < 0 {
		return pc
	}
	brace += declEnd
	header := mtext[declEnd:brace]
	if em := ciExtendsRE.FindStringSubmatch(header); len(em) >= 2 {
		for _, parent := range strings.Split(em[1], ",") {
			if parent = strings.TrimSpace(parent); parent != "" {
				pc.Extends = append(pc.Extends, resolve(parent))
			}
		}
	}

	if doc := docBefore(src, scan.docs, decl); doc != "" {
		pc.Doc = docSummary(doc)
		for _, dm := range ciDocMethodRE.FindAllStringSubmatch(doc, -1) {
			pc.Methods = append(pc.Methods, methodInfo{
				Name: dm[3], Params: normalizeParams(dm[4]), Returns: resolve(dm[2]), Static: strings.TrimSpace(dm[1]) != "", Visibility: "public",
			})
		}
		for _, dp := range ciDocPropRE.FindAllStringSubmatch(doc, -1) {
			pc.Properties = append(pc.Properties, dp[2])
			pc.Attributes = append(pc.Attributes, dp[2])
		}
		for _, mx := range ciDocMixinRE.FindAllStringSubmatch(doc, -1) {
			pc.Mixins = append(pc.Mixins, resolve(mx[1]))
		}
	}

	bodyEnd := matchPair(masked, brace, '{', '}')
	depth := make([]uint16, bodyEnd-brace+1)
	level := uint16(0)
	for i := brace; i <= bodyEnd; i++ {
		switch masked[i] {
		case '{':
			depth[i-brace] = level
			level++
			continue
		case '}':
			level--
		}
		depth[i-brace] = level
	}
	atTop := func(pos int) bool {
		return pos > brace && pos <= bodyEnd && depth[pos-brace] == 1
	}

	docMethods := map[string]bool{}
	for _, m := range pc.Methods {
		docMethods[strings.ToLower(m.Name)] = true
	}
	for _, loc := range ciMethodRE.FindAllStringSubmatchIndex(mtext, -1) {
		if !atTop(loc[0]) {
			continue
		}
		mods := mtext[loc[2]:loc[3]]
		name := mtext[loc[4]:loc[5]]
		open := loc[1] - 1
		closeParen := matchPair(masked, open, '(', ')')
		params := normalizeParams(text[open+1 : closeParen])
		returns := ""
		k := closeParen + 1
		for k < len(masked) && isWS(masked[k]) {
			k++
		}
		if k < len(masked) && masked[k] == ':' {
			end := k + 1
			for end < len(masked) && masked[end] != '{' && masked[end] != ';' {
				end++
			}
			returns = strings.TrimSpace(mtext[k+1 : end])
			k = end
		}
		for k < len(masked) && isWS(masked[k]) {
			k++
		}
		body := ""
		if k < len(masked) && masked[k] == '{' {
			bend := matchPair(masked, k, '{', '}')
			body = text[k : bend+1]
		}
		visibility := "public"
		if strings.Contains(mods, "private") {
			visibility = "private"
		} else if strings.Contains(mods, "protected") {
			visibility = "protected"
		}
		doc := docBefore(src, scan.docs, loc[0])
		gap := attributeGap(src, scan.docs, loc[0])
		if returns == "" || returns == "mixed" {
			if dr := ciDocReturnRE.FindStringSubmatch(doc); len(dr) >= 2 {
				if !strings.HasPrefix(dr[1], "(") && !strings.Contains(dr[1], "$id") {
					returns = dr[1]
				}
			}
		}
		info := methodInfo{
			Name: name, Params: params, Returns: resolve(returns), Static: strings.Contains(mods, "static"),
			Visibility: visibility, Doc: docSummary(doc), Body: body,
		}
		info.Scope = ciAttrNameRE.MatchString(gap)
		if docMethods[strings.ToLower(name)] {
			for i := range pc.Methods {
				if strings.EqualFold(pc.Methods[i].Name, name) {
					pc.Methods = append(pc.Methods[:i], pc.Methods[i+1:]...)
					break
				}
			}
		}
		pc.Methods = append(pc.Methods, info)
	}

	for _, loc := range ciTraitRE.FindAllStringSubmatchIndex(mtext, -1) {
		if !atTop(loc[0]) {
			continue
		}
		for _, name := range strings.Split(mtext[loc[2]:loc[3]], ",") {
			if name = strings.TrimSpace(name); name != "" {
				pc.Traits = append(pc.Traits, resolve(name))
			}
		}
	}
	for _, loc := range ciConstRE.FindAllStringSubmatchIndex(mtext, -1) {
		if atTop(loc[0]) {
			pc.Constants = append(pc.Constants, mtext[loc[2]:loc[3]])
		}
	}
	if pc.Kind == "enum" {
		for _, loc := range ciCaseRE.FindAllStringSubmatchIndex(mtext, -1) {
			if atTop(loc[0]) {
				pc.Constants = append(pc.Constants, mtext[loc[2]:loc[3]])
			}
		}
	}
	for _, loc := range ciPropRE.FindAllStringSubmatchIndex(mtext, -1) {
		if !atTop(loc[0]) {
			continue
		}
		if mtext[loc[2]:loc[3]] == "public" && !strings.Contains(mtext[loc[4]:loc[5]], "static") {
			pc.Properties = append(pc.Properties, mtext[loc[6]:loc[7]])
		}
	}

	pc.Fillable = extractKeys(text, ciFillableRE)
	pc.Attributes = append(pc.Attributes, pc.Fillable...)
	pc.Attributes = append(pc.Attributes, extractMapKeys(text, ciCastsRE)...)
	pc.Attributes = append(pc.Attributes, extractMapKeys(text, ciCastsFnRE)...)
	pc.Attributes = append(pc.Attributes, extractKeys(text, ciAppendsRE)...)

	for _, m := range pc.Methods {
		lowerReturns := strings.ToLower(m.Returns)
		if strings.HasPrefix(m.Name, "scope") && len(m.Name) > 5 && unicode.IsUpper(rune(m.Name[5])) {
			pc.Scopes = append(pc.Scopes, lcFirst(m.Name[5:]))
		}
		if m.Scope {
			pc.Scopes = append(pc.Scopes, m.Name)
		}
		if strings.HasPrefix(m.Name, "get") && strings.HasSuffix(m.Name, "Attribute") && len(m.Name) > 12 {
			pc.Attributes = append(pc.Attributes, snakeCase(m.Name[3:len(m.Name)-9]))
		}
		if strings.HasSuffix(lowerReturns, "eloquent\\casts\\attribute") {
			pc.Attributes = append(pc.Attributes, snakeCase(m.Name))
		}
		if m.Body == "" || m.Static || strings.TrimSpace(m.Params) != "" {
			continue
		}
		if rm := ciRelationRE.FindStringSubmatch(m.Body); len(rm) >= 2 {
			related := rm[2]
			if related == "" {
				related = rm[3]
			}
			if related != "" {
				related = resolve(related)
			}
			pc.Relations = append(pc.Relations, relationInfo{Name: m.Name, Type: rm[1], Related: related, Many: relationMany[rm[1]]})
		}
	}
	for i := range pc.Methods {
		pc.Methods[i].Body = ""
	}
	return pc
}

func isWS(b byte) bool { return b == ' ' || b == '\t' || b == '\n' || b == '\r' }

func parseImports(region string) map[string]string {
	imports := map[string]string{}
	for _, um := range ciUseRE.FindAllStringSubmatch(region, -1) {
		body := strings.TrimSpace(um[1])
		if strings.HasPrefix(body, "function ") || strings.HasPrefix(body, "const ") {
			continue
		}
		if open := strings.Index(body, "{"); open >= 0 {
			prefix := strings.TrimSpace(strings.TrimSuffix(body[:open], "\\"))
			inner := strings.TrimSuffix(strings.TrimSpace(body[open+1:]), "}")
			for _, part := range strings.Split(inner, ",") {
				addImport(imports, prefix+"\\"+strings.TrimSpace(part))
			}
			continue
		}
		for _, part := range strings.Split(body, ",") {
			addImport(imports, part)
		}
	}
	return imports
}

func addImport(imports map[string]string, raw string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return
	}
	alias := ""
	if idx := strings.Index(strings.ToLower(raw), " as "); idx >= 0 {
		alias = strings.TrimSpace(raw[idx+4:])
		raw = strings.TrimSpace(raw[:idx])
	}
	raw = strings.Trim(raw, "\\")
	if alias == "" {
		alias = raw[strings.LastIndex(raw, "\\")+1:]
	}
	imports[strings.ToLower(alias)] = raw
}

func resolveTypeName(raw, namespace string, imports map[string]string, self string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var parts []string
	for _, part := range strings.FieldsFunc(raw, func(r rune) bool { return r == '|' || r == '&' }) {
		part = strings.TrimSpace(strings.Trim(part, "()"))
		part = strings.TrimPrefix(part, "?")
		if idx := strings.IndexAny(part, "<{"); idx >= 0 {
			part = part[:idx]
		}
		array := strings.HasSuffix(part, "[]")
		part = strings.TrimSuffix(part, "[]")
		if part == "" {
			continue
		}
		lower := strings.ToLower(part)
		switch {
		case lower == "self":
			part = self
		case builtinTypes[lower] || lower == "$this":
			part = lower
		case templateRE.MatchString(part):
		case strings.HasPrefix(part, "\\"):
			part = strings.TrimPrefix(part, "\\")
		default:
			first, rest, hasRest := strings.Cut(part, "\\")
			if imported, ok := imports[strings.ToLower(first)]; ok {
				part = imported
				if hasRest {
					part += "\\" + rest
				}
			} else if namespace != "" {
				part = namespace + "\\" + part
			}
		}
		if array {
			part += "[]"
		}
		parts = append(parts, part)
	}
	return strings.Join(parts, "|")
}

func docBefore(src []byte, docs [][2]int, pos int) string {
	i := sort.Search(len(docs), func(i int) bool { return docs[i][1] > pos }) - 1
	if i < 0 {
		return ""
	}
	gap := stripAttributes(string(src[docs[i][1]:pos]))
	gap = strings.TrimSpace(gap)
	for _, word := range []string{"abstract", "final", "readonly"} {
		gap = strings.TrimSpace(strings.TrimPrefix(gap, word))
	}
	if gap != "" {
		return ""
	}
	return cleanDoc(string(src[docs[i][0]:docs[i][1]]))
}

func attributeGap(src []byte, docs [][2]int, pos int) string {
	start := pos - 400
	if start < 0 {
		start = 0
	}
	i := sort.Search(len(docs), func(i int) bool { return docs[i][1] > pos }) - 1
	if i >= 0 && docs[i][1] > start {
		start = docs[i][1]
	}
	gap := string(src[start:pos])
	if semi := strings.LastIndexAny(gap, ";}"); semi >= 0 {
		gap = gap[semi+1:]
	}
	return gap
}

func stripAttributes(s string) string {
	var out strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '#' && i+1 < len(s) && s[i+1] == '[' {
			depth := 0
			for j := i + 1; j < len(s); j++ {
				if s[j] == '[' {
					depth++
				} else if s[j] == ']' {
					depth--
					if depth == 0 {
						i = j
						break
					}
				}
			}
			continue
		}
		out.WriteByte(s[i])
	}
	return out.String()
}

func cleanDoc(doc string) string {
	doc = strings.TrimPrefix(doc, "/**")
	doc = strings.TrimSuffix(doc, "*/")
	lines := strings.Split(doc, "\n")
	for i, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "*")
		lines[i] = strings.TrimSpace(line)
	}
	return stripGenerics(strings.Join(lines, "\n"))
}

func docSummary(doc string) string {
	for _, line := range strings.Split(doc, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "@") || strings.HasPrefix(line, "{@") {
			if strings.HasPrefix(line, "@") {
				break
			}
			continue
		}
		if len(line) > 220 {
			line = line[:220] + "…"
		}
		return line
	}
	return ""
}

func normalizeParams(raw string) string {
	raw = stripAttributes(raw)
	return strings.Join(strings.Fields(raw), " ")
}

func extractKeys(text string, re *regexp.Regexp) []string {
	return extractWith(text, re, ciArrayKeyRE)
}

func extractMapKeys(text string, re *regexp.Regexp) []string {
	return extractWith(text, re, ciMapKeyRE)
}

func extractWith(text string, re, itemRE *regexp.Regexp) []string {
	match := re.FindStringSubmatch(text)
	if len(match) < 2 {
		return nil
	}
	var out []string
	for _, item := range itemRE.FindAllStringSubmatch(match[1], -1) {
		if len(item) >= 2 {
			out = append(out, strings.TrimSpace(item[1]))
		}
	}
	return out
}

func lcFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}

func snakeCase(s string) string {
	var out strings.Builder
	for i, r := range s {
		if unicode.IsUpper(r) {
			if i > 0 {
				out.WriteByte('_')
			}
			out.WriteRune(unicode.ToLower(r))
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
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
