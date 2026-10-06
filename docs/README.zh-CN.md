# Go Tinker

Go Tinker 是一款 Windows 桌面开发环境，可在 Laravel 项目中运行 PHP 代码。它提供项目感知补全、代码片段和集合、运行历史、Cmder 风格终端以及本地 SQLite 存储。

## 构建

安装 Go 1.23 或更高版本，在 PowerShell 中运行 `.uild.ps1`。程序将生成在 `dist/GoTinker.exe`。

## 使用

选择包含 `artisan` 的 Laravel 项目，然后按 **Ctrl+Enter** 运行代码。先选中代码即可只运行选中部分。代码片段支持文件夹和备注，也支持导入、导出 Postman 集合与 PHP 文件。终端可以保留多个项目会话。

## 语言

点击顶部旗帜，可切换简体中文、英语、巴西葡萄牙语、日语、俄语和西班牙语。界面文本与旗帜 SVG 按语言存放在 `app/backend/web/lang/` 的 JSON 文件中。
