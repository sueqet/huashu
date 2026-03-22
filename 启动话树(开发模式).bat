@echo off
chcp 65001 >nul 2>&1
title 话树 - 开发模式
cd /d "%~dp0"

echo ============================================
echo   话树 - 启动开发模式
echo ============================================
echo.

:: 检查 pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 pnpm，请先安装: npm install -g pnpm
    pause
    exit /b 1
)

:: 检查 cargo
where cargo >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Rust/Cargo，请先安装: https://rustup.rs/
    pause
    exit /b 1
)

echo [信息] 正在启动话树应用...
echo [信息] 首次启动需要编译 Rust 代码，请耐心等待
echo [信息] 关闭此窗口即可停止应用
echo.

pnpm tauri dev

if errorlevel 1 (
    echo.
    echo [错误] 应用启动失败，请检查错误信息
    pause
)
