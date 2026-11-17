# Go Tinker

Go Tinker is a Windows desktop application for running PHP code inside Laravel projects. It combines a code editor with project-aware autocomplete, collections of saved requests, environments with variables, execution history, an integrated Cmder terminal and local SQLite storage.

## Build

Cmder is a Git submodule in `submodules\cmder`, so clone with the `--recurse-submodules` parameter:

```powershell
git clone --recurse-submodules <repository-url>
```

If you already cloned without it, run `git submodule update --init --recursive`. Then install Go 1.23 or later and 7-Zip, and run `.\build.ps1` from PowerShell. The output is `dist\GoTinker.exe` together with the `dist\cmder` folder.

## Use

Select a Laravel project containing `artisan` and run code with **Ctrl+Enter**; select a fragment first to run only that selection. Save requests in collections with **Ctrl+S**, add variables in the **Variables** tab (key `userId` becomes `$userId`) and use environment values in code as `{{name}}`. Every execution is kept in **History**. Collections and environments can be imported and exported as JSON, and `.php` files can be imported.

Your data is stored in `%APPDATA%\GoTinker\gotinker.sqlite`.

## Languages

Open **Settings** (gear icon in the top-right corner) to switch between Brazilian Portuguese, English, Spanish, Japanese, Russian and Simplified Chinese. Translations are stored in `app/backend/web/lang/`, one JSON file per language.

See the [main README](../README.md) for the complete guide.
