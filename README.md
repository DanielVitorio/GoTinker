# Go Tinker

Go Tinker is a standalone Windows desktop client for running Laravel Tinker code with a fast editor, project-aware autocomplete, persistent tabs, formatted output, history, snippets, and local SQLite persistence.

The application uses a Go backend and a dedicated Electron desktop window. It does not open Opera, Chrome, or Edge and does not depend on Edge WebView2.

---

# Português

## Visão geral

O Go Tinker transforma o fluxo do `php artisan tinker` em uma experiência visual de desktop.

A interface mantém o editor PHP à esquerda e a resposta à direita, com suporte a múltiplas abas, autocomplete baseado no projeto Laravel, histórico, snippets e saída formatada.

Na primeira execução, o aplicativo baixa o runtime desktop necessário e exibe uma tela própria com o progresso do download.

## Principais recursos

- Aplicativo Windows standalone
- Janela própria, sem navegador externo
- Sem dependência do Edge WebView2
- Editor PHP com syntax highlighting
- Autocomplete baseado no código do projeto Laravel
- Sugestões para Models, Services, Controllers e classes em `app/`
- Autocomplete de namespaces como `App\\Models\\`
- Atalhos comuns do Eloquent
- Autocomplete após `->` com métodos de instância, relacionamentos, atributos e campos `$fillable`
- Múltiplas abas persistentes
- Histórico de execuções
- Snippets salvos
- Persistência local em SQLite
- Saída nos modos Auto, Terminal, JSON e Texto
- Formatação automática de JSON
- Navegação por projetos em diferentes discos
- Backend Go executado sem janela de terminal
- Serviço interno limitado a `127.0.0.1`

## Primeira execução

Quando o runtime desktop ainda não estiver instalado, o Go Tinker abre uma tela de configuração com:

- percentual do download
- tamanho baixado
- tamanho total
- velocidade de download
- origem do download
- etapa atual da instalação
- verificação de integridade
- extração do runtime

O runtime é baixado apenas uma vez e é armazenado em:

```text
%LOCALAPPDATA%\GoTinker\runtime\44.5.1
```

Depois disso, o aplicativo abre diretamente nas próximas execuções.

## Arquitetura

```text
GoTinker.exe
│
├── Bootstrap Go
│   ├── tela de download
│   ├── download do runtime
│   ├── verificação SHA-256
│   └── instalação local
│
├── GoTinkerRuntime.exe
│   └── janela desktop Electron
│
└── gotinker-backend.exe
    ├── Laravel runner
    ├── indexador de projeto
    ├── autocomplete
    ├── navegador de arquivos
    ├── workspace
    └── SQLite
```

A janela desktop inicia o backend em uma porta livre de `127.0.0.1`. A porta não é exposta na interface e o processo é encerrado junto com o aplicativo.

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

## Requisitos de desenvolvimento

- Windows 10 ou Windows 11 x64
- Go 1.23 ou superior
- PHP disponível no `PATH`
- Um projeto Laravel com `artisan`

Node.js não é necessário para gerar o executável bootstrap desta versão. O runtime Electron é baixado pelo próprio aplicativo na primeira execução.

## Compilar

No PowerShell:

```powershell
.\build.ps1
```

O build:

1. valida o backend Go
2. compila `gotinker-backend.exe`
3. copia os arquivos da janela desktop para o payload
4. valida o bootstrap
5. gera o executável final

Saída:

```text
dist\GoTinker.exe
```

## Executar

```powershell
.\run.ps1
```

Ou execute diretamente:

```text
dist\GoTinker.exe
```

## Limpar artefatos

```powershell
.\clean.ps1
```

## Dados locais

O workspace do usuário é armazenado em:

```text
%APPDATA%\GoTinker\gotinker.sqlite
```

Esse banco contém informações como abas, snippets, histórico e estado da interface.

O runtime desktop fica separado em:

```text
%LOCALAPPDATA%\GoTinker\runtime
```

## Uso com Laravel

Selecione a pasta raiz do projeto que contém o arquivo:

