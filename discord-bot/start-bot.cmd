@echo off
rem Starts the HunterX Discord bot and starts it again if it ever stops.
rem Usage: start-bot.cmd [path to node.exe]
cd /d "%~dp0"
set "NODE=%~1"
if "%NODE%"=="" set "NODE=node"
if not exist ".env" (
  echo Missing .env - copy .env.example to .env and fill in the two secrets.
  exit /b 2
)
:loop
"%NODE%" --env-file=.env index.mjs
if %ERRORLEVEL%==0 goto :eof
if %ERRORLEVEL%==2 (
  echo The bot settings need fixing. See the newest file in the logs folder.
  exit /b 2
)
echo The bot stopped unexpectedly. Starting it again in 15 seconds...
ping -n 16 127.0.0.1 >nul
goto loop
