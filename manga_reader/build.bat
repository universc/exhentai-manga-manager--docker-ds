@echo off
chcp 65001 >nul

echo 开始编译 Release 版本...
cargo build --release
if %errorlevel% neq 0 (
    echo 编译失败！
    exit /b %errorlevel%
)

echo.
echo 正在复制程序到 ..\resources\extraResources ...
if not exist "..\resources\extraResources" mkdir "..\resources\extraResources"
copy /Y "target\release\manga_reader.exe" "..\resources\extraResources\"

echo.
echo 完成！
