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
	Variables     map[string]string `json:"variables,omitempty"`
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
	MemoryBytes   int64             `json:"memoryBytes,omitempty"`
	Error         string            `json:"error,omitempty"`
	ErrorLine     int               `json:"errorLine,omitempty"`
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
	PHPPath     string `json:"phpPath,omitempty"`
	Laravel     string `json:"laravel"`
	HasArtisan  bool   `json:"hasArtisan"`
	HasVendor   bool   `json:"hasVendor"`
	Storage     string `json:"storage"`
	StoragePath string `json:"storagePath"`
	DataDir     string `json:"dataDir"`
	Remote      bool   `json:"remote,omitempty"`
	SSHCode     string `json:"sshCode,omitempty"`
	Error       string `json:"error,omitempty"`
}

type fsEntry struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IsDir     bool   `json:"isDir"`
	IsLaravel bool   `json:"isLaravel"`
}

type fsListResponse struct {
	OK        bool      `json:"ok"`
	Current   string    `json:"current"`
	Parent    string    `json:"parent"`
	IsLaravel bool      `json:"isLaravel"`
	Drives    []string  `json:"drives,omitempty"`
	Entries   []fsEntry `json:"entries"`
	Error     string    `json:"error,omitempty"`
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

var ansiRE = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)
