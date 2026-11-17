# Go Tinker

Go Tinker is a Windows desktop application for running PHP code inside Laravel projects. You write code in an editor with project-aware autocomplete, send it, and read the formatted result. Requests can be saved in collections, parameterized with variables and environments, and reopened later from history.

## Cloning

Cmder is included as a Git submodule ([cmderdev/cmder](https://github.com/cmderdev/cmder)) in `submodules\cmder`. Clone with `--recurse-submodules`, otherwise that folder stays empty and the build fails:

```powershell
git clone --recurse-submodules <repository-url>
```

Already cloned without it? Run this inside the project folder:

```powershell
git submodule update --init --recursive
```

## Documentation by language

- [English](docs/README.en.md)
- [Português (Brasil)](docs/README.pt-BR.md)
- [日本語](docs/README.ja.md)
- [Русский](docs/README.ru.md)
- [简体中文](docs/README.zh-CN.md)
- [Español](docs/README.es.md)

The interface is available in the same six languages. Change it in **Settings** (gear icon in the top-right corner). Translations live in `app/backend/web/lang/`, one JSON file per language.

---

# English

## Overview

Go Tinker replaces the `php artisan tinker` workflow with a desktop workspace:

- a sidebar with **Collections**, **Environments** and **History**
- tabs for open requests, with unsaved-change markers
- a code editor with syntax highlighting, autocomplete, parameter hints, hover documentation and live syntax checking
- a response panel with status, time, size, memory and result type
- an integrated Cmder terminal opened in the project folder

The application runs in its own window. It does not open an external browser and does not depend on Edge WebView2. Everything is stored locally.

## Features

### Workspace

- Collections with nested folders, drag and drop, inline rename (F2), duplicate, export and delete
- Environments: sets of variables used in code as `{{name}}`
- History of every execution, grouped by day, with the full response
- Tabs restored on the next launch, reorderable by dragging, closable with the middle mouse button
- Preview tabs: opening an item from the sidebar shows it in an italic tab that is reused until you edit it or double-click it
- Save dialog to choose a collection or folder, or create a new one on the spot
- Rich text description for each request: headings, bold, italic, lists, checklists, links, quotes and code blocks
- Import and export of collections and environments as JSON, plus import of `.php` files
- Quick search (Ctrl+P) across open tabs, saved requests, environments and commands
- Response below or beside the code, switched with the two buttons in the response header, `Ctrl + Alt + L` or **Settings**
- Open, edit and save PHP files from the project

### Code editor

- The same editor engine used by Visual Studio Code, with the Dark+ color theme
- Minimap, bracket pair colors, sticky scroll, multi-cursor, find and replace, code folding and command palette (F1)
- Autocomplete for project classes, Composer packages, Laravel helpers and PHP functions
- Automatic `use` statements when a class is accepted
- Live syntax checking with `php -l`
- Runtime errors underlined on the line where they happened

### Execution and response

- Runs the whole editor, or only the selected code
- Returns the value of the last expression automatically, with or without a trailing `;`
- Request variables injected as PHP variables
- **Body** view: formatted JSON with folding, or colored dump when the value is not JSON
- **Raw** view and **Preview** view for HTML strings, `Response` objects and routes
- **Output** view with `echo`, `dump()` and the result dump
- Status, time, size, peak memory and result type of every execution
- Copy the response, save it to a file, search inside it and toggle word wrap

### Terminal

- Cmder sessions opened in the project directory
- Multiple sessions, copy and paste, and alias creation
- Opened and closed with Ctrl+`

## Requirements

### To build

- Windows 10 or Windows 11 x64
- PowerShell 5.1 or PowerShell 7+
- Go 1.23 or newer
- Git, to clone the repository together with the Cmder submodule
- 7-Zip, used on the first build to extract the Cmder dependencies (in `PATH` or installed in `C:\Program Files\7-Zip`)

Node.js is not required.

### To use with Laravel

- PHP available in `PATH`, or configured through `TINKER_PHP`
- A Laravel project with the `artisan` file
- Composer dependencies installed (`composer install`), so that `vendor/autoload.php` exists

An internet connection is only needed the first time, to download the desktop runtime.

## Building from source

1. Clone the repository **with the `--recurse-submodules` parameter**. Cmder lives in the `submodules\cmder` submodule, and without this parameter the folder is downloaded empty:

   ```powershell
   git clone --recurse-submodules <repository-url>
   ```

   If you already cloned without it, download the submodule from inside the project folder:

   ```powershell
   git submodule update --init --recursive
   ```

2. Install Go and confirm it is available:

   ```powershell
   go version
   ```

3. Open PowerShell in the project folder (the one containing `build.ps1`, `app\`, `bootstrap\` and `submodules\`).

4. If PowerShell blocks local scripts, allow them for the current session only:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   ```

5. Build:

   ```powershell
   .\build.ps1
   ```

On the first build, the script downloads the Cmder dependencies listed in `submodules\cmder\vendor\sources.json` (Git for Windows, Clink, ConEmu and clink-completions) and extracts them with 7-Zip. This needs an internet connection and takes a few minutes. Later builds reuse them and only download again when that list changes.

The script then compiles the Go backend (with the web interface embedded), copies the desktop files and the icon into the launcher payload, copies Cmder to `dist\cmder`, and compiles the final launcher.

The result is:

```text
dist\GoTinker.exe
dist\cmder\
```

Distribute both together: the launcher installs Cmder from the `cmder` folder next to it.

To run the build:

```powershell
.\run.ps1
```

`run.ps1` builds the project first when `dist\GoTinker.exe` does not exist.

To remove the build output:

```powershell
.\clean.ps1
```

## First launch

On the first launch, Go Tinker downloads the desktop runtime (Electron 44.5.1), verifies its SHA-256 checksum and extracts it, showing a progress window with percentage, size, speed and installation status. The runtime is reused by later versions.

Every new version installs its files in a separate folder. When a new version starts, it removes the folders of older versions and leftover cache folders from previous releases. The workspace database is never removed.

## Where data is stored

| Location | Contents |
|---|---|
| `%APPDATA%\GoTinker\gotinker.sqlite` | Collections, environments, history, open tabs, settings and SSH profiles |
| `%LOCALAPPDATA%\GoTinker\app\<version>` | Installed application files |
| `%LOCALAPPDATA%\GoTinker\runtime\44.5.1` | Desktop runtime |
| `%LOCALAPPDATA%\GoTinker\cmder` | Cmder terminal |
| `%LOCALAPPDATA%\GoTinker\profile` | Window cache |
| `%LOCALAPPDATA%\GoTinker\cache` | Class index cache and the PHP runner script |

`%APPDATA%\GoTinker` only keeps your data. Everything under `%LOCALAPPDATA%\GoTinker` can be rebuilt by the application. The data folder is also shown in **Settings**.

When upgrading from 1.3.x, saved snippets and their folders are converted into collections automatically, and the execution history is kept.

## Using Go Tinker

### Selecting a project

Click the project bar at the top of the request (or the project name in the status bar) and browse to the root of a Laravel project. Folders that contain `artisan` are marked as Laravel. The arrow next to the project bar lists recent projects.

Each request keeps its own project. The project bar also shows the detected Laravel and PHP versions.

### Writing and running code

```php
use App\Models\User;

User::query()
    ->where('active', true)
    ->latest()
    ->limit(10)
    ->get();
```

Press **Ctrl+Enter** or click **Send**. If code is selected, only the selection runs. **Ctrl+Shift+Enter** always runs the whole editor.

Each execution starts a new PHP process that boots the Laravel application, runs the code and returns the value of the last expression. Nothing is shared between executions. While it runs, **Send** becomes **Cancel**.

### Request variables

The **Variables** tab of a request holds key and value rows. Each enabled row becomes a PHP variable available in the code:

| Key | Value | Available in code as |
|---|---|---|
| `userId` | `5` | `$userId` (int) |
| `active` | `true` | `$active` (bool) |
| `ids` | `[1, 2, 3]` | `$ids` (array) |
| `email` | `ana@example.com` | `$email` (string) |

Values that are valid JSON are decoded; everything else is passed as a string. **Bulk Edit** switches to a `key:value` text view.

Request variables are **local**: they only exist in that request. A key cannot appear twice in the list, and it cannot reuse a key from the active environment. When that happens, the key turns red, the reason is shown below the table, and **Send** is blocked until it is fixed.

### Environments

An environment is a named set of **public** variables. Create one in **Environments** in the sidebar and add variables. The first environment you create becomes active automatically; to switch, use the environment selector on the right of the tab bar.

While an environment is active, its variables are available in **every request**, in two ways:

```php
User::find($userId);
User::find({{userId}});
```

- `$userId`: a PHP variable, just like a request variable. JSON values are decoded.
- `{{userId}}`: the text is replaced by the value before the code is sent. It also works inside request variable values.

Keys with dots or dashes (such as `api.url`) only work as `{{api.url}}`. Known `{{…}}` variables are highlighted in orange and unknown ones in red. Hovering a variable shows its value.

### Saving requests

Press **Ctrl+S** to save. A new request opens the save dialog, where you choose a name, an optional description and the collection or folder; you can create a new collection or folder from the same dialog. Saved requests are updated in place with Ctrl+S. **Ctrl+Shift+S** saves a copy.

A dot on the tab marks unsaved changes. Closing a tab with unsaved changes asks whether to save, discard or cancel.

### History

Every execution is recorded in **History** with the code, the variables, the project and the response. Click an entry to reopen it, or use its menu to save it to a collection or delete it.

### Import and export

- **Export**: menu of a collection, or of an environment, in the sidebar
- **Import**: **Import** button in the sidebar. Drop files or paste text. Accepted inputs are collection JSON files (including the ones exported by Go Tinker), environment JSON files and `.php` files. PHP files are added to the **Imported** collection.

### PHP files

**Ctrl+O** opens a PHP file from disk in a tab. **Ctrl+S** writes it back to the file. **Save as** stores a copy of its code as a request in a collection.

### HTML, responses and routes

When the code returns HTML, a `Response` object or a route, the **Preview** view renders it:

```php
view('welcome')->render();
```

```php
response()->json(['ok' => true]);
```

```php
Route::getRoutes()->getByName('dashboard');
```

For routes with parameters, fill the parameters in the preview bar and click **Generate**.

## Autocomplete

Go Tinker reads the Composer autoload maps of the selected project to list every class in `app/`, `database/` and `vendor/`. The list is cached and only rebuilt when Composer files change, so opening a project is fast. Class details (methods, signatures, properties, relations) are loaded on demand.

Suggestions include:

- class names, with the `use` statement added automatically
- namespaces while typing `App\Models\`
- static methods and Eloquent methods after `User::`, starting with the model's own local scopes
- chained types: `User::where(...)->get()->` suggests collection methods, `User::first()->` suggests attributes and relations
- model attributes from `$fillable`, `$casts`, `casts()`, `@property` and accessors
- relations detected from `hasMany`, `belongsTo` and similar methods
- column names inside `where('…')`, `orderBy('…')`, `pluck('…')` and similar
- relation names inside `with('…')`, `has('…')` and `whereHas('…')`
- facade methods such as `DB::table(...)->`
- Laravel helpers (`now()`, `collect()`, `config()`, …) and common PHP functions
- variables from the code and from the request variables, after `$`
- environment variable names after `{{`

Parameter hints appear when typing `(` and `,`. Hovering a class, method, relation or variable shows its type and documentation.

The status bar shows how many classes were indexed. Click it to reindex the project after adding new classes.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Send (only the selection, when there is one) |
| `Ctrl + Shift + Enter` | Run the whole editor |
| `Ctrl + S` | Save |
| `Ctrl + Shift + S` | Save as |
| `Ctrl + T` / `Ctrl + N` | New tab |
| `Ctrl + W` | Close tab |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Next / previous tab |
| `Ctrl + P` | Quick search |
| `Ctrl + Shift + P` | Application commands |
| `Ctrl + O` | Open PHP file |
| `Ctrl + \` | Show or hide the sidebar |
| `` Ctrl + ` `` | Show or hide the terminal |
| `Ctrl + Alt + L` | Show the response below / beside the code |
| `Ctrl + ,` | Settings |
| `Ctrl + Space` | Show suggestions |
| `F1` | Editor command palette |
| `Ctrl + F` | Find |
| `Ctrl + /` | Toggle line comment |
| `F2` | Rename the selected sidebar item |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TINKER_PHP` | `php` from `PATH` | PHP executable used to run code |
| `GO_TINKER_TIMEOUT_SECONDS` | `120` | Maximum execution time |

Example:

```powershell
$env:TINKER_PHP = "C:\php\php.exe"
.\dist\GoTinker.exe
```

**Settings** also controls the language, editor font size, minimap, word wrap, syntax checking and the response position.

## Project structure

```text
GoTinker/
├── app/
│   ├── backend/              Go backend with the embedded interface
│   │   ├── main.go           server and routes
│   │   ├── index.go          project class index
│   │   ├── classinfo.go      class details for autocomplete
│   │   ├── runner.go         code execution
│   │   ├── project.go        project status, folder browser and syntax check
│   │   ├── project_io.go     files and SSH profiles
│   │   ├── cmder_windows.go  integrated terminal
│   │   ├── state.go          workspace persistence
│   │   ├── sqlite_*.go       SQLite storage
│   │   ├── secret_*.go       password protection (DPAPI)
│   │   └── web/
│   │       ├── index.html
│   │       ├── styles.css
│   │       ├── js/           interface modules
│   │       ├── lang/         translations
│   │       └── vendor/       editor, rich text and terminal libraries
│   └── desktop/              desktop window (Electron main process)
├── assets/                   application icon
├── bootstrap/                launcher and installer
├── docs/                     short guide per language
├── submodules/
│   └── cmder/                Cmder (Git submodule)
├── LICENSE                   non-commercial license
├── build.ps1
├── clean.ps1
└── run.ps1
```

## Architecture

```text
GoTinker.exe (launcher)
│   downloads and verifies the runtime on the first launch
│   installs the application files and Cmder
│
├── GoTinkerRuntime.exe
│   └── application window
│
└── gotinker-backend.exe   (127.0.0.1, random port)
    ├── interface files
    ├── class index and autocomplete data
    ├── syntax check (php -l)
    ├── code execution (one PHP process per run)
    ├── terminal sessions
    └── SQLite workspace
```

The backend is started by the window on a free local port and stopped when the window closes.

## Security

Go Tinker executes PHP code inside the selected Laravel project, with full access to its database, files and services. Use it only with projects and environments you trust.

- The backend listens only on `127.0.0.1`, on a port chosen at startup
- Requests coming from other sites or other host names are rejected
- The window uses context isolation and sandboxing, without Node integration in the interface
- Saved SSH passwords are encrypted with Windows DPAPI for the current user

## Troubleshooting

**`go` is not recognized**: install Go, reopen PowerShell and run `go version`.

**PowerShell blocks `build.ps1`**: run `Set-ExecutionPolicy -Scope Process Bypass` and try again.

**"Cmder nao encontrado em submodules\cmder"**: the repository was cloned without `--recurse-submodules`. Run `git submodule update --init --recursive` and build again.

**"Missing 7z!"**: install 7-Zip and build again.

**PHP is not found**: check `php -v`. If PHP is outside the `PATH`, set `TINKER_PHP`.

**The project is not recognized**: the selected folder must contain `artisan`.

**"vendor/autoload.php not found"**: run `composer install` in the project.

**A new class does not appear in the suggestions**: click the class count in the status bar to reindex.

**The terminal does not open**: the session may point to a folder that was moved or deleted. Close the session and open a new one with `+`.

**The runtime needs to be downloaded again**: close Go Tinker and remove `%LOCALAPPDATA%\GoTinker\runtime`.

**Display problems**: close Go Tinker and remove `%LOCALAPPDATA%\GoTinker\profile`. Your data is not affected.

**A process stays open**: close Go Tinker normally; if needed, end `GoTinkerRuntime.exe` and `gotinker-backend.exe` in Task Manager.

## License

Go Tinker is **free to use, copy and modify for non-commercial purposes**. Using it as a tool in your own work, including inside companies, is allowed.

**Commercial use is prohibited**: Go Tinker may not be sold, charged for, included in a paid product or service, or offered as a paid service, in whole or in part, without prior written permission from the author.

Third-party components (Cmder, Electron, Monaco Editor, Quill and xterm.js) keep their own licenses. The full terms are in [LICENSE](LICENSE).

Created by **Daniel Vitório Augusto**.

---

# Português

## Visão geral

O Go Tinker substitui o fluxo do `php artisan tinker` por um ambiente de trabalho desktop:

- barra lateral com **Collections**, **Environments** e **Histórico**
- abas para as requests abertas, com indicação de alterações não salvas
- editor de código com destaque de sintaxe, autocomplete, dicas de parâmetros, documentação ao passar o mouse e verificação de sintaxe em tempo real
- painel de resposta com status, tempo, tamanho, memória e tipo do resultado
- terminal Cmder integrado, aberto na pasta do projeto

O aplicativo roda em janela própria. Não abre navegador externo e não depende do Edge WebView2. Tudo fica armazenado localmente.

## Recursos

### Workspace

- Collections com pastas e subpastas, arrastar e soltar, renomear no lugar (F2), duplicar, exportar e excluir
- Environments: conjuntos de variáveis usadas no código como `{{nome}}`
- Histórico de todas as execuções, agrupado por dia, com a resposta completa
- Abas restauradas na próxima abertura, reordenáveis arrastando e fechadas com o botão do meio do mouse
- Abas de pré-visualização: abrir um item da barra lateral mostra uma aba em itálico, reaproveitada até você editar ou dar duplo clique
- Diálogo de salvar para escolher a collection ou a pasta, ou criar uma nova na hora
- Descrição com texto formatado em cada request: títulos, negrito, itálico, listas, listas de tarefas, links, citações e blocos de código
- Importação e exportação de collections e environments em JSON, além de importação de arquivos `.php`
- Busca rápida (Ctrl+P) em abas abertas, requests salvas, environments e comandos
- Resposta embaixo ou ao lado do código, alternada pelos dois botões no cabeçalho da resposta, por `Ctrl + Alt + L` ou em **Configurações**
- Abrir, editar e salvar arquivos PHP do projeto

### Editor de código

- O mesmo motor de editor usado pelo Visual Studio Code, com o tema de cores Dark+
- Minimapa, cores por par de colchetes, sticky scroll, múltiplos cursores, localizar e substituir, dobra de código e paleta de comandos (F1)
- Autocomplete de classes do projeto, pacotes do Composer, helpers do Laravel e funções do PHP
- Inclusão automática do `use` ao aceitar uma classe
- Verificação de sintaxe em tempo real com `php -l`
- Erros de execução sublinhados na linha onde aconteceram

### Execução e resposta

- Executa o editor inteiro ou somente o trecho selecionado
- Retorna automaticamente o valor da última expressão, com ou sem `;` no final
- Variáveis da request injetadas como variáveis PHP
- Visualização **Body**: JSON formatado com dobra, ou dump colorido quando o valor não é JSON
- Visualização **Raw** e visualização **Preview** para strings HTML, objetos `Response` e rotas
- Aba **Saída** com `echo`, `dump()` e o dump do resultado
- Status, tempo, tamanho, pico de memória e tipo do resultado de cada execução
- Copiar a resposta, salvar em arquivo, buscar dentro dela e alternar a quebra de linha

### Terminal

- Sessões do Cmder abertas na pasta do projeto
- Várias sessões, copiar e colar e criação de alias
- Abre e fecha com Ctrl+`

## Requisitos

### Para compilar

- Windows 10 ou Windows 11 x64
- PowerShell 5.1 ou PowerShell 7+
- Go 1.23 ou superior
- Git, para clonar o repositório junto com o submódulo do Cmder
- 7-Zip, usado no primeiro build para extrair as dependências do Cmder (no `PATH` ou instalado em `C:\Program Files\7-Zip`)

Node.js não é necessário.

### Para usar com Laravel

- PHP disponível no `PATH` ou configurado por `TINKER_PHP`
- Projeto Laravel com o arquivo `artisan`
- Dependências do Composer instaladas (`composer install`), para que exista `vendor/autoload.php`

A conexão com a internet só é necessária na primeira execução, para baixar o runtime desktop.

## Como compilar

1. Clone o repositório **com o parâmetro `--recurse-submodules`**. O Cmder fica no submódulo `submodules\cmder` e, sem esse parâmetro, a pasta é baixada vazia:

   ```powershell
   git clone --recurse-submodules <url-do-repositorio>
   ```

   Se você já clonou sem ele, baixe o submódulo de dentro da pasta do projeto:

   ```powershell
   git submodule update --init --recursive
   ```

2. Instale o Go e confirme que ele está disponível:

   ```powershell
   go version
   ```

3. Abra o PowerShell na pasta do projeto (a que contém `build.ps1`, `app\`, `bootstrap\` e `submodules\`).

4. Se o PowerShell bloquear scripts locais, libere apenas para a sessão atual:

   ```powershell
   Set-ExecutionPolicy -Scope Process Bypass
   ```

5. Compile:

   ```powershell
   .\build.ps1
   ```

No primeiro build, o script baixa as dependências do Cmder listadas em `submodules\cmder\vendor\sources.json` (Git for Windows, Clink, ConEmu e clink-completions) e extrai tudo com o 7-Zip. Isso precisa de internet e leva alguns minutos. Os builds seguintes reaproveitam esses arquivos e só baixam de novo quando essa lista muda.

Depois o script compila o backend em Go (com a interface embutida), copia os arquivos desktop e o ícone para o payload do inicializador, copia o Cmder para `dist\cmder` e compila o inicializador final.

O resultado é:

```text
dist\GoTinker.exe
dist\cmder\
```

Distribua os dois juntos: o inicializador instala o Cmder a partir da pasta `cmder` ao lado dele.

Para executar o build:

```powershell
.\run.ps1
```

O `run.ps1` compila o projeto antes quando `dist\GoTinker.exe` ainda não existe.

Para remover os arquivos gerados:

```powershell
.\clean.ps1
```

## Primeira execução

Na primeira execução, o Go Tinker baixa o runtime desktop (Electron 44.5.1), confere o checksum SHA-256 e extrai os arquivos, mostrando uma janela de progresso com percentual, tamanho, velocidade e status da instalação. O runtime é reaproveitado pelas versões seguintes.

Cada versão nova instala seus arquivos em uma pasta separada. Ao iniciar, a versão nova remove as pastas das versões anteriores e as pastas de cache deixadas por versões antigas. O banco do workspace nunca é removido.

## Onde os dados ficam

| Local | Conteúdo |
|---|---|
| `%APPDATA%\GoTinker\gotinker.sqlite` | Collections, environments, histórico, abas abertas, configurações e perfis SSH |
| `%LOCALAPPDATA%\GoTinker\app\<versão>` | Arquivos instalados do aplicativo |
| `%LOCALAPPDATA%\GoTinker\runtime\44.5.1` | Runtime desktop |
| `%LOCALAPPDATA%\GoTinker\cmder` | Terminal Cmder |
| `%LOCALAPPDATA%\GoTinker\profile` | Cache da janela |
| `%LOCALAPPDATA%\GoTinker\cache` | Cache do índice de classes e script executor do PHP |

`%APPDATA%\GoTinker` guarda somente os seus dados. Tudo em `%LOCALAPPDATA%\GoTinker` pode ser recriado pelo aplicativo. A pasta de dados também aparece em **Configurações**.

Ao atualizar a partir da versão 1.3.x, os snippets salvos e suas pastas são convertidos em collections automaticamente, e o histórico de execuções é mantido.

## Usando o Go Tinker

### Selecionando o projeto

Clique na barra do projeto no topo da request (ou no nome do projeto na barra de status) e navegue até a raiz de um projeto Laravel. Pastas que contêm `artisan` aparecem marcadas como Laravel. A seta ao lado da barra do projeto lista os projetos recentes.

Cada request guarda o seu próprio projeto. A barra do projeto também mostra as versões detectadas do Laravel e do PHP.

### Escrevendo e executando código

```php
use App\Models\User;

User::query()
    ->where('active', true)
    ->latest()
    ->limit(10)
    ->get();
```

Pressione **Ctrl+Enter** ou clique em **Enviar**. Se houver código selecionado, somente a seleção é executada. **Ctrl+Shift+Enter** sempre executa o editor inteiro.

Cada execução inicia um novo processo PHP que inicializa a aplicação Laravel, executa o código e devolve o valor da última expressão. Nada é compartilhado entre execuções. Durante a execução, o botão **Enviar** vira **Cancelar**.

### Variáveis da request

A aba **Variáveis** de uma request tem linhas de chave e valor. Cada linha ativa vira uma variável PHP disponível no código:

| Chave | Valor | Disponível no código como |
|---|---|---|
| `userId` | `5` | `$userId` (int) |
| `active` | `true` | `$active` (bool) |
| `ids` | `[1, 2, 3]` | `$ids` (array) |
| `email` | `ana@exemplo.com` | `$email` (string) |

Valores que são JSON válido são convertidos; os demais são passados como texto. **Edição em massa** troca para uma visualização em texto no formato `chave:valor`.

As variáveis da request são **locais**: só existem naquela request. Uma chave não pode aparecer duas vezes na lista nem repetir uma chave do environment ativo. Quando isso acontece, a chave fica vermelha, o motivo aparece abaixo da tabela e o **Enviar** fica bloqueado até a correção.

### Environments

Um environment é um conjunto de variáveis **públicas** com nome. Crie um em **Environments** na barra lateral e adicione variáveis. O primeiro environment criado já fica ativo automaticamente; para trocar, use o seletor de environment à direita da barra de abas.

Enquanto um environment está ativo, as variáveis dele valem em **todas as requests**, de duas formas:

```php
User::find($userId);
User::find({{userId}});
```

- `$userId`: uma variável PHP, igual às variáveis da request. Valores JSON são convertidos.
- `{{userId}}`: o texto é substituído pelo valor antes de o código ser enviado. Também funciona dentro dos valores das variáveis da request.

Chaves com ponto ou hífen (como `api.url`) só funcionam como `{{api.url}}`. Variáveis `{{…}}` conhecidas aparecem em laranja e desconhecidas em vermelho. Passar o mouse sobre uma variável mostra o seu valor.

### Salvando requests

Pressione **Ctrl+S** para salvar. Uma request nova abre o diálogo de salvar, onde você escolhe o nome, uma descrição opcional e a collection ou pasta; dá para criar uma collection ou pasta nova no mesmo diálogo. Requests já salvas são atualizadas com Ctrl+S. **Ctrl+Shift+S** salva uma cópia.

Um ponto na aba indica alterações não salvas. Ao fechar uma aba com alterações, o Go Tinker pergunta se deve salvar, descartar ou cancelar.

### Histórico

Toda execução fica registrada em **Histórico** com o código, as variáveis, o projeto e a resposta. Clique em um item para reabrir, ou use o menu dele para salvar em uma collection ou excluir.

### Importar e exportar

- **Exportar**: menu de uma collection, ou de um environment, na barra lateral
- **Importar**: botão **Importar** na barra lateral. Solte os arquivos ou cole o texto. São aceitos arquivos JSON de collection (inclusive os exportados pelo Go Tinker), arquivos JSON de environment e arquivos `.php`. Arquivos PHP vão para a collection **Importados**.

### Arquivos PHP

**Ctrl+O** abre um arquivo PHP do disco em uma aba. **Ctrl+S** grava de volta no arquivo. **Salvar como** guarda uma cópia do código como request em uma collection.

### HTML, respostas e rotas

Quando o código retorna HTML, um objeto `Response` ou uma rota, a visualização **Preview** renderiza o resultado:

```php
view('welcome')->render();
```

```php
response()->json(['ok' => true]);
```

```php
Route::getRoutes()->getByName('dashboard');
```

Em rotas com parâmetros, preencha os parâmetros na barra da pré-visualização e clique em **Gerar**.

## Autocomplete

O Go Tinker lê os mapas de autoload do Composer do projeto selecionado para listar todas as classes de `app/`, `database/` e `vendor/`. A lista fica em cache e só é refeita quando os arquivos do Composer mudam, por isso abrir um projeto é rápido. Os detalhes de cada classe (métodos, assinaturas, propriedades, relacionamentos) são carregados sob demanda.

As sugestões incluem:

- nomes de classes, com o `use` adicionado automaticamente
- namespaces ao digitar `App\Models\`
- métodos estáticos e do Eloquent após `User::`, começando pelos scopes locais do próprio model
- tipos encadeados: `User::where(...)->get()->` sugere métodos de collection e `User::first()->` sugere atributos e relacionamentos
- atributos do model vindos de `$fillable`, `$casts`, `casts()`, `@property` e accessors
- relacionamentos detectados em métodos com `hasMany`, `belongsTo` e similares
- nomes de colunas dentro de `where('…')`, `orderBy('…')`, `pluck('…')` e similares
- nomes de relacionamentos dentro de `with('…')`, `has('…')` e `whereHas('…')`
- métodos de facades, como `DB::table(...)->`
- helpers do Laravel (`now()`, `collect()`, `config()`, …) e funções comuns do PHP
- variáveis do código e da aba Variáveis, após `$`
- nomes das variáveis do environment, após `{{`

As dicas de parâmetros aparecem ao digitar `(` e `,`. Passar o mouse sobre uma classe, método, relacionamento ou variável mostra o tipo e a documentação.

A barra de status mostra quantas classes foram indexadas. Clique nela para reindexar o projeto depois de criar classes novas.

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl + Enter` | Enviar (somente a seleção, quando houver) |
| `Ctrl + Shift + Enter` | Executar o editor inteiro |
| `Ctrl + S` | Salvar |
| `Ctrl + Shift + S` | Salvar como |
| `Ctrl + T` / `Ctrl + N` | Nova aba |
| `Ctrl + W` | Fechar aba |
| `Ctrl + Tab` / `Ctrl + Shift + Tab` | Próxima / aba anterior |
| `Ctrl + P` | Busca rápida |
| `Ctrl + Shift + P` | Comandos do aplicativo |
| `Ctrl + O` | Abrir arquivo PHP |
| `Ctrl + \` | Mostrar ou ocultar a barra lateral |
| `` Ctrl + ` `` | Mostrar ou ocultar o terminal |
| `Ctrl + Alt + L` | Mostrar a resposta embaixo / ao lado do código |
| `Ctrl + ,` | Configurações |
| `Ctrl + Espaço` | Mostrar sugestões |
| `F1` | Paleta de comandos do editor |
| `Ctrl + F` | Localizar |
| `Ctrl + /` | Comentar linha |
| `F2` | Renomear o item selecionado na barra lateral |

## Configuração

| Variável | Padrão | Função |
|---|---|---|
| `TINKER_PHP` | `php` do `PATH` | Executável do PHP usado para rodar o código |
| `GO_TINKER_TIMEOUT_SECONDS` | `120` | Tempo máximo de execução |

Exemplo:

```powershell
$env:TINKER_PHP = "C:\php\php.exe"
.\dist\GoTinker.exe
```

Em **Configurações** também é possível ajustar o idioma, o tamanho da fonte do editor, o minimapa, a quebra de linha, a verificação de sintaxe e a posição da resposta.

## Estrutura do projeto

```text
GoTinker/
├── app/
│   ├── backend/              backend em Go com a interface embutida
│   │   ├── main.go           servidor e rotas
│   │   ├── index.go          índice de classes do projeto
│   │   ├── classinfo.go      detalhes de classes para o autocomplete
│   │   ├── runner.go         execução do código
│   │   ├── project.go        status do projeto, navegador de pastas e verificação de sintaxe
│   │   ├── project_io.go     arquivos e perfis SSH
│   │   ├── cmder_windows.go  terminal integrado
│   │   ├── state.go          persistência do workspace
│   │   ├── sqlite_*.go       armazenamento SQLite
│   │   ├── secret_*.go       proteção de senhas (DPAPI)
│   │   └── web/
│   │       ├── index.html
│   │       ├── styles.css
│   │       ├── js/           módulos da interface
│   │       ├── lang/         traduções
│   │       └── vendor/       bibliotecas do editor, do texto formatado e do terminal
│   └── desktop/              janela desktop (processo principal do Electron)
├── assets/                   ícone do aplicativo
├── bootstrap/                inicializador e instalador
├── docs/                     guia curto por idioma
├── submodules/
│   └── cmder/                Cmder (submódulo Git)
├── LICENSE                   licença de uso não comercial
├── build.ps1
├── clean.ps1
└── run.ps1
```

## Arquitetura

```text
GoTinker.exe (inicializador)
│   baixa e verifica o runtime na primeira execução
│   instala os arquivos do aplicativo e o Cmder
│
├── GoTinkerRuntime.exe
│   └── janela do aplicativo
│
└── gotinker-backend.exe   (127.0.0.1, porta aleatória)
    ├── arquivos da interface
    ├── índice de classes e dados do autocomplete
    ├── verificação de sintaxe (php -l)
    ├── execução do código (um processo PHP por execução)
    ├── sessões do terminal
    └── workspace em SQLite
```

O backend é iniciado pela janela em uma porta local livre e encerrado quando a janela fecha.

## Segurança

O Go Tinker executa código PHP dentro do projeto Laravel selecionado, com acesso total ao banco de dados, aos arquivos e aos serviços dele. Use apenas com projetos e ambientes confiáveis.

- O backend escuta somente em `127.0.0.1`, em uma porta escolhida na inicialização
- Requisições vindas de outros sites ou de outros nomes de host são recusadas
- A janela usa isolamento de contexto e sandbox, sem integração Node na interface
- Senhas SSH salvas são criptografadas com o DPAPI do Windows para o usuário atual

## Solução de problemas

**`go` não é reconhecido**: instale o Go, abra o PowerShell de novo e rode `go version`.

**O PowerShell bloqueia o `build.ps1`**: rode `Set-ExecutionPolicy -Scope Process Bypass` e tente de novo.

**"Cmder nao encontrado em submodules\cmder"**: o repositório foi clonado sem `--recurse-submodules`. Rode `git submodule update --init --recursive` e compile de novo.

**"Missing 7z!"**: instale o 7-Zip e compile de novo.

**PHP não encontrado**: confira com `php -v`. Se o PHP estiver fora do `PATH`, defina `TINKER_PHP`.

**O projeto não é reconhecido**: a pasta selecionada precisa conter o `artisan`.

**"vendor/autoload.php não encontrado"**: rode `composer install` no projeto.

**Uma classe nova não aparece nas sugestões**: clique na contagem de classes na barra de status para reindexar.

**O terminal não abre**: a sessão pode apontar para uma pasta que foi movida ou apagada. Feche a sessão e abra outra com `+`.

**Preciso baixar o runtime de novo**: feche o Go Tinker e remova `%LOCALAPPDATA%\GoTinker\runtime`.

**Problemas de exibição**: feche o Go Tinker e remova `%LOCALAPPDATA%\GoTinker\profile`. Os seus dados não são afetados.

**Um processo ficou aberto**: feche o Go Tinker normalmente; se necessário, encerre `GoTinkerRuntime.exe` e `gotinker-backend.exe` no Gerenciador de Tarefas.

## Licença

O Go Tinker é **liberado para usar, copiar e modificar sem fins comerciais**. Usá-lo como ferramenta no próprio trabalho, inclusive dentro de empresas, é permitido.

**A comercialização é proibida**: o Go Tinker não pode ser vendido, cobrado, incluído em um produto ou serviço pago nem oferecido como serviço pago, no todo ou em parte, sem autorização prévia e por escrito do autor.

Os componentes de terceiros (Cmder, Electron, Monaco Editor, Quill e xterm.js) mantêm as suas próprias licenças. Os termos completos estão no arquivo [LICENSE](LICENSE).

Criado por **Daniel Vitório Augusto**.
