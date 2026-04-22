[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$ForceAll,
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-DotEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      continue
    }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim()

    if ($value.Length -ge 2) {
      $wrappedInSingleQuotes = $value.StartsWith("'") -and $value.EndsWith("'")
      $wrappedInDoubleQuotes = $value.StartsWith('"') -and $value.EndsWith('"')
      if ($wrappedInSingleQuotes -or $wrappedInDoubleQuotes) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    $values[$key] = $value
  }

  return $values
}

function Resolve-Port {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$DotEnvValues,
    [Parameter(Mandatory = $true)]
    [string[]]$Keys,
    [Parameter(Mandatory = $true)]
    [int]$Default
  )

  foreach ($key in $Keys) {
    $envValue = [Environment]::GetEnvironmentVariable($key)
    if ($null -ne $envValue -and $envValue.Trim().Length -gt 0) {
      $parsedPort = 0
      if ([int]::TryParse($envValue, [ref]$parsedPort)) {
        return $parsedPort
      }
    }

    if ($DotEnvValues.ContainsKey($key)) {
      $parsedPort = 0
      if ([int]::TryParse([string]$DotEnvValues[$key], [ref]$parsedPort)) {
        return $parsedPort
      }
    }
  }

  return $Default
}

function Get-ListeningProcessIds {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  try {
    return @(
      Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
        Select-Object -ExpandProperty OwningProcess -Unique
    )
  } catch {
    $matches = @(
      netstat -ano -p tcp |
        Select-String -Pattern "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
    )

    if ($matches.Count -eq 0) {
      return @()
    }

    return @(
      $matches |
        ForEach-Object { $_.Matches[0].Groups[1].Value } |
        Sort-Object -Unique
    )
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$dotEnvPath = Join-Path $repoRoot '.env'
$dotEnvValues = Read-DotEnv -Path $dotEnvPath

$webPort = Resolve-Port -DotEnvValues $dotEnvValues -Keys @('PORT', 'WEB_PORT') -Default 3000
$apiPort = Resolve-Port -DotEnvValues $dotEnvValues -Keys @('API_PORT', 'PORT') -Default 4000
$portsToRestart = @($webPort, $apiPort) | Sort-Object -Unique
$safeProcessNames = @('node', 'node.exe', 'npm', 'npm.exe', 'npx', 'npx.exe')

Push-Location $repoRoot
try {
  Write-Host "Using repo root: $repoRoot"
  Write-Host "Target ports: $($portsToRestart -join ', ')"

  $listeners = @()
  foreach ($port in $portsToRestart) {
    $processIds = @(Get-ListeningProcessIds -Port $port)
    foreach ($processId in $processIds) {
      $listeners += [pscustomobject]@{
        Port      = $port
        ProcessId = [int]$processId
      }
    }
  }

  if ($listeners.Count -eq 0) {
    Write-Host 'No listening processes found on the configured dev ports.'
  } else {
    foreach ($group in ($listeners | Group-Object -Property ProcessId)) {
      $processId = [int]$group.Name
      $ports = ($group.Group | Select-Object -ExpandProperty Port -Unique | Sort-Object) -join ', '
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $processName = if ($null -ne $process) { $process.ProcessName } else { 'unknown' }
      $targetDescription = "PID $processId ($processName) listening on port(s) $ports"

      if (-not $ForceAll -and $safeProcessNames -notcontains $processName) {
        Write-Warning "Skipping $targetDescription because it is not a Node-based dev process. Re-run with -ForceAll if you really want to stop it."
        continue
      }

      if ($PSCmdlet.ShouldProcess($targetDescription, 'Stop-Process -Force')) {
        Stop-Process -Id $processId -Force -ErrorAction Stop
        Write-Host "Stopped $targetDescription"
      }
    }
  }

  if ($NoStart) {
    Write-Host 'Skipping npm run dev because -NoStart was specified.'
    return
  }

  Write-Host 'Starting dev services with npm run dev...'
  & npm run dev

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
