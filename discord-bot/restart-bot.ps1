# Restarts the HunterX bot (for example after "git pull"), or starts it if it
# isn't running. Only touches the bot's own Node process.
#
#   powershell -ExecutionPolicy Bypass -File .\discord-bot\restart-bot.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'HunterX Discord bot'

# Find the bot: bot.pid first, else a node process running "--env-file=.env index.mjs".
$ids = @()
$pidFile = Join-Path $here 'bot.pid'
if (Test-Path $pidFile) {
  $process = Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq 'node') { $ids += $process.Id }
}
if ($ids.Count -eq 0) {
  $ids = @(Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object { $_.CommandLine -like '*--env-file=.env*index.mjs*' } |
    ForEach-Object { $_.ProcessId })
}
foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "The startup task isn't installed. Run install-startup-task.ps1 (as Administrator) from the discord-bot folder."
  exit 1
}
if ($task.State -ne 'Running') {
  Start-ScheduledTask -TaskName $taskName
  Write-Host 'Started the bot. Check the newest file in the logs folder in a few seconds.'
} elseif ($ids.Count -gt 0) {
  Write-Host 'Stopped the bot. It starts again with the new code in about 15 seconds.'
} else {
  Write-Host 'The startup task is running but the bot process was not found; it should start again within 15 seconds.'
}
