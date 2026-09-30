@echo off
title AquaTwin - Langflow Server Launcher
echo ========================================================
echo   Iniciando Langflow para el Gemelo Digital AquaTwin
echo ========================================================
echo.

:: Verificar si langflow esta instalado
python -c "import langflow" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Langflow no parece estar instalado globalmente.
    echo Verificando entorno virtual en gd_python\.venv...
    if exist "..\gd_python\.venv\Scripts\langflow.exe" (
        echo [OK] Usando Langflow desde gd_python\.venv
        ..\gd_python\.venv\Scripts\langflow.exe run --port 7860
        goto end
    )
    echo [ADVERTENCIA] Para ejecutar Langflow localmente instala el paquete con:
    echo    pip install langflow
    echo o ejecuta:
    echo    docker run -p 7860:7860 langflowai/langflow:latest
    echo.
    pause
    exit /b 1
)

echo [OK] Iniciando Langflow en el puerto 7860...
langflow run --port 7860

:end