```text
artisan
```

Exemplo:

```php
use App\Models\User;

User::find(1);
```

Também é possível executar:

```php
App\Models\User::query()
    ->latest()
    ->limit(10)
    ->get();
```

Quando a última instrução é uma expressão válida, o runner tenta retornar automaticamente o resultado para o painel de saída.

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl + Enter` | Executar código |
| `Ctrl + S` | Salvar snippet |
| `Ctrl + Espaço` | Abrir autocomplete |
| `Tab` | Aceitar sugestão |
| `Enter` | Aceitar sugestão selecionada |

## Segurança

O Go Tinker executa código PHP dentro do projeto Laravel selecionado. Use somente em projetos e ambientes confiáveis.

O backend interno:

- escuta somente em `127.0.0.1`
- usa uma porta livre escolhida na inicialização
- não é exposto para a rede local
- é finalizado quando a janela desktop é fechada

A janela Electron usa isolamento de contexto, sandbox e não habilita integração Node no conteúdo da interface.

## Solução de problemas

### O aplicativo abria apenas na segunda tentativa

A versão 1.3.2 reforça a abertura da janela no primeiro clique, aguarda o backend por mais tempo e possui fallback para exibir a janela mesmo quando o evento visual do runtime demora a ser disparado.


### Erro “file is being used by another process”

A versão 1.3.2 mantém o runtime Electron separado dos arquivos do aplicativo e melhora o autocomplete de cadeias Eloquent como `User::where()->`, incluindo métodos do Builder e atalhos para campos do Model.

A versão 1.3 separa o runtime Electron dos arquivos do aplicativo. O launcher não sobrescreve mais `gotinker-backend.exe` a cada abertura. Isso evita o bloqueio de arquivo do Windows quando uma instância anterior ainda está encerrando.

Os arquivos ficam em:

```text
%LOCALAPPDATA%\GoTinker\runtime\44.5.1
%LOCALAPPDATA%\GoTinker\app\1.3.2
```

Você pode apagar versões antigas da pasta `runtime\44.5.1\resources\app` depois de fechar instâncias antigas do Go Tinker. A versão 1.3 não utiliza mais esse diretório para armazenar o aplicativo.



### PHP não encontrado

Confirme:

```powershell
php -v
```

Se o comando não funcionar, adicione o PHP ao `PATH` do Windows.

### Projeto Laravel não reconhecido

Confirme se a pasta selecionada contém:

```text
artisan
composer.json
app\
```

### Quero forçar um novo download do runtime

Feche o Go Tinker e remova:

```text
%LOCALAPPDATA%\GoTinker\runtime\44.5.1
```

Na próxima execução a tela de download será exibida novamente.

### O download falhou

O bootstrap tenta mais de uma origem de download. Verifique firewall, proxy, VPN e acesso HTTPS do Windows.

---

# English

## Overview

Go Tinker turns the `php artisan tinker` workflow into a desktop development experience.

The interface keeps the PHP editor on the left and the result panel on the right, with persistent tabs, Laravel-aware autocomplete, execution history, saved snippets, and formatted output.

On the first launch, the application downloads the required desktop runtime and shows a dedicated progress screen.

## Main features

- Standalone Windows application
- Dedicated desktop window
- No external browser
- No Edge WebView2 dependency
- PHP editor with syntax highlighting
- Laravel project-aware autocomplete
- Suggestions for Models, Services, Controllers, and classes inside `app/`
- Namespace completion such as `App\\Models\\`
- Common Eloquent shortcuts
- `->` autocomplete with instance methods, relationships, attributes, and `$fillable` fields
- Persistent multi-tab workspace
- Execution history
- Saved snippets
- Local SQLite persistence
- Auto, Terminal, JSON, and Text output modes
- Automatic JSON formatting
- Project browsing across multiple drives
- Hidden Go backend with no console window
- Internal service bound only to `127.0.0.1`

## First launch

If the desktop runtime is not installed yet, Go Tinker displays a setup window with:

- download percentage
- downloaded size
- total size
- download speed
- download source
- current setup stage
- integrity verification
- runtime extraction

The runtime is downloaded only once and stored at:

```text
%LOCALAPPDATA%\GoTinker\runtime\44.5.1
```

Future launches start the application directly.

## Architecture

```text
GoTinker.exe
│
├── Go bootstrap
│   ├── download screen
│   ├── runtime download
│   ├── SHA-256 verification
│   └── local installation
│
├── GoTinkerRuntime.exe
│   └── Electron desktop window
│
└── gotinker-backend.exe
    ├── Laravel runner
    ├── project indexer
    ├── autocomplete
    ├── file browser
    ├── workspace
    └── SQLite
