//go:build windows

package main

import "embed"

//go:embed payload/* payload/backend/* payload/assets/*
var payload embed.FS
