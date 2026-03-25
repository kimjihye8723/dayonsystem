@echo off
title DAYON SYSTEM - Local IIS Deployment
echo ============================================
echo   DAYON SYSTEM 로컬 웹게시 (IIS Deploy)
echo ============================================
echo.

echo [1/3] 프론트엔드 빌드 중... (npm run build)
call npm run build
if %errorlevel% neq 0 (
    echo 빌드 실패!
    pause
    exit /b %errorlevel%
)
echo 빌드 완료!
echo.

echo [2/3] IIS 서버 폴더(C:\inetpub\wwwroot\dayon-system)로 파일 복사 중...

:: 관리자 권한으로 실행해야 복사가 가능할 수 있습니다.
if not exist "C:\inetpub\wwwroot\dayon-system" mkdir "C:\inetpub\wwwroot\dayon-system"

echo - 프론트엔드 정적 파일 복사
xcopy /E /Y /I "dist" "C:\inetpub\wwwroot\dayon-system" >nul

echo - 백엔드 서버 파일 복사
xcopy /E /Y /I "server" "C:\inetpub\wwwroot\dayon-system\server" >nul

echo - 설정/패키지 파일 복사
copy /Y ".env" "C:\inetpub\wwwroot\dayon-system\.env" >nul
copy /Y "package.json" "C:\inetpub\wwwroot\dayon-system\package.json" >nul

echo 파일 복사 완료!
echo.

echo [3/3] 백엔드 PM2 서비스 재시작 중...
cd /d C:\inetpub\wwwroot\dayon-system
call pm2 restart dayon-api
if %errorlevel% neq 0 (
    :: dayon-api라는 이름이 없을 경우 0번으로 재시작 시도
    call pm2 restart 0
)

echo.
echo ============================================
echo   웹게시 완료! http://localhost 에서 확인해보세요.
echo ============================================
pause
