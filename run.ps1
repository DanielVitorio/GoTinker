$ErrorActionPreference = "Stop"
$Exe = Join-Path $PSScriptRoot "dist\GoTinker.exe"

if (-not (Test-Path $Exe)) {
    & (Join-Path $PSScriptRoot "build.ps1")
}

Start-Process $Exe
