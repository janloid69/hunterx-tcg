# Restarts only the HunterX bot (for example after "git pull"). The start
# script brings it back about 15 seconds later with the new code.
#
#   powershell -ExecutionPolicy Bypass -File .\restart-bot.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $here 'bot.pid'

if (-not (Test-Path $pidFile)) {
  Write-Host 'The bot is not running (no bot.pid). Start it with start-bot.cmd or restart the server.'
  exit 1
}

$botPid = [int](Get-Content $pidFile)
$process = Get-Process -Id $botPid -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'node') {
  Stop-Process -Id $botPid -Force
  Write-Host 'Stopped the bot. It starts again in about 15 seconds.'
} else {
  Remove-Item $pidFile -Force
  Write-Host 'The bot was not running. Start it with start-bot.cmd or restart the server.'
}
