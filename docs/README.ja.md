# Go Tinker

Go Tinker は、Laravel プロジェクト内で PHP コードを実行する Windows 用デスクトップアプリケーションです。プロジェクトを理解する自動補完付きのコードエディター、保存したリクエストのコレクション、変数を持つ環境、実行履歴、統合された Cmder ターミナル、ローカルの SQLite ストレージを備えています。

## ビルド

Cmder は `submodules\cmder` に Git サブモジュールとして含まれているため、`--recurse-submodules` パラメーターを付けてクローンしてください。

```powershell
git clone --recurse-submodules <リポジトリURL>
```

付けずにクローンした場合は `git submodule update --init --recursive` を実行します。その後、Go 1.23 以降と 7-Zip をインストールし、PowerShell で `.\build.ps1` を実行します。`dist\GoTinker.exe` と `dist\cmder` フォルダーが生成されます。

## 使い方

`artisan` を含む Laravel プロジェクトを選択し、**Ctrl+Enter** でコードを実行します。コードを選択すると選択範囲だけを実行します。**Ctrl+S** でリクエストをコレクションに保存し、**変数** タブで変数を追加し (キー `userId` は `$userId` になります)、環境の値はコード内で `{{name}}` として使えます。すべての実行は **履歴** に残ります。コレクションと環境は JSON でインポート・エクスポートでき、`.php` ファイルもインポートできます。

データは `%APPDATA%\GoTinker\gotinker.sqlite` に保存されます。

## 言語

右上の歯車アイコンから **設定** を開き、ブラジルポルトガル語、英語、スペイン語、日本語、ロシア語、簡体字中国語を切り替えます。翻訳は `app/backend/web/lang/` に言語ごとの JSON ファイルとして保存されています。

詳しくは [メインの README](../README.md) を参照してください。