```

The desktop window starts the backend on an available `127.0.0.1` port. The port is not exposed in the UI and the backend process is terminated when the application closes.

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

## Development requirements

- Windows 10 or Windows 11 x64
- Go 1.23 or newer
- PHP available in `PATH`
- A Laravel project containing `artisan`

Node.js is not required to build this bootstrap executable. Electron is downloaded by the application during the first launch.

## Build

Run in PowerShell:

```powershell
.\build.ps1
```

The build process:

1. validates the Go backend
2. builds `gotinker-backend.exe`
3. copies the desktop files into the bootstrap payload
4. validates the bootstrap
5. builds the final executable

Output:

```text
dist\GoTinker.exe
```

## Run

```powershell
.\run.ps1
```

Or launch directly:

```text
dist\GoTinker.exe
```

## Clean build artifacts

```powershell
.\clean.ps1
```

## Local data

The user workspace is stored at:

```text
%APPDATA%\GoTinker\gotinker.sqlite
```

This database stores information such as tabs, snippets, history, and interface state.

The desktop runtime is stored separately at:

```text
%LOCALAPPDATA%\GoTinker\runtime
```

## Laravel usage

Select the Laravel project root containing:

```text
artisan
```

Example:

```php
use App\Models\User;

User::find(1);
```

You can also run:

```php
App\Models\User::query()
    ->latest()
    ->limit(10)
    ->get();
```

When the last statement is a valid expression, the runner attempts to return its value automatically to the output panel.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Run code |
| `Ctrl + S` | Save snippet |
| `Ctrl + Space` | Open autocomplete |
| `Tab` | Accept suggestion |
| `Enter` | Accept selected suggestion |

## Security

Go Tinker executes PHP code inside the selected Laravel project. Use it only with trusted projects and environments.

The internal backend:

- listens only on `127.0.0.1`
- uses an available startup port
- is not exposed to the local network
- stops when the desktop window closes

The Electron window uses context isolation and sandboxing and does not enable Node integration inside the interface content.

## Troubleshooting

### “file is being used by another process” error

Version 1.3.2 keeps the Electron runtime separate from application files and improves autocomplete for Eloquent chains such as `User::where()->`, including Builder methods and Model field shortcuts.

Version 1.2 separates the Electron runtime from the application files. The launcher no longer overwrites `gotinker-backend.exe` on every startup. This prevents Windows file locking errors while a previous instance is still shutting down.

Files are stored in:

```text
%LOCALAPPDATA%\GoTinker\runtime\44.5.1
%LOCALAPPDATA%\GoTinker\app\1.3.2
```

Old files under `runtime\44.5.1\resources\app` can be removed after closing older Go Tinker instances. Version 1.2 no longer uses that directory for application files.



### PHP is not available

Check:

```powershell
php -v
```

If the command fails, add PHP to the Windows `PATH`.

### Laravel project is not detected

Verify that the selected folder contains:

```text
artisan
composer.json
app\
```

### Force a new runtime download

Close Go Tinker and remove:

```text
%LOCALAPPDATA%\GoTinker\runtime\44.5.1
```

The download screen will appear again on the next launch.

### Runtime download failed

The bootstrap tries multiple download sources. Check Windows firewall, proxy, VPN, and HTTPS connectivity.

## License

Use the project under the terms you define for your distribution. Third-party components keep their respective licenses.
