#requires -Version 7.2
<#!
Offline setup into a NEW project-local data directory. No system installation,
system fonts, application .env or running API are changed. Failed directories
are retained for inspection and cannot be reused by this script.
#!>
param(
    [Parameter(Mandatory)][string]$Installer,
    [Parameter(Mandatory)][string]$FontSources,
    [Parameter(Mandatory)][string]$Wheelhouse,
    [Parameter(Mandatory)][string]$Python,
    [Parameter(Mandatory)][string]$Destination,
    [string]$Workspace = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)
$ErrorActionPreference = 'Stop'
$exportSourceRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$exportExpectedInstaller = 'ff4b911403b67ee9e6249f820f9782c44bb32c94fdaa45b0da53a8e419e5307a'
function Assert-ExportNoLinks([string]$Path) {
    $component = [System.IO.Path]::GetFullPath($Path)
    while ($component) {
        if (Test-Path -LiteralPath $component) {
            $item = Get-Item -Force -LiteralPath $component
            if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'paper_export_invalid_input' }
        }
        $parent = [System.IO.Path]::GetDirectoryName($component)
        if ($parent -eq $component) { break }
        $component = $parent
    }
}
$exportWorkspacePath = [System.IO.Path]::GetFullPath($Workspace)
$exportTargetPath = [System.IO.Path]::GetFullPath($Destination)
$exportDataPrefix = [System.IO.Path]::Combine($exportWorkspacePath, 'data') + [System.IO.Path]::DirectorySeparatorChar
if (-not $exportTargetPath.StartsWith($exportDataPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'paper_export_invalid_input' }
if (Test-Path -LiteralPath $exportTargetPath) { throw 'paper_export_output_exists' }
foreach ($path in @($exportWorkspacePath, $exportTargetPath, $Installer, $FontSources, $Wheelhouse, $Python)) { Assert-ExportNoLinks $path }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Installer).Hash.ToLowerInvariant() -ne $exportExpectedInstaller) { throw 'paper_export_runtime_invalid' }
$exportSignature = Get-AuthenticodeSignature -LiteralPath $Installer
if ($exportSignature.Status -ne 'Valid' -or $exportSignature.SignerCertificate.Subject -notmatch 'O=The Document Foundation') { throw 'paper_export_runtime_invalid' }
$exportWheelManifestPath = Join-Path $exportSourceRoot 'resources/paper-export/python310-win-wheels.json'
$exportWheelManifest = Get-Content -Raw -LiteralPath $exportWheelManifestPath | ConvertFrom-Json
if ($exportWheelManifest.protocol -ne 'paper-export-python-wheels-v1' -or $exportWheelManifest.wheels.Count -ne 6) { throw 'paper_export_runtime_invalid' }
foreach ($wheel in $exportWheelManifest.wheels) {
    if ([System.IO.Path]::GetFileName($wheel.file) -ne $wheel.file) { throw 'paper_export_runtime_invalid' }
    $wheelPath = Join-Path $Wheelhouse $wheel.file; Assert-ExportNoLinks $wheelPath
    if ((Get-Item -LiteralPath $wheelPath).Length -ne $wheel.bytes -or (Get-FileHash -Algorithm SHA256 -LiteralPath $wheelPath).Hash.ToLowerInvariant() -ne $wheel.sha256) { throw 'paper_export_runtime_invalid' }
}
New-Item -ItemType Directory -Path $exportTargetPath -ErrorAction Stop | Out-Null
$exportLogs = Join-Path $exportTargetPath 'logs'
New-Item -ItemType Directory -Path $exportLogs | Out-Null
function Invoke-ExportSetup([string]$Name, [string]$File, [string[]]$Arguments, [int]$Seconds = 600) {
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $File; $info.UseShellExecute = $false; $info.CreateNoWindow = $true
    $info.WorkingDirectory = $exportTargetPath
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $info.Environment.Clear()
    foreach ($name in @('SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'SYSTEMDRIVE', 'COMSPEC')) {
        $value = [System.Environment]::GetEnvironmentVariable($name)
        if ($value) { $info.Environment[$name] = $value }
    }
    $info.Environment['PATH'] = [System.IO.Path]::Combine($env:SystemRoot, 'System32')
    $process = [System.Diagnostics.Process]::new(); $process.StartInfo = $info
    if (-not $process.Start()) { throw 'paper_export_renderer_unavailable' }
    $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
    $deadline = [System.DateTime]::UtcNow.AddSeconds($Seconds)
    while (-not $process.WaitForExit(1000)) {
        if ([System.DateTime]::UtcNow -gt $deadline) {
            # Do not assume an MSI service or other process stopped with this handle.
            @{ stage = $Name; pid = $process.Id; complete = $false; timedOut = $true } | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $exportLogs ($Name + '-timeout.json'))
            throw 'paper_export_render_timeout'
        }
    }
    $result = @{ stage = $Name; exit = $process.ExitCode; stdout = $stdout.GetAwaiter().GetResult(); stderr = $stderr.GetAwaiter().GetResult() }
    $result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $exportLogs ($Name + '.json'))
    $process.Dispose()
    if ($result.exit -ne 0) { throw 'paper_export_renderer_unavailable' }
    return $result.stdout
}
$exportBasePython = [System.IO.Path]::GetFullPath($Python)
$exportPythonCheck = Invoke-ExportSetup 'python-version' $exportBasePython @('-I', '-c', 'import sys,struct; assert sys.version_info[:2]==(3,10) and struct.calcsize("P")==8; print(sys.version)')
$exportVenv = Join-Path $exportTargetPath 'python'
$null = Invoke-ExportSetup 'python-venv' $exportBasePython @('-I', '-m', 'venv', $exportVenv)
$exportPythonExe = Join-Path $exportVenv 'Scripts/python.exe'
$exportLock = Join-Path $exportSourceRoot 'resources/paper-export/requirements-win-py310.lock'
$null = Invoke-ExportSetup 'python-install' $exportPythonExe @('-I', '-m', 'pip', '--disable-pip-version-check', 'install', '--no-index', '--find-links', [System.IO.Path]::GetFullPath($Wheelhouse), '--require-hashes', '-r', $exportLock)
$exportOffice = Join-Path $exportTargetPath 'office'
$exportMsiLog = Join-Path $exportLogs 'office-admin-image.log'
$null = Invoke-ExportSetup 'office-extract' (Join-Path $env:SystemRoot 'System32/msiexec.exe') @('/a', [System.IO.Path]::GetFullPath($Installer), '/qn', ('TARGETDIR=' + $exportOffice), '/L*v', $exportMsiLog)
$exportFonts = Join-Path $exportTargetPath 'fonts'
$null = Invoke-ExportSetup 'font-prepare' $exportPythonExe @('-I', '-X', 'utf8', (Join-Path $exportSourceRoot 'scripts/processing/paper_export_fonts.py'), '--source-root', [System.IO.Path]::GetFullPath($FontSources), '--destination', $exportFonts)
$exportProbe = Join-Path $exportTargetPath 'probe'
$exportUno = Join-Path $exportOffice 'program/python.exe'
$exportSoffice = Join-Path $exportOffice 'program/soffice.com'
$null = Invoke-ExportSetup 'runtime-probe' $exportPythonExe @('-I', '-X', 'utf8', (Join-Path $exportSourceRoot 'scripts/processing/paper_export_probe.py'), '--workspace', $exportProbe, '--font-root', $exportFonts, '--uno-python', $exportUno, '--soffice', $exportSoffice)
$exportCapabilityFile = Join-Path $exportProbe 'capability.json'
$exportCapability = Get-Content -Raw -LiteralPath $exportCapabilityFile | ConvertFrom-Json
if (-not $exportCapability.available -or -not $exportCapability.runtime.full) { throw 'paper_export_renderer_unavailable' }
$exportInstallation = @{ protocol = 'paper-export-installation-v1'; python = $exportPythonExe; fontRoot = $exportFonts; unoPython = $exportUno; soffice = $exportSoffice; capabilityReceipt = $exportCapabilityFile; manifestSha256 = $exportCapability.runtime.manifestSha256 }
$exportInstallation | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $exportTargetPath 'installation.json')
Write-Output ('PAPER_EXPORT_SETUP ' + (@{ protocol = 'paper-export-setup-v1'; available = $true; filesChecked = $exportCapability.runtime.filesChecked; selfTest = $exportCapability.selfTest } | ConvertTo-Json -Compress -Depth 8))
