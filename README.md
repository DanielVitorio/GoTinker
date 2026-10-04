# Go Tinker

Go Tinker is a standalone Windows desktop application for running Laravel Tinker code with a fast editor, project-aware autocomplete, persistent tabs, formatted output, execution history, snippets, and local SQLite persistence.

The application uses a Go backend and a dedicated Electron desktop window. It does not open Opera, Chrome, or Edge, and it does not depend on Edge WebView2.

---

# English

## Overview

Go Tinker turns the `php artisan tinker` workflow into a visual desktop experience.

The application provides a PHP editor on the left and a formatted output panel on the right. It supports multiple persistent tabs, Laravel-aware autocomplete, Eloquent suggestions, execution history, saved snippets, JSON formatting, and local SQLite storage.

On the first launch, Go Tinker downloads the desktop runtime and displays a dedicated progress screen. The runtime is downloaded only once and reused on future launches.

## Features

- Standalone Windows desktop application
- Dedicated application window
- No external browser window
- No Edge WebView2 dependency
- PHP syntax highlighting
- Laravel project-aware autocomplete
- Autocomplete for classes inside `app/`
- Suggestions for Models, Services, Controllers, and other application classes
- Namespace completion such as `App\\Models\\`
- Eloquent static method suggestions after `::`
- Eloquent Builder suggestions after chains such as `User::where()->`
- Instance suggestions after `->`
- `$fillable` attribute suggestions
- Model property and cast suggestions
- Model method and relationship suggestions
- Persistent editor tabs
- Saved snippets
- Execution history
- Local SQLite workspace
- Auto, Terminal, JSON, and Text output modes
- Automatic JSON detection and formatting
- Project browser with access to available Windows drives
- Hidden Go backend process
- Internal service bound only to `127.0.0.1`
- First-launch runtime download progress screen

## Requirements

### To build Go Tinker

- Windows 10 or Windows 11 x64
- PowerShell 5.1 or PowerShell 7+
- Go 1.23 or newer

Node.js is not required to build this version.

The Electron desktop runtime is downloaded automatically by Go Tinker on the first launch.

### To use Go Tinker with Laravel

- PHP available in `PATH`, or configured through `TINKER_PHP`
- A Laravel project containing the `artisan` file
- Laravel Tinker installed in the project

Most Laravel applications already include Tinker. You can verify it with:

```powershell
php artisan tinker
```

## Project structure

```text
GoTinker/
├── app/
│   ├── backend/
│   │   ├── web/
│   │   │   ├── app.js
│   │   │   ├── icon.svg
│   │   │   ├── index.html
│   │   │   └── styles.css
│   │   ├── exec_other.go
│   │   ├── exec_windows.go
│   │   ├── http.go
│   │   ├── main.go
│   │   ├── project.go
│   │   ├── runner.go
│   │   ├── sqlite_other.go
│   │   ├── sqlite_windows.go
│   │   ├── state.go
│   │   ├── types.go
│   │   └── go.mod
│   │
│   └── desktop/
│       ├── main.js
│       └── package.json
│
├── assets/
│   └── app.ico
│
├── bootstrap/
│   ├── payload/
│   ├── dialog_windows.go
│   ├── install_windows.go
│   ├── main_other.go
│   ├── main_windows.go
│   ├── payload_windows.go
│   ├── progress_windows.go
│   └── go.mod
│
├── dist/
├── build.ps1
├── clean.ps1
├── run.ps1
├── .gitignore
└── README.md
```

## Architecture

```text
GoTinker.exe
│
├── Go bootstrap
│   ├── first-launch installer
│   ├── runtime download screen
│   ├── SHA-256 verification
│   ├── runtime extraction
│   └── local application installation
│
├── GoTinkerRuntime.exe
│   └── dedicated Electron desktop window
│
└── gotinker-backend.exe
    ├── Laravel runner
    ├── project indexer
    ├── autocomplete engine
    ├── project browser
    ├── workspace manager
    └── SQLite persistence
```

The desktop application starts the Go backend on an available local port bound to `127.0.0.1`. The address is not exposed in the interface, and the backend is terminated with the application.

## Building from source

### 1. Install Go

Install Go 1.23 or newer and confirm that it is available:

```powershell
go version
```

Expected example:

```text
go version go1.23.x windows/amd64
```

### 2. Open PowerShell in the project directory

Example:

```powershell
cd C:\projects\GoTinker
```

The directory must contain:

```text
build.ps1
app\
bootstrap\
assets\
```

### 3. Allow the build script if PowerShell blocks it

If Windows prevents local PowerShell scripts from running, use this for the current terminal session:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

This affects only the current PowerShell process.

### 4. Build the application

Run:

```powershell
.\build.ps1
```

The script automatically:

1. creates the required payload and output directories
2. validates the Go backend
3. compiles `gotinker-backend.exe` for Windows x64
4. copies the desktop application files into the bootstrap payload
5. copies the application icon
6. validates the bootstrap project
7. compiles the final Windows GUI executable

The final executable is generated at:

```text
dist\GoTinker.exe
```

### 5. Run the compiled application

Run:

```powershell
.\dist\GoTinker.exe
```

Or use:

```powershell
.\run.ps1
```

`run.ps1` automatically builds the project first when `dist\GoTinker.exe` does not exist.

## Clean build artifacts

Run:

```powershell
.\clean.ps1
```

This removes the generated executable and the compiled backend payload.

To perform a clean rebuild:

```powershell
.\clean.ps1
.\build.ps1
```

## First launch

When the Electron desktop runtime is not installed yet, Go Tinker displays a setup window with:

- download percentage
- downloaded size
- total size
- download speed
- download source
- verification status
- installation status
- extraction progress

The runtime is stored in:

```text
%LOCALAPPDATA%\GoTinker\runtime
```

The application files are installed separately under:

```text
%LOCALAPPDATA%\GoTinker\app
```

The runtime is reused between compatible Go Tinker versions and does not need to be downloaded on every launch.

An internet connection is required only when the runtime still needs to be downloaded.

## Local data

The user workspace is stored in:

```text
%APPDATA%\GoTinker\gotinker.sqlite
```

The SQLite database stores information such as:

- open tabs
- tab content
- saved snippets
- execution history
- selected project
- interface state

Removing or replacing the executable does not normally remove this workspace database.

## Using a Laravel project

Select the root directory of a Laravel project containing:

```text
artisan
```

Example:

```php
use App\Models\User;

User::find(1);
```

You can also use Eloquent chains:

```php
use App\Models\User;

User::query()
    ->where('active', true)
    ->latest()
    ->limit(10)
    ->get();
```

Go Tinker attempts to return the value of the final valid expression automatically.

## Autocomplete

Go Tinker indexes the selected Laravel project's `app/` directory.

Typing:

```php
use App\Models\
```

can suggest project models such as:

```text
App\Models\User
App\Models\Contact
App\Models\Conversation
```

Typing:

```php
User::
```

shows static and Eloquent suggestions.

Typing:

```php
User::where()->
```

shows Builder methods and model-aware field shortcuts.

Typing:

```php
$user = User::find(1);

$user->
```

can show:

- `$fillable` fields
- model properties
- casts
- model methods
- relationships
- common Eloquent instance methods

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Execute code |
| `Ctrl + S` | Save snippet |
| `Ctrl + Space` | Open autocomplete |
| `Tab` | Accept autocomplete suggestion |
| `Enter` | Accept selected autocomplete suggestion |

## PHP executable configuration

By default, Go Tinker uses:

```text
php
```

from the Windows `PATH`.

To use a specific PHP executable, set `TINKER_PHP` before launching Go Tinker:

```powershell
$env:TINKER_PHP = "C:\php\php.exe"
.\dist\GoTinker.exe
```

