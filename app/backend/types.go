package main

import (
	"encoding/json"
	"regexp"
	"sync"
	"time"
)

type runRequest struct {
	Project       string            `json:"project"`
	Code          string            `json:"code"`
	PreviewParams map[string]string `json:"previewParams,omitempty"`
}

type runResponse struct {
	OK            bool              `json:"ok"`
	Output        string            `json:"output"`
	JSON          string            `json:"json,omitempty"`
	PreviewHTML   string            `json:"previewHtml,omitempty"`
	PreviewData   string            `json:"previewData,omitempty"`
	PreviewMime   string            `json:"previewMime,omitempty"`
	PreviewStatus int               `json:"previewStatus,omitempty"`
	PreviewRoute  *previewRouteInfo `json:"previewRoute,omitempty"`
	ResultType    string            `json:"resultType,omitempty"`
	ExitCode      int               `json:"exitCode"`
	DurationMS    int64             `json:"durationMs"`
	Error         string            `json:"error,omitempty"`
}

type previewRouteInfo struct {
	URI        string                  `json:"uri"`
	Method     string                  `json:"method"`
	Parameters []previewRouteParameter `json:"parameters"`
	Missing    []string                `json:"missing,omitempty"`
}

type previewRouteParameter struct {
	Name     string `json:"name"`
	Optional bool   `json:"optional"`
}

type statusResponse struct {
	OK          bool   `json:"ok"`
	Project     string `json:"project"`
	PHP         string `json:"php"`
	Laravel     string `json:"laravel"`
	HasArtisan  bool   `json:"hasArtisan"`
	Storage     string `json:"storage"`
	StoragePath string `json:"storagePath"`
	Error       string `json:"error,omitempty"`
}

type fsEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"isDir"`
	IsLaravel bool   `json:"isLaravel"`
}

type fsListResponse struct {
	OK      bool      `json:"ok"`
	Current string    `json:"current"`
	Parent  string    `json:"parent"`
	Drives  []string  `json:"drives,omitempty"`
	Entries []fsEntry `json:"entries"`
	Error   string    `json:"error,omitempty"`
}

type completion struct {
	Label         string            `json:"label"`
	Insert        string            `json:"insert"`
	Kind          string            `json:"kind"`
	Detail        string            `json:"detail"`
	Namespace     string            `json:"namespace,omitempty"`
	ShortName     string            `json:"shortName,omitempty"`
	Methods       []string          `json:"methods,omitempty"`
	MethodDetails []methodSignature `json:"methodDetails,omitempty"`
	TraitUses     []string          `json:"traitUses,omitempty"`
	Properties    []string          `json:"properties,omitempty"`
	Fillable      []string          `json:"fillable,omitempty"`
}

type methodSignature struct {
	Name       string `json:"name"`
	Parameters string `json:"parameters,omitempty"`
	ReturnType string `json:"returnType,omitempty"`
}

type indexResponse struct {
	OK          bool         `json:"ok"`
	Project     string       `json:"project"`
	Completions []completion `json:"completions"`
	Count       int          `json:"count"`
	Error       string       `json:"error,omitempty"`
}

type stateStore struct {
	mu       sync.RWMutex
	raw      json.RawMessage
	loaded   bool
	dirty    bool
	timer    *time.Timer
	dbPath   string
	jsonPath string
}

var store = &stateStore{}

var (
	namespaceRE       = regexp.MustCompile(`(?m)^\s*namespace\s+([^;]+);`)
	classRE           = regexp.MustCompile(`(?m)\b(class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)`)
	methodRE          = regexp.MustCompile(`(?m)\b(?:public|protected|private)?\s*(?:static\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	methodSignatureRE = regexp.MustCompile(`(?s)(?:(?:public|protected|private)\s+)?(?:(?:static|final|abstract)\s+)*function\s+&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?::\s*([?\\A-Za-z_][?\\A-Za-z0-9_|&\[\]]*))?`)
	docMethodRE       = regexp.MustCompile(`(?m)@method\s+(?:static\s+)?([?\\A-Za-z_][?\\A-Za-z0-9_|&\[\]]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)`)
	docReturnRE       = regexp.MustCompile(`(?m)@return\s+([?\\A-Za-z_][?\\A-Za-z0-9_|&\[\]]*)`)
	phpImportRE       = regexp.MustCompile(`(?m)^use\s+([A-Za-z_\\][A-Za-z0-9_\\]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*;`)
	traitUseRE        = regexp.MustCompile(`(?m)^[ \t]+use\s+([^;{]+)\s*[;{]`)
	fillableRE        = regexp.MustCompile(`(?s)\$fillable\s*=\s*\[(.*?)\]\s*;`)
	castsArrayRE      = regexp.MustCompile(`(?s)\$casts\s*=\s*\[(.*?)\]\s*;`)
	castsMethodRE     = regexp.MustCompile(`(?s)function\s+casts\s*\([^)]*\)\s*:\s*array\s*\{.*?return\s*\[(.*?)\]\s*;`)
	arrayStringRE     = regexp.MustCompile(`["']([^"']+)["']\s*(?:=>|,|$)`)
	docPropertyRE     = regexp.MustCompile(`(?m)@property(?:-read|-write)?\s+[^$\r\n]+\$([A-Za-z_][A-Za-z0-9_]*)`)
	ansiRE            = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)
)
