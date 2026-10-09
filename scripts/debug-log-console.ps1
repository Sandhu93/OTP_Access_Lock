param(
  [ValidateSet('start', 'phone', 'docker', 'esp32')]
  [string]$Mode = 'start',
  [string]$PhoneA,
  [string]$PhoneB,
  [string]$Serial,
  [string]$Esp32Port = 'COM9',
  [string]$LogRoot,
  [string]$LogFile,
  [switch]$AllPhoneLogs,
  [switch]$SeparateWindows
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$adbPath = 'D:\android_sdk\platform-tools\adb.exe'

function Resolve-PowerShell {
  $pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if ($pwsh) { return $pwsh.Source }
  return (Get-Command powershell.exe -ErrorAction Stop).Source
}

function Add-LogHeader([string]$Path, [string]$Title) {
  Add-Content -LiteralPath $Path -Value "`r`n===== $Title | $(Get-Date -Format o) =====" -Encoding utf8
}

function Write-StreamToFile([scriptblock]$Producer, [string]$Path, [string]$Title) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  Add-LogHeader -Path $Path -Title $Title
  while ($true) {
    try {
      & $Producer 2>&1 | Tee-Object -FilePath $Path -Append
    } catch {
      $message = "[$(Get-Date -Format o)] collector error: $($_.Exception.Message)"
      $message | Tee-Object -FilePath $Path -Append
    }
    "[$(Get-Date -Format o)] stream ended; retrying in 2 seconds" | Tee-Object -FilePath $Path -Append
    Start-Sleep -Seconds 2
  }
}

function Run-Phone([string]$DeviceSerial, [string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $adbPath)) { throw "ADB was not found at $adbPath" }
  Write-Host "$Label log -> $Path"
  Write-StreamToFile -Path $Path -Title "$Label ($DeviceSerial)" -Producer {
    if ($AllPhoneLogs) {
      & $adbPath -s $DeviceSerial logcat -v threadtime '*:I'
    } else {
      & $adbPath -s $DeviceSerial logcat -v threadtime '*:I' |
        Where-Object { $_ -match 'com\.accesslockmobileshell|ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|Fatal signal|crash|Exception|E/' }
    }
  }
}

function Run-Docker([string]$Path) {
  Push-Location $repoRoot
  try {
    Write-Host "Docker log -> $Path"
    Write-StreamToFile -Path $Path -Title 'Docker services' -Producer {
      & docker compose logs -f --tail=200 api dashboard keycloak mosquitto device-gateway edge
    }
  } finally {
    Pop-Location
  }
}

function Write-SerialToFile([string]$PortName, [int]$BaudRate, [string]$Path, [string]$Title) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  Add-LogHeader -Path $Path -Title $Title
  while ($true) {
    $serialPort = $null
    try {
      $serialPort = [System.IO.Ports.SerialPort]::new($PortName, $BaudRate, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
      $serialPort.ReadTimeout = 1000
      $serialPort.DtrEnable = $false
      $serialPort.RtsEnable = $false
      $serialPort.Open()
      "[$(Get-Date -Format o)] serial connected: $PortName @ $BaudRate" | Tee-Object -FilePath $Path -Append
      while ($serialPort.IsOpen) {
        try {
          $line = $serialPort.ReadLine()
          $line | Tee-Object -FilePath $Path -Append
        } catch [System.TimeoutException] {
          continue
        }
      }
    } catch {
      $message = "[$(Get-Date -Format o)] serial collector error: $($_.Exception.Message)"
      $message | Tee-Object -FilePath $Path -Append
    } finally {
      if ($serialPort) {
        if ($serialPort.IsOpen) { $serialPort.Close() }
        $serialPort.Dispose()
      }
    }
    "[$(Get-Date -Format o)] serial stream ended; retrying in 2 seconds" | Tee-Object -FilePath $Path -Append
    Start-Sleep -Seconds 2
  }
}

function Run-Esp32([string]$Path) {
  Write-Host "ESP32 $Esp32Port log -> $Path"
  Write-SerialToFile -PortName $Esp32Port -BaudRate 115200 -Path $Path -Title "ESP32 $Esp32Port"
}