## Security

Go Tinker executes PHP code inside the selected Laravel project.

Use it only with projects and environments you trust.

The internal backend:

- listens only on `127.0.0.1`
- uses an available local port selected at startup
- is not exposed to the local network
- is terminated with the desktop application

The Electron window uses context isolation and sandboxing and does not enable Node integration inside the application UI.

## Troubleshooting

### `go` is not recognized

Install Go and reopen PowerShell.

Verify:

```powershell
go version
```

### PowerShell blocks `build.ps1`

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build.ps1
```

### PHP is not found

Verify:

```powershell
php -v
```

If PHP is installed outside the `PATH`, configure:

```powershell
$env:TINKER_PHP = "C:\path\to\php.exe"
```

### Laravel project is not recognized

Make sure the selected directory contains:

```text
artisan
composer.json
app\
```

### Runtime needs to be downloaded again

Close all Go Tinker processes and remove:

```text
%LOCALAPPDATA%\GoTinker\runtime
```

Open Go Tinker again. The setup screen will download and reinstall the runtime.

### Application or backend process remains open

Close Go Tinker normally first. If necessary, use Task Manager to terminate:

```text
GoTinkerRuntime.exe
gotinker-backend.exe
```

## License

Add your project license here before distributing Go Tinker publicly.

---

# Português

## Visão geral

O Go Tinker transforma o fluxo do `php artisan tinker` em uma experiência visual de desktop.

O aplicativo possui um editor PHP à esquerda e um painel de resposta formatada à direita. Ele oferece múltiplas abas persistentes, autocomplete baseado no projeto Laravel, sugestões do Eloquent, histórico de execuções, snippets salvos, formatação de JSON e persistência local em SQLite.

Na primeira execução, o Go Tinker baixa o runtime desktop necessário e exibe uma tela própria com o progresso. O runtime é baixado apenas uma vez e reaproveitado nas próximas execuções.

## Recursos

- Aplicativo Windows standalone
- Janela própria de aplicativo
- Não abre navegador externo
- Sem dependência do Edge WebView2
- Syntax highlighting para PHP
- Autocomplete baseado no projeto Laravel
- Autocomplete para classes dentro de `app/`
- Sugestões para Models, Services, Controllers e outras classes da aplicação
- Autocomplete de namespaces como `App\\Models\\`
- Sugestões estáticas e do Eloquent após `::`
- Sugestões do Eloquent Builder em cadeias como `User::where()->`
- Sugestões de instância após `->`
- Sugestões de campos `$fillable`
- Sugestões de propriedades e casts do Model
- Sugestões de métodos e relacionamentos do Model
- Abas persistentes
- Snippets salvos
- Histórico de execuções
- Workspace local em SQLite
- Modos de saída Auto, Terminal, JSON e Texto
- Detecção e formatação automática de JSON
- Navegador de projetos com acesso aos discos disponíveis no Windows
- Backend Go sem janela de terminal
- Serviço interno limitado a `127.0.0.1`
- Tela de progresso para download do runtime na primeira execução

## Requisitos

### Para compilar o Go Tinker

- Windows 10 ou Windows 11 x64
- PowerShell 5.1 ou PowerShell 7+
- Go 1.23 ou superior

Node.js não é necessário para compilar esta versão.

O runtime desktop do Electron é baixado automaticamente pelo Go Tinker na primeira execução.

### Para usar o Go Tinker com Laravel

- PHP disponível no `PATH` ou configurado por `TINKER_PHP`
- Projeto Laravel contendo o arquivo `artisan`
- Laravel Tinker instalado no projeto

A maioria dos projetos Laravel já possui o Tinker. Você pode validar com:

```powershell
php artisan tinker
```

## Estrutura do projeto

```text
GoTinker/
├── app/
│   ├── backend/
│   │   ├── web/
│   │   │   ├── app.js
│   │   │   ├── icon.svg
│   │   │   ├── index.html
│   │   │   └── styles.css
│   │   ├── exec_other.go
│   │   ├── exec_windows.go
│   │   ├── http.go
│   │   ├── main.go
│   │   ├── project.go
│   │   ├── runner.go
│   │   ├── sqlite_other.go
│   │   ├── sqlite_windows.go
│   │   ├── state.go
│   │   ├── types.go
│   │   └── go.mod
│   │
│   └── desktop/
│       ├── main.js
│       └── package.json
│
├── assets/
│   └── app.ico
│
├── bootstrap/
│   ├── payload/
│   ├── dialog_windows.go
│   ├── install_windows.go
│   ├── main_other.go
│   ├── main_windows.go
│   ├── payload_windows.go
│   ├── progress_windows.go
│   └── go.mod
│
├── dist/
├── build.ps1
├── clean.ps1
├── run.ps1
├── .gitignore
└── README.md
```

## Arquitetura

```text
GoTinker.exe
│
├── Bootstrap Go
│   ├── instalador da primeira execução
│   ├── tela de download do runtime
│   ├── verificação SHA-256
│   ├── extração do runtime
│   └── instalação local da aplicação
│
├── GoTinkerRuntime.exe
│   └── janela desktop dedicada em Electron
│
└── gotinker-backend.exe
    ├── executor Laravel
    ├── indexador do projeto
    ├── mecanismo de autocomplete
    ├── navegador de projetos
    ├── gerenciador do workspace
    └── persistência SQLite
