@echo off
cd /d %~dp0

echo Deteniendo instancias de Node.js...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Instancias eliminadas correctamente.
) else (
    echo No habia instancias de Node.js activas.
)

echo.
echo Iniciando el servidor desde: %CD%
echo.
node --env-file=.env index.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] El servidor termino con codigo de error: %ERRORLEVEL%
    pause
)
