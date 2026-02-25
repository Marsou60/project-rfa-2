@echo off
echo ========================================
echo   Lancement de l'application RFA (Tauri)
echo ========================================
echo.

REM Aller dans le dossier backend
cd /d "%~dp0backend"
echo [1/2] Demarrage du serveur backend...
set "PYTHON_EXE=python"
if exist "%~dp0backend\venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0backend\venv\Scripts\python.exe"
start "Backend RFA" cmd /k "%PYTHON_EXE% run.py"

REM Attendre un peu que le backend demarre
timeout /t 3 /nobreak >nul

REM Aller dans le dossier frontend
cd /d "%~dp0frontend"
echo [2/2] Demarrage de l'application Tauri...
call npm run tauri:dev

echo.
echo Application fermee.
pause