if ($Mode -ne 'start') {
  if ([string]::IsNullOrWhiteSpace($LogFile)) { throw '-LogFile is required for a collector pane.' }
  switch ($Mode) {
    'phone' { Run-Phone -DeviceSerial $Serial -Path $LogFile -Label "Phone $($Serial)" }
    'docker' { Run-Docker -Path $LogFile }
    'esp32' { Run-Esp32 -Path $LogFile }
  }
  exit 0
}

if (-not (Test-Path -LiteralPath $adbPath)) { throw "ADB was not found at $adbPath" }
$devices = @(& $adbPath devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if ($devices.Count -lt 2) {
  throw "Two authorized Android devices are required. Found $($devices.Count): $($devices -join ', ')"
}
if ([string]::IsNullOrWhiteSpace($PhoneA)) { $PhoneA = $devices[0] }
if ([string]::IsNullOrWhiteSpace($PhoneB)) { $PhoneB = ($devices | Where-Object { $_ -ne $PhoneA } | Select-Object -First 1) }
if ($PhoneA -eq $PhoneB) { throw 'Phone A and Phone B must be different ADB serials.' }

$sessionName = Get-Date -Format 'yyyyMMdd-HHmmss'
if ([string]::IsNullOrWhiteSpace($LogRoot)) { $LogRoot = Join-Path $repoRoot "logs\debug\$sessionName" }
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$phoneALog = Join-Path $LogRoot 'phone-a.log'
$phoneBLog = Join-Path $LogRoot 'phone-b.log'
$dockerLog = Join-Path $LogRoot 'docker.log'
$esp32Log = Join-Path $LogRoot 'esp32-com9.log'

$shell = Resolve-PowerShell
$scriptPath = (Resolve-Path $PSCommandPath).Path
function CollectorArgs([string]$PaneMode, [string]$Path, [string]$Device) {
  $args = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', $scriptPath, '-Mode', $PaneMode, '-LogRoot', $LogRoot, '-LogFile', $Path, '-Esp32Port', $Esp32Port)
  if ($AllPhoneLogs -and $PaneMode -eq 'phone') { $args += '-AllPhoneLogs' }
  if ($Device) { $args += @('-Serial', $Device) }
  return $args
}

function PaneArgs([string]$PaneMode, [string]$Title, [string]$Path, [string]$Device) {
  return @('--title', $Title, $shell) + (CollectorArgs $PaneMode $Path $Device)
}

$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
$wtUsable = $false
if ($wt) {
  try {
    & $wt.Source '--version' 2>$null | Out-Null
    $wtUsable = ($LASTEXITCODE -eq 0)
  } catch {
    $wtUsable = $false
  }
}
if ($wtUsable -and -not $SeparateWindows) {
  $wtArgs = @('new-tab') + (PaneArgs 'phone' "Phone A - $PhoneA" $phoneALog $PhoneA)
  $wtArgs += @(';', 'split-pane', '-H') + (PaneArgs 'phone' "Phone B - $PhoneB" $phoneBLog $PhoneB)
  $wtArgs += @(';', 'split-pane', '-V') + (PaneArgs 'docker' 'Docker services' $dockerLog '')
  $wtArgs += @(';', 'split-pane', '-V') + (PaneArgs 'esp32' "ESP32 $Esp32Port" $esp32Log '')
  Start-Process -FilePath $wt.Source -ArgumentList $wtArgs | Out-Null
  Write-Host "Opened split log console. Logs are saved under $LogRoot"
} else {
  if ($SeparateWindows) {
    Write-Warning 'Opening four separate PowerShell windows by request.'
  } else {
    Write-Warning 'Windows Terminal (wt.exe) could not be launched; opening four separate PowerShell windows.'
  }
  Start-Process -FilePath $shell -ArgumentList (CollectorArgs 'phone' $phoneALog $PhoneA) | Out-Null
  Start-Process -FilePath $shell -ArgumentList (CollectorArgs 'phone' $phoneBLog $PhoneB) | Out-Null
  Start-Process -FilePath $shell -ArgumentList (CollectorArgs 'docker' $dockerLog '') | Out-Null
  Start-Process -FilePath $shell -ArgumentList (CollectorArgs 'esp32' $esp32Log '') | Out-Null
  Write-Host "Opened separate log windows. Logs are saved under $LogRoot"
}

Write-Host "Phone A: $PhoneA"
Write-Host "Phone B: $PhoneB"
Write-Host "ESP32: $Esp32Port"
Write-Host "Log directory: $LogRoot"
