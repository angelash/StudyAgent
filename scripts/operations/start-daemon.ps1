[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$NoAutostart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-DotEnvPort {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Keys,
    [Parameter(Mandatory = $true)][int]$Default
  )

  if (-not (Test-Path -LiteralPath $Path)) { return $Default }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')
    if ($match.Success) { $values[$match.Groups[1].Value] = $match.Groups[2].Value.Trim('"', "'") }
  }
  foreach ($key in $Keys) {
    $value = [Environment]::GetEnvironmentVariable($key)
    if (-not $value -and $values.ContainsKey($key)) { $value = $values[$key] }
    $parsed = 0
    if ([int]::TryParse([string]$value, [ref]$parsed)) { return $parsed }
  }
  return $Default
}

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $scriptDirectory '..\..')).Path
$envFile = Join-Path $repositoryRoot '.env'
$webPort = Read-DotEnvPort -Path $envFile -Keys @('WEB_PORT', 'PORT') -Default 3000
$apiPort = Read-DotEnvPort -Path $envFile -Keys @('API_PORT') -Default 4000
$logDirectory = Join-Path $repositoryRoot 'output\daemon'

foreach ($target in @(@{ Name = 'Web'; Port = $webPort }, @{ Name = 'API'; Port = $apiPort })) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort $target.Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $listener) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($null -eq $process -or $process.ProcessName -ne 'node') {
      $owner = if ($null -eq $process) { 'unknown process' } else { "$($process.ProcessName) (PID $($listener.OwningProcess))" }
      throw "$($target.Name) port $($target.Port) is already occupied by $owner. Choose a free port in .env; unrelated processes are not stopped automatically."
    }
  }
}

Push-Location $repositoryRoot
try {
  New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  $env:STUDYAGENT_WEB_URL = "http://127.0.0.1:$webPort/"
  $env:STUDYAGENT_API_URL = "http://127.0.0.1:$apiPort/api/ready"

  if (-not $SkipBuild) {
    Write-Host 'Building contracts, API, Web and local formula assets...'
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
  }

  if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    & pm2 startOrReload ecosystem.config.cjs --update-env
  } else {
    throw 'PM2 is not installed. Run: npm install -g pm2'
  }
  if ($LASTEXITCODE -ne 0) { throw "PM2 start failed with exit code $LASTEXITCODE" }

  & pm2 save
  if ($LASTEXITCODE -ne 0) { throw "PM2 save failed with exit code $LASTEXITCODE" }

  if (-not $NoAutostart -and $env:OS -eq 'Windows_NT') {
    & (Join-Path $scriptDirectory 'install-daemon-autostart.ps1')
  }

  $deadline = (Get-Date).AddMinutes(2)
  $ready = $false
  do {
    try {
      $api = Invoke-RestMethod -Uri $env:STUDYAGENT_API_URL -TimeoutSec 5
      $web = Invoke-WebRequest -Uri $env:STUDYAGENT_WEB_URL -UseBasicParsing -TimeoutSec 5
      if ($api.data.status -eq 'ready' -and $web.StatusCode -ge 200 -and $web.StatusCode -lt 500) { $ready = $true; break }
    } catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  if (-not $ready) {
    & pm2 list
    throw 'StudyAgent did not become healthy within two minutes. Inspect: npm run daemon:logs'
  }

  & pm2 list
  Write-Host "StudyAgent is ready: http://127.0.0.1:$webPort/"
} finally {
  Pop-Location
}
