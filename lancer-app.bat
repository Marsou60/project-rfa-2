@echo off
echo ========================================
echo   Lancement de l'application RFA
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
echo [2/2] Demarrage du serveur frontend...
start "Frontend RFA" cmd /k "npm run dev"

echo.
echo ========================================
echo   Application lancee !
echo   Backend: http://localhost:8001
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Appuyez sur une touche pour fermer cette fenetre...
pause >nul