```

A aplicação desktop inicia o backend Go em uma porta local disponível vinculada a `127.0.0.1`. O endereço não é exibido na interface e o backend é encerrado junto com o aplicativo.

## Como compilar o código

### 1. Instale o Go

Instale o Go 1.23 ou superior e confirme que ele está disponível:

```powershell
go version
```

Exemplo esperado:

```text
go version go1.23.x windows/amd64
```

### 2. Abra o PowerShell na pasta do projeto

Exemplo:

```powershell
cd C:\projetos\GoTinker
```

A pasta deve conter:

```text
build.ps1
app\
bootstrap\
assets\
```

### 3. Libere a execução do script se o PowerShell bloquear

Se o Windows impedir a execução de scripts locais, use apenas para a sessão atual:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

Isso afeta somente o processo atual do PowerShell.

### 4. Compile o aplicativo

Execute:

```powershell
.\build.ps1
```

O script automaticamente:

1. cria as pastas necessárias de payload e saída
2. valida o backend em Go
3. compila `gotinker-backend.exe` para Windows x64
4. copia os arquivos da aplicação desktop para o payload do bootstrap
5. copia o ícone do aplicativo
6. valida o projeto bootstrap
7. compila o executável final como aplicação Windows GUI

O executável final será criado em:

```text
dist\GoTinker.exe
```

### 5. Execute o aplicativo compilado

Execute:

```powershell
.\dist\GoTinker.exe
```

Ou use:

```powershell
.\run.ps1
```

O `run.ps1` executa o build automaticamente antes de abrir quando `dist\GoTinker.exe` ainda não existe.

## Limpar arquivos de build

Execute:

```powershell
.\clean.ps1
```

Esse comando remove o executável final gerado e o backend compilado dentro do payload.

Para fazer um build limpo:

```powershell
.\clean.ps1
.\build.ps1
```

## Primeira execução

Quando o runtime desktop do Electron ainda não estiver instalado, o Go Tinker exibe uma janela de configuração contendo:

- percentual do download
- tamanho baixado
- tamanho total
- velocidade do download
- origem do download
- status da verificação
- status da instalação
- progresso da extração

O runtime fica armazenado em:

```text
%LOCALAPPDATA%\GoTinker\runtime
```

Os arquivos da aplicação são instalados separadamente em:

```text
%LOCALAPPDATA%\GoTinker\app
```

O runtime pode ser reutilizado por versões compatíveis do Go Tinker e não precisa ser baixado novamente em toda execução.

Uma conexão com a internet é necessária apenas quando o runtime ainda precisa ser baixado.

## Dados locais

O workspace do usuário é armazenado em:

```text
%APPDATA%\GoTinker\gotinker.sqlite
```

O banco SQLite armazena informações como:

- abas abertas
- conteúdo das abas
- snippets salvos
- histórico de execuções
- projeto selecionado
- estado da interface

Excluir ou substituir o executável normalmente não remove esse banco do workspace.

## Usando com um projeto Laravel

Selecione a pasta raiz do projeto Laravel que contém:

```text
artisan
```

Exemplo:

```php
use App\Models\User;

