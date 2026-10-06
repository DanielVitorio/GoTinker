# Go Tinker

Go Tinker is a Windows desktop workspace for running PHP code inside a Laravel project. It includes project-aware autocomplete, saved snippets and collections, execution history, a Cmder-inspired terminal panel, and local SQLite storage.

## Build

Install Go 1.23 or later and run `.uild.ps1` from PowerShell. The executable is created at `dist/GoTinker.exe`.

## Use

Choose a Laravel project containing `artisan`, then run code with **Ctrl+Enter**. Select code first to run only that selection. Saved snippets support folders, annotations, Postman collection import/export, and PHP file import/export. The terminal can keep multiple project sessions.

## Languages

Choose the flag in the top bar to switch between English, Brazilian Portuguese, Japanese, Russian, Simplified Chinese, and Spanish. UI messages and flag SVGs are stored in `app/backend/web/lang/` as one JSON file per locale.
