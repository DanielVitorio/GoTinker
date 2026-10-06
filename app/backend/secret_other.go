//go:build !windows

package main

import "errors"

func protectSecret(value string) (string, error) {
	return "", errors.New("armazenamento de senha SSH com DPAPI está disponível apenas no Windows")
}

func unprotectSecret(value string) (string, error) {
	return "", errors.New("armazenamento de senha SSH com DPAPI está disponível apenas no Windows")
}
