@echo off
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do (
    echo Branch atual: %%b
    git fetch origin
    git reset --hard origin/%%b
    git clean -fd
)