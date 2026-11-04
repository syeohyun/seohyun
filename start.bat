@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo 해양대 GIF 생성기를 시작합니다.
echo 브라우저가 열리면 동영상을 올려 GIF로 만드세요.
echo 이 창을 닫으면 페이지가 멈춥니다.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
