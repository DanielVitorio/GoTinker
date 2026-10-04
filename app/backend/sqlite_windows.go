//go:build windows

package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

var (
	sqliteDLL        = syscall.NewLazyDLL("winsqlite3.dll")
	sqliteOpenV2     = sqliteDLL.NewProc("sqlite3_open_v2")
	sqliteClose      = sqliteDLL.NewProc("sqlite3_close")
	sqliteExec       = sqliteDLL.NewProc("sqlite3_exec")
	sqlitePrepareV2  = sqliteDLL.NewProc("sqlite3_prepare_v2")
	sqliteStep       = sqliteDLL.NewProc("sqlite3_step")
	sqliteColumnText = sqliteDLL.NewProc("sqlite3_column_text")
	sqliteFinalize   = sqliteDLL.NewProc("sqlite3_finalize")
	sqliteErrmsg     = sqliteDLL.NewProc("sqlite3_errmsg")
)

const (
	sqliteOK            = 0
	sqliteRow           = 100
	sqliteDone          = 101
	sqliteOpenReadWrite = 0x00000002
	sqliteOpenCreate    = 0x00000004
	sqliteOpenFullMutex = 0x00010000
)

func nativeSQLiteAvailable() bool {
	return sqliteDLL.Load() == nil
}

func nativeSQLiteWrite(path string, raw []byte) error {
	db, err := nativeSQLiteOpen(path)
	if err != nil {
		return err
	}
	defer sqliteClose.Call(db)

	encoded := base64.StdEncoding.EncodeToString(raw)
	sql := "PRAGMA journal_mode=WAL;" +
		"CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);" +
		"INSERT OR REPLACE INTO app_state(key,value,updated_at) VALUES('workspace','" + encoded + "',datetime('now'));"
	return nativeSQLiteExec(db, sql)
}

func nativeSQLiteRead(path string) ([]byte, error) {
	db, err := nativeSQLiteOpen(path)
	if err != nil {
		return nil, err
	}
	defer sqliteClose.Call(db)

	if err := nativeSQLiteExec(db, "CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);"); err != nil {
		return nil, err
	}

	sqlPtr, err := syscall.BytePtrFromString("SELECT value FROM app_state WHERE key='workspace' LIMIT 1")
	if err != nil {
		return nil, err
	}
	var stmt uintptr
	rc, _, _ := sqlitePrepareV2.Call(db, uintptr(unsafe.Pointer(sqlPtr)), ^uintptr(0), uintptr(unsafe.Pointer(&stmt)), 0)
	if int(rc) != sqliteOK {
		return nil, nativeSQLiteError(db, int(rc))
	}
	if stmt == 0 {
		return nil, errors.New("SQLite não preparou a consulta")
	}
	defer sqliteFinalize.Call(stmt)

	rc, _, _ = sqliteStep.Call(stmt)
	if int(rc) == sqliteDone {
		return nil, nil
	}
	if int(rc) != sqliteRow {
		return nil, nativeSQLiteError(db, int(rc))
	}

	ptr, _, _ := sqliteColumnText.Call(stmt, 0)
	if ptr == 0 {
		return nil, nil
	}
	encoded := cString(ptr)
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("SQLite contém estado inválido: %w", err)
	}
	return decoded, nil
}

func nativeSQLiteOpen(path string) (uintptr, error) {
	if !nativeSQLiteAvailable() {
		return 0, errors.New("winsqlite3.dll não disponível")
	}
	p, err := syscall.BytePtrFromString(path)
	if err != nil {
		return 0, err
	}
	var db uintptr
	flags := uintptr(sqliteOpenReadWrite | sqliteOpenCreate | sqliteOpenFullMutex)
	rc, _, _ := sqliteOpenV2.Call(uintptr(unsafe.Pointer(p)), uintptr(unsafe.Pointer(&db)), flags, 0)
	if int(rc) != sqliteOK {
		if db != 0 {
			defer sqliteClose.Call(db)
		}
		return 0, nativeSQLiteError(db, int(rc))
	}
	return db, nil
}

func nativeSQLiteExec(db uintptr, sql string) error {
	p, err := syscall.BytePtrFromString(sql)
	if err != nil {
		return err
	}
	rc, _, _ := sqliteExec.Call(db, uintptr(unsafe.Pointer(p)), 0, 0, 0)
	if int(rc) != sqliteOK {
		return nativeSQLiteError(db, int(rc))
	}
	return nil
}

func nativeSQLiteError(db uintptr, code int) error {
	if db == 0 {
		return fmt.Errorf("SQLite erro %d", code)
	}
	ptr, _, _ := sqliteErrmsg.Call(db)
	if ptr == 0 {
		return fmt.Errorf("SQLite erro %d", code)
	}
	return fmt.Errorf("SQLite erro %d: %s", code, cString(ptr))
}

func cString(ptr uintptr) string {
	if ptr == 0 {
		return ""
	}
	bytes := make([]byte, 0, 128)
	for i := uintptr(0); i < 64*1024*1024; i++ {
		b := *(*byte)(unsafe.Pointer(ptr + i))
		if b == 0 {
			break
		}
		bytes = append(bytes, b)
	}
	return string(bytes)
}
