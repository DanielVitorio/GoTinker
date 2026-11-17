//go:build !windows

package main

import "errors"

func nativeSQLiteAvailable() bool { return false }
func nativeSQLiteWrite(path string, raw []byte) error {
	return errors.New("SQLite nativo disponível apenas no Windows")
}
func nativeSQLiteRead(path string) ([]byte, error) {
	return nil, errors.New("SQLite nativo disponível apenas no Windows")
}
