param(
  [string]$ServerAddress
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ServerAddress)) {
  $candidates = @()
  try {
    $candidates = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '172.2*' } |
      Sort-Object InterfaceIndex |
      Select-Object -ExpandProperty IPAddress)
  } catch {
    $candidates = @()
  }
  if (-not $candidates.Count) {
    $candidates = @(([regex]::Matches((ipconfig | Out-String), '(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)') | ForEach-Object Value | Where-Object { $_ -notlike '127.*' -and $_ -notlike '169.254.*' -and $_ -notlike '172.2*' }))
  }
  $ServerAddress = $candidates | Select-Object -First 1
}

if ($ServerAddress -notmatch '^(?:\d{1,3}\.){3}\d{1,3}$') {
  throw "Could not determine a usable LAN IPv4 address. Run again with -ServerAddress and the current PC Wi-Fi IPv4 address."
}

$origin = "https://$ServerAddress"
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $root '.env'
$mobilePath = Join-Path $root 'mobile\src\config\localDemo.js'

$envKeys = @{
  'DEMO_HOST_IP' = $ServerAddress
  'DEMO_HTTPS_BIND_ADDRESS' = $ServerAddress
  'DEMO_MQTT_BIND_ADDRESS' = $ServerAddress
  'DJANGO_ALLOWED_HOSTS' = "localhost,127.0.0.1,api,$ServerAddress"
  'DEMO_PUBLIC_ORIGIN' = $origin
  'OIDC_ISSUER_URL' = "$origin/realms/access-lock"
  'OIDC_PUBLIC_AUTHORIZATION_ENDPOINT' = "$origin/realms/access-lock/protocol/openid-connect/auth"
  'OIDC_REDIRECT_URI' = "$origin/api/v1/auth/callback"
  'NEXT_PUBLIC_API_BASE_URL' = $origin
  'CORS_ALLOWED_ORIGINS' = $origin
  'CSRF_TRUSTED_ORIGINS' = $origin
}

$lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
foreach ($key in $envKeys.Keys) {
  $replacement = "$key=$($envKeys[$key])"
  $match = '^' + [regex]::Escape($key) + '='
  $found = $false
  $lines = @($lines | ForEach-Object {
    if ($_ -match $match) { $found = $true; $replacement } else { $_ }
  })
  if (-not $found) { $lines += $replacement }
}
Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8

Set-Content -LiteralPath $mobilePath -Value @"
// Local-demo endpoint only. Keep this aligned with DEMO_PUBLIC_ORIGIN in .env.
// Production builds must use a managed DNS name and a publicly trusted certificate.
export const MOBILE_PUBLIC_ORIGIN = '$origin';
"@ -NoNewline -Encoding utf8

Write-Host "Local demo endpoint set to $origin"
Write-Host "Next steps:"
Write-Host "  1. .\scripts\prepare-local-https.ps1 -Force -ServerAddress $ServerAddress"
Write-Host "  2. Update the Keycloak client redirect origin if the realm already exists."
Write-Host "  3. docker compose up -d --build"
Write-Host "  4. Rebuild and reinstall the Android APK."
Write-Host "Reserve this address in the router DHCP settings to keep it stable across restarts."
