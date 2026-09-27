@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 exhentai-manga-manager(加载本项目最新 dist)...
set ELECTRON_RUN_AS_NODE=
"%~dp0node_modules\electron\dist\electron.exe" .
if errorlevel 1 pause
