@echo off
cd /d "%~dp0"
git add .
git commit -m "%~1"
git push
echo.
echo Push completed! Render will auto deploy in 1-2 minutes.
pause
