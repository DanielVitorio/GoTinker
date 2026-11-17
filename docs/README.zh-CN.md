# Go Tinker

Go Tinker 是一款 Windows 桌面应用，用于在 Laravel 项目中运行 PHP 代码。它包含能理解项目结构的自动补全代码编辑器、保存请求的集合、带变量的环境、执行历史、集成的 Cmder 终端以及本地 SQLite 存储。

## 构建

Cmder 以 Git 子模块的形式位于 `submodules\cmder`，因此克隆时请加上 `--recurse-submodules` 参数：

```powershell
git clone --recurse-submodules <仓库地址>
```

如果克隆时没有加这个参数，请运行 `git submodule update --init --recursive`。然后安装 Go 1.23 或更高版本以及 7-Zip，并在 PowerShell 中运行 `.\build.ps1`。生成结果为 `dist\GoTinker.exe` 以及 `dist\cmder` 文件夹。

## 使用

选择包含 `artisan` 的 Laravel 项目，按 **Ctrl+Enter** 运行代码；先选中代码即可只运行选中部分。按 **Ctrl+S** 将请求保存到集合，在 **变量** 标签页中添加变量（键 `userId` 会变成 `$userId`），并在代码中用 `{{name}}` 使用环境中的值。每次执行都会保存在 **历史记录** 中。集合和环境可以以 JSON 格式导入和导出，也可以导入 `.php` 文件。

你的数据保存在 `%APPDATA%\GoTinker\gotinker.sqlite`。

## 语言

点击右上角的齿轮图标打开 **设置**，可在巴西葡萄牙语、英语、西班牙语、日语、俄语和简体中文之间切换。翻译文件位于 `app/backend/web/lang/`，每种语言一个 JSON 文件。

完整说明请参阅 [主 README](../README.md)。
