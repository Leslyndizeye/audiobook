@echo off
title Lesly Refresh Reader

echo.
echo  ==========================================
echo         LESLY REFRESH READER
echo  ==========================================
echo.

REM ── Kill any old backend/frontend processes ────────────────────────────────
echo  [*] Stopping any existing servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM ── Clear Next.js cache (prevents webpack ENOENT errors) ──────────────────
echo  [*] Clearing Next.js cache...
if exist "%~dp0frontend\.next" (
    rmdir /s /q "%~dp0frontend\.next" 2>nul
)

REM ── Start backend ─────────────────────────────────────────────────────────
echo  [*] Starting backend...
start "Backend API (port 8000)" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --reload --port 8000"

REM Wait for backend to initialise
timeout /t 3 /nobreak >nul

REM ── Start frontend ────────────────────────────────────────────────────────
echo  [*] Starting frontend...
start "Frontend (port 3000)" cmd /k "cd /d "%~dp0frontend" && node node_modules/next/dist/bin/next dev --port 3000"

echo.
echo  [*] Backend  -> http://localhost:8000
echo  [*] Frontend -> http://localhost:3000
echo  [*] API Docs -> http://localhost:8000/docs
echo.
echo  Wait ~15 seconds for both servers to start, then open http://localhost:3000
echo  Speak the secret word to enter.
echo.
pause
