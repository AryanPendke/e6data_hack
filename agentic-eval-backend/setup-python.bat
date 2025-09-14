@echo off
echo Setting up Python environment for Agentic Evaluation Backend
echo ============================================================

:: Check if Python is installed
echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH
    echo Please install Python from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

echo Python found:
python --version

:: Navigate to python-workers directory
cd python-workers
if %errorlevel% neq 0 (
    echo python-workers directory not found
    echo Please run this script from the agentic-eval-backend directory
    pause
    exit /b 1
)

:: Install basic requirements
echo.
echo Installing basic Python dependencies...
echo ======================================
pip install numpy diskcache

:: Ask user if they want to install ML dependencies
echo.
echo Do you want to install ML dependencies for full functionality? (y/n)
echo (This will install transformers, torch, sentence-transformers, bert-score)
echo (Warning: This may take several GB of space and significant download time)
set /p INSTALL_ML="Enter choice [y/n]: "

if /i "%INSTALL_ML%"=="y" (
    echo.
    echo Installing ML dependencies... (This may take a while)
    echo ====================================================
    pip install transformers torch sentence-transformers bert-score
    if %errorlevel% neq 0 (
        echo.
        echo WARNING: ML dependencies failed to install
        echo The system will still work with basic functionality
        echo.
    ) else (
        echo.
        echo ML dependencies installed successfully!
        echo.
    )
) else (
    echo.
    echo Skipping ML dependencies. System will use fallback methods.
    echo.
)

:: Test Python setup
echo Testing Python worker setup...
echo ==============================
python -c "import sys, os, json; print('Python setup test passed')"
if %errorlevel% neq 0 (
    echo Python test failed
    pause
    exit /b 1
)

:: Create __init__.py files for proper module structure
echo Creating module structure...
echo > shared\__init__.py
echo > __init__.py

echo.
echo Setup completed successfully!
echo ============================
echo.
echo The system is now ready to run.
echo - Basic functionality: Available
if /i "%INSTALL_ML%"=="y" (
    echo - ML functionality: Available (if installation succeeded)
) else (
    echo - ML functionality: Fallback mode (install ML deps later if needed)
)
echo.
echo You can now start your Node.js backend.
echo.
pause