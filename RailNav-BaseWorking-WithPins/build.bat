@echo off
echo ========================================
echo Railway Navigation App - Build Script
echo ========================================
echo.

echo [1/4] Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Checking Python backend...
cd backend
if exist venv\Scripts\python.exe (
    echo Python virtual environment found
) else (
    echo Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Python not found. Please install Python 3.8+
        cd ..
        pause
        exit /b 1
    )
)

echo.
echo [3/4] Installing Python dependencies...
call venv\Scripts\activate
if exist requirements.txt (
    pip install -r requirements.txt
) else (
    echo Creating requirements.txt...
    pip freeze > requirements.txt
)
call deactivate
cd ..

echo.
echo [4/4] Building Electron application...
call npm run build:win
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build completed successfully!
echo Executable is in the 'dist' folder
echo ========================================
pause

