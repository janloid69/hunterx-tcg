# Makes the HunterX bot start by itself whenever this server turns on, and
# starts it now. Run once from this folder in PowerShell (as Administrator):
#
#   powershell -ExecutionPolicy Bypass -File .\install-startup-task.ps1
#
# To remove it later:  Unregister-ScheduledTask -TaskName "HunterX Discord bot"

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'HunterX Discord bot'

if (-not (Test-Path (Join-Path $here '.env'))) {
  throw "Missing .env in $here. Copy .env.example to .env and fill in the two secrets first."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw 'Node.js was not found. Install Node.js 22 LTS from https://nodejs.org, open a new PowerShell window, and run this again.'
}
$version = (& $node --version)
if ([int]($version.TrimStart('v').Split('.')[0]) -lt 22) {
  throw "Node.js $version is too old. Install Node.js 22 LTS from https://nodejs.org."
}

$script = Join-Path $here 'start-bot.cmd'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$script`" `"$node`"`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Done. '$taskName' is running and will start with Windows."
Write-Host "Check it's working: open the logs folder in $here and look at the newest file."
