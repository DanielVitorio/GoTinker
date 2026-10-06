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
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar os testes do backend." }
go build -trimpath -ldflags "-s -w -H=windowsgui" -o (Join-Path $Payload "backend\gotinker-backend.exe") .
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o backend." }
Pop-Location

Copy-Item (Join-Path $Desktop "main.js") (Join-Path $Payload "main.js") -Force
Copy-Item (Join-Path $Desktop "preload.js") (Join-Path $Payload "preload.js") -Force
Copy-Item (Join-Path $Desktop "package.json") (Join-Path $Payload "package.json") -Force
Copy-Item (Join-Path $Root "assets\app.ico") (Join-Path $Payload "assets\app.ico") -Force

$CmderSource = Join-Path $Root "cmder"
$CmderDestination = Join-Path $Dist "cmder"
if (-not (Test-Path (Join-Path $CmderSource "vendor\init.bat"))) { throw "Cmder nao encontrado na raiz do projeto." }
New-Item -ItemType Directory -Force -Path $CmderDestination | Out-Null
robocopy $CmderSource $CmderDestination /E /NFL /NDL /NJH /NJS /NP /XD (Join-Path $CmderSource "config") | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Falha ao copiar Cmder para a distribuicao." }

Push-Location $Bootstrap
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go test -c -o (Join-Path $env:TEMP "gotinker-bootstrap.test.exe") .
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar os testes do bootstrap." }
go build -trimpath -ldflags "-s -w -H=windowsgui" -o (Join-Path $Dist "GoTinker.exe") .
if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o inicializador." }
Pop-Location

Write-Host ""
Write-Host "Build concluido." -ForegroundColor Green
Write-Host (Join-Path $Dist "GoTinker.exe")
