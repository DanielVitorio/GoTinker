# Go Tinker

O Go Tinker é um ambiente desktop para Windows que executa código PHP dentro de um projeto Laravel. Inclui autocomplete contextual, snippets e collections, histórico de execuções, terminal inspirado no Cmder e armazenamento local em SQLite.

## Compilar

Instale Go 1.23 ou superior e execute `.uild.ps1` no PowerShell. O executável será criado em `dist/GoTinker.exe`.

## Usar

Selecione um projeto Laravel que contenha `artisan` e execute o código com **Ctrl+Enter**. Selecione um trecho antes para executar somente a seleção. Os snippets aceitam pastas, anotações, importação e exportação de collections Postman e arquivos PHP. O terminal mantém várias sessões de projeto.

## Idiomas

Use a bandeira na barra superior para escolher Português do Brasil, inglês, japonês, russo, chinês simplificado ou espanhol. As mensagens da interface e o SVG da bandeira ficam em `app/backend/web/lang/`, em um arquivo JSON por idioma.
