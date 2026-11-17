# Go Tinker

O Go Tinker é um aplicativo desktop para Windows que executa código PHP dentro de projetos Laravel. Ele reúne um editor de código com autocomplete baseado no projeto, collections de requests salvas, environments com variáveis, histórico de execuções, terminal Cmder integrado e armazenamento local em SQLite.

## Compilar

O Cmder é um submódulo Git em `submodules\cmder`, então clone com o parâmetro `--recurse-submodules`:

```powershell
git clone --recurse-submodules <url-do-repositorio>
```

Se você já clonou sem ele, rode `git submodule update --init --recursive`. Depois instale o Go 1.23 ou superior e o 7-Zip e execute `.\build.ps1` no PowerShell. O resultado é o `dist\GoTinker.exe` junto com a pasta `dist\cmder`.

## Usar

Selecione um projeto Laravel que contenha `artisan` e execute o código com **Ctrl+Enter**; selecione um trecho antes para executar somente a seleção. Salve requests em collections com **Ctrl+S**, adicione variáveis na aba **Variáveis** (a chave `userId` vira `$userId`) e use valores do environment no código como `{{nome}}`. Toda execução fica guardada no **Histórico**. Collections e environments podem ser importados e exportados em JSON, e arquivos `.php` podem ser importados.

Os seus dados ficam em `%APPDATA%\GoTinker\gotinker.sqlite`.

## Idiomas

Abra **Configurações** (ícone de engrenagem no canto superior direito) para escolher entre português do Brasil, inglês, espanhol, japonês, russo e chinês simplificado. As traduções ficam em `app/backend/web/lang/`, um arquivo JSON por idioma.

Veja o [README principal](../README.md) para o guia completo.
