$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$Backend = Join-Path $Root "app\backend"
$Desktop = Join-Path $Root "app\desktop"
$Bootstrap = Join-Path $Root "bootstrap"
$Payload = Join-Path $Bootstrap "payload"
$Dist = Join-Path $Root "dist"

New-Item -ItemType Directory -Force -Path (Join-Path $Payload "backend") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Payload "assets") | Out-Null
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Push-Location $Backend
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go test -c -o (Join-Path $env:TEMP "gotinker-backend.test.exe") .
go build -trimpath -ldflags "-s -w -H=windowsgui" -o (Join-Path $Payload "backend\gotinker-backend.exe") .
Pop-Location

Copy-Item (Join-Path $Desktop "main.js") (Join-Path $Payload "main.js") -Force
Copy-Item (Join-Path $Desktop "package.json") (Join-Path $Payload "package.json") -Force
Copy-Item (Join-Path $Root "assets\app.ico") (Join-Path $Payload "assets\app.ico") -Force

Push-Location $Bootstrap
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go test -c -o (Join-Path $env:TEMP "gotinker-bootstrap.test.exe") .
go build -trimpath -ldflags "-s -w -H=windowsgui" -o (Join-Path $Dist "GoTinker.exe") .
Pop-Location

Write-Host ""
Write-Host "Build concluido." -ForegroundColor Green
Write-Host (Join-Path $Dist "GoTinker.exe")
