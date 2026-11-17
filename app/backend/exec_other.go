//go:build !windows

package main

import "os/exec"

func configureHidden(cmd *exec.Cmd) {}
