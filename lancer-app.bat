@echo off
setlocal

REM Force UTF-8 for proper accents in console
chcp 65001 >nul

REM Root path of this script
set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"

echo ========================================
echo   Lancement one-click RFA (localhost)
echo ========================================
echo.

if not exist "%BACKEND_DIR%" (
  echo [ERREUR] Dossier backend introuvable: "%BACKEND_DIR%"
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%" (
  echo [ERREUR] Dossier frontend introuvable: "%FRONTEND_DIR%"
  pause
  exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo [ERREUR] node_modules manquant dans frontend.
  echo Lance d'abord: cd frontend ^&^& npm install
  pause
  exit /b 1
)

REM Aller dans le dossier backend
cd /d "%BACKEND_DIR%"
echo [1/3] Demarrage du backend...
set "PYTHON_EXE=python"
if exist "%BACKEND_DIR%\venv\Scripts\python.exe" set "PYTHON_EXE=%BACKEND_DIR%\venv\Scripts\python.exe"
start "Backend RFA (localhost:8001)" cmd /k "cd /d ""%BACKEND_DIR%"" && ""%PYTHON_EXE%"" run.py"

REM Attendre un peu que le backend demarre
timeout /t 3 /nobreak >nul

REM Aller dans le dossier frontend
cd /d "%FRONTEND_DIR%"
echo [2/3] Demarrage du frontend...
start "Frontend RFA (localhost:5173)" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev"

REM Attendre un peu puis ouvrir le navigateur
timeout /t 3 /nobreak >nul
echo [3/3] Ouverture du navigateur...
start "" "http://localhost:5173"

echo.
echo ========================================
echo   Application lancee en local.
echo   Backend: http://localhost:8001
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Cette fenetre peut etre fermee.
echo Les serveurs continuent de tourner dans leurs fenetres dediees.
echo.
echo Appuyez sur une touche pour fermer ce lanceur...
pause >nul
