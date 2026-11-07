@echo off
cd /d "%~dp0"
title NORTHSTAR Attention Lab - local server (close this window to stop)

set "PY="
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto :found
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
:found
if not defined PY goto :nopython

echo.
echo   Starting local server ...
echo   The browser will open automatically once the port is ready.
echo   Close this window when you are done to stop the server.
echo.

rem Background helper: wait until 127.0.0.1:8000 accepts connections, then open the page.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 25;$i++){try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',8000);$c.Close();Start-Process 'http://127.0.0.1:8000/index.html';break}catch{Start-Sleep -Milliseconds 400}}" >nul 2>nul

rem Foreground server: keep this window open, server runs until window is closed.
%PY% -m http.server 8000 --bind 127.0.0.1

echo.
echo   Server stopped.
pause
exit /b 0

:nopython
echo.
echo   [ERROR] Python 3 not found, so the local server cannot start.
echo.
echo   Option 1: install Python 3 from https://www.python.org/downloads/ and run this file again.
echo   Option 2: use the online URL (see README section 1) - no local server needed.
echo.
echo   Manual start: open a terminal in this folder and run
echo       py -m http.server 8000
echo   then visit http://localhost:8000
echo.
pause
exit /b 1
