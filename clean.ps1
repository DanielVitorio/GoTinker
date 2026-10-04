$ErrorActionPreference = "Stop"

Remove-Item (Join-Path $PSScriptRoot "dist\GoTinker.exe") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $PSScriptRoot "bootstrap\payload\backend\gotinker-backend.exe") -Force -ErrorAction SilentlyContinue
