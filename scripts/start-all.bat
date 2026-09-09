@echo off
REM ===========================================================================
REM start-all.bat — Windows launcher for scripts/start-all.sh
REM
REM Starts PostgreSQL + backend + frontend with one command.
REM Requires Git Bash (bash.exe) on PATH — install from https://git-scm.com
REM
REM Usage:  double-click this file, or run:
REM         start-all.bat            (in cmd / PowerShell)
REM         bash scripts/start-all.sh
REM ===========================================================================

where bash >nul 2>nul
if errorlevel 1 (
  echo [start-all] bash.exe was not found on PATH.
  echo [start-all] Install Git for Windows from https://git-scm.com, then re-open your terminal.
  echo [start-all] Alternative: run "npm run setup" once, then "npm run dev".
  exit /b 1
)

cd /d "%~dp0.."
bash scripts/start-all.sh %*
exit /b %errorlevel%