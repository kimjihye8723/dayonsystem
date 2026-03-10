@echo off
title DAYON SYSTEM - Dev Server
echo ============================================
echo   DAYON SYSTEM 개발 서버 자동 시작
echo ============================================
echo.

:: 백엔드 서버 시작 (포트 5001)
echo [1/2] 백엔드 서버 시작 중... (port 5001)
start "DAYON-Backend" cmd /k "cd /d d:\Project-Ing\2602-Dayonsystem && node server/index.js"

:: 3초 대기 후 프론트엔드 시작
timeout /t 3 /nobreak >nul

:: 프론트엔드 개발 서버 시작 (포트 5173)
echo [2/2] 프론트엔드 서버 시작 중... (port 5173)
start "DAYON-Frontend" cmd /k "cd /d d:\Project-Ing\2602-Dayonsystem && npm run dev"

echo.
echo 서버 시작 완료!
echo  - 백엔드 : http://localhost:5001
echo  - 프론트 : http://localhost:5173
echo.
pause
