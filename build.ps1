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

$CmderSource = Join-Path $Root "submodules\cmder"
$CmderDestination = Join-Path $Dist "cmder"
if (-not (Test-Path (Join-Path $CmderSource "vendor\init.bat"))) { throw "Cmder nao encontrado em submodules\cmder. Rode: git submodule update --init --recursive" }
$CmderSources = Get-Content (Join-Path $CmderSource "vendor\sources.json") -Raw | ConvertFrom-Json
$CmderMissing = @($CmderSources | Where-Object {
    $Marker = Join-Path $CmderSource "vendor\$($_.name)\.cmderver"
    -not (Test-Path $Marker) -or (Get-Content $Marker -Raw).Trim() -ne $_.version
})
if ($CmderMissing.Count -gt 0) {
    Write-Host "Baixando dependencias do Cmder: $(($CmderMissing | ForEach-Object name) -join ', ')"
    & (Join-Path $CmderSource "scripts\build.ps1") -WarningAction SilentlyContinue
    if (-not $?) { throw "Falha ao baixar as dependencias do Cmder." }
}
New-Item -ItemType Directory -Force -Path $CmderDestination | Out-Null
robocopy $CmderSource $CmderDestination /E /NFL /NDL /NJH /NJS /NP /XD (Join-Path $CmderSource "config") (Join-Path $CmderSource "launcher") (Join-Path $CmderSource "vendor\tmp") /XF .git .gitignore .gitattributes | Out-Null
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

$Launcher = Join-Path $Dist "GoTinker.exe"
$BrandTool = Join-Path $env:TEMP "gotinker-brand-$PID.exe"
Copy-Item $Launcher $BrandTool -Force
$Brand = Start-Process -FilePath $BrandTool -ArgumentList @("--gotinker-brand", "`"$Launcher`"", "`"$(Join-Path $Root "assets\app.ico")`"") -Wait -PassThru
Remove-Item $BrandTool -Force -ErrorAction SilentlyContinue
if ($Brand.ExitCode -ne 0) { throw "Falha ao aplicar o icone do inicializador." }

Write-Host ""
Write-Host "Build concluido." -ForegroundColor Green
Write-Host (Join-Path $Dist "GoTinker.exe")