User::find(1);
```

Também é possível executar cadeias do Eloquent:

```php
use App\Models\User;

User::query()
    ->where('active', true)
    ->latest()
    ->limit(10)
    ->get();
```

O Go Tinker tenta retornar automaticamente o valor da última expressão válida.

## Autocomplete

O Go Tinker indexa o diretório `app/` do projeto Laravel selecionado.

Ao digitar:

```php
use App\Models\
```

podem aparecer sugestões como:

```text
App\Models\User
App\Models\Contact
App\Models\Conversation
```

Ao digitar:

```php
User::
```

o aplicativo mostra sugestões estáticas e do Eloquent.

Ao digitar:

```php
User::where()->
```

o aplicativo mostra métodos do Builder e atalhos relacionados aos campos do Model.

Ao digitar:

```php
$user = User::find(1);

$user->
```

podem aparecer:

- campos de `$fillable`
- propriedades do Model
- casts
- métodos do Model
- relacionamentos
- métodos comuns de instância do Eloquent

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl + Enter` | Executar código |
| `Ctrl + S` | Salvar snippet |
| `Ctrl + Espaço` | Abrir autocomplete |
| `Tab` | Aceitar sugestão do autocomplete |
| `Enter` | Aceitar sugestão selecionada |

## Configurando o executável do PHP

Por padrão, o Go Tinker utiliza:

```text
php
```

disponível no `PATH` do Windows.

Para usar um PHP específico, configure `TINKER_PHP` antes de abrir o Go Tinker:

```powershell
$env:TINKER_PHP = "C:\php\php.exe"
.\dist\GoTinker.exe
```

## Segurança

O Go Tinker executa código PHP dentro do projeto Laravel selecionado.

Use apenas com projetos e ambientes confiáveis.

O backend interno:

- escuta somente em `127.0.0.1`
- usa uma porta local disponível escolhida na inicialização
- não é exposto para a rede local
- é encerrado junto com a aplicação desktop

A janela Electron utiliza isolamento de contexto e sandbox e não habilita integração Node dentro da interface da aplicação.

## Solução de problemas

### `go` não é reconhecido

Instale o Go e abra novamente o PowerShell.

Valide com:

```powershell
go version
```

### O PowerShell bloqueia `build.ps1`

Execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build.ps1
```

### PHP não é encontrado

Valide:

```powershell
php -v
```

Se o PHP estiver fora do `PATH`, configure:

```powershell
$env:TINKER_PHP = "C:\caminho\para\php.exe"
```

### O projeto Laravel não é reconhecido

Confirme que a pasta selecionada contém:

```text
artisan
composer.json
app\
```

### Preciso baixar o runtime novamente

Feche todos os processos do Go Tinker e remova:

```text
%LOCALAPPDATA%\GoTinker\runtime
```

Abra o Go Tinker novamente. A tela de configuração fará o download e a reinstalação do runtime.

### O aplicativo ou backend ficou aberto

Primeiro tente fechar o Go Tinker normalmente. Se necessário, encerre pelo Gerenciador de Tarefas:

```text
GoTinkerRuntime.exe
gotinker-backend.exe
```

## Licença

Adicione a licença do projeto aqui antes de distribuir o Go Tinker publicamente.
