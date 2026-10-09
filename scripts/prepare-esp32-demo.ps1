param(
  [Parameter(Mandatory = $true)][string]$WifiSsid,
  [Parameter(Mandatory = $true)][string]$WifiPassword,
  [Parameter(Mandatory = $true)][string]$BrokerHost,
  [Parameter(Mandatory = $true)][string]$TenantId,
  [Parameter(Mandatory = $true)][string]$LockerId
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$certDir = Join-Path $root 'infra\mosquitto\certs'
$signingDir = Join-Path $root 'infra\dev-signing'
$output = Join-Path $root 'include\demo_device_config.h'
$aclOutput = Join-Path $root 'infra\mosquitto\aclfile.local'

foreach ($required in @('ca.crt', 'lock-demo.crt', 'lock-demo.key')) {
  $path = Join-Path $certDir $required
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing local MQTT certificate: $path" }
}
$publicKey = Join-Path $signingDir 'dev-public.pem'
if (-not (Test-Path -LiteralPath $publicKey)) { throw "Missing development public key: $publicKey" }
$publicKeyBytes = @'
from cryptography.hazmat.primitives import serialization
from pathlib import Path
key = serialization.load_pem_public_key(Path(r"PUBLIC_KEY_PATH").read_bytes())
numbers = key.public_numbers()
raw = bytes([4]) + numbers.x.to_bytes(32, "big") + numbers.y.to_bytes(32, "big")
print(",".join(f"0x{value:02x}" for value in raw))
'@.Replace('PUBLIC_KEY_PATH', $publicKey)
$publicKeyBytes = $publicKeyBytes | python -
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($publicKeyBytes)) { throw 'Could not convert the development public key to a raw P-256 point.' }

function Convert-ToCString([string]$path) {
  $lines = Get-Content -LiteralPath $path
  $escaped = for ($index = 0; $index -lt $lines.Count; $index++) {
    $suffix = if ($index -lt ($lines.Count - 1)) { '\' } else { '' }
    '"' + $lines[$index].Replace('\', '\\').Replace('"', '\"') + '\n"' + $suffix
  }
  return ($escaped -join "`r`n")
}

function Convert-ValueToCString([string]$value) {
  return '"' + $value.Replace('\', '\\').Replace('"', '\"') + '"'
}

$header = @"
#ifndef DEMO_DEVICE_CONFIG_H
#define DEMO_DEVICE_CONFIG_H
#include <stdint.h>
#define DEMO_WIFI_SSID $(Convert-ValueToCString $WifiSsid)
#define DEMO_WIFI_PASSWORD $(Convert-ValueToCString $WifiPassword)
#define DEMO_MQTT_URI $(Convert-ValueToCString "mqtts://${BrokerHost}:8883")
#define DEMO_MQTT_CLIENT_ID "lock-demo"
#define DEMO_TENANT_ID $(Convert-ValueToCString $TenantId)
#define DEMO_LOCKER_ID $(Convert-ValueToCString $LockerId)
#define DEMO_SIGNING_KEY_ID "local-demo"
static const uint8_t DEMO_SIGNING_PUBLIC_KEY[] = { $publicKeyBytes };
#define DEMO_SIGNING_PUBLIC_KEY_LEN 65U
#define DEMO_CA_CERT_PEM $(Convert-ToCString (Join-Path $certDir 'ca.crt'))
#define DEMO_DEVICE_CERT_PEM $(Convert-ToCString (Join-Path $certDir 'lock-demo.crt'))
#define DEMO_DEVICE_KEY_PEM $(Convert-ToCString (Join-Path $certDir 'lock-demo.key'))
#define DEMO_SIGNING_PUBLIC_KEY_PEM $(Convert-ToCString $publicKey)
#endif
"@
Set-Content -LiteralPath $output -Value $header -NoNewline
@"
user backend
topic write locks/$TenantId/$LockerId/commands
topic read locks/$TenantId/$LockerId/events
topic read locks/$TenantId/$LockerId/telemetry
topic read locks/$TenantId/$LockerId/presence
user lock-demo
topic read locks/$TenantId/$LockerId/commands
topic write locks/$TenantId/$LockerId/events
topic write locks/$TenantId/$LockerId/telemetry
topic write locks/$TenantId/$LockerId/presence
"@ | Set-Content -LiteralPath $aclOutput -NoNewline
Write-Host "Generated ignored ESP32 local-demo configuration: $output"
Write-Host "The header contains device credentials and must never be committed."
Write-Host "Generated ignored exact demo-lock ACL: $aclOutput"
