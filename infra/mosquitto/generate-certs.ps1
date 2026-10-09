param(
  [string]$BrokerAddress = 'localhost',
  [switch]$RotateCa
)
$ErrorActionPreference = 'Stop'
$certDir = (Resolve-Path (Join-Path $PSScriptRoot 'certs')).Path

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required to generate the local certificates.'
}

if ($RotateCa -or -not (Test-Path (Join-Path $certDir 'ca.crt')) -or -not (Test-Path (Join-Path $certDir 'ca.key'))) {
  docker run --rm -v "${certDir}:/work" alpine/openssl req -x509 -newkey rsa:2048 -nodes -keyout /work/ca.key -out /work/ca.crt -days 365 -subj '/CN=Access Lock Local CA'
  Write-Host 'Generated a new MQTT CA. Reflash every lock and redistribute the CA to all MQTT clients.'
} else {
  Write-Host 'Reusing the existing MQTT CA; regenerating leaf certificates for the broker address.'
}
docker run --rm -v "${certDir}:/work" alpine/openssl req -newkey rsa:2048 -nodes -keyout /work/server.key -out /work/server.csr -subj '/CN=mosquitto'
$san = "subjectAltName=DNS:mosquitto,DNS:localhost,IP:127.0.0.1"
if ($BrokerAddress -match '^[0-9]+(\.[0-9]+){3}$') {
  $san += ",IP:$BrokerAddress"
}
Set-Content -LiteralPath (Join-Path $certDir 'server.ext') -Value $san
docker run --rm -v "${certDir}:/work" alpine/openssl x509 -req -in /work/server.csr -CA /work/ca.crt -CAkey /work/ca.key -CAcreateserial -out /work/server.crt -days 365 -sha256 -extfile /work/server.ext
docker run --rm -v "${certDir}:/work" alpine/openssl req -newkey rsa:2048 -nodes -keyout /work/backend.key -out /work/backend.csr -subj '/CN=backend'
docker run --rm -v "${certDir}:/work" alpine/openssl x509 -req -in /work/backend.csr -CA /work/ca.crt -CAkey /work/ca.key -CAcreateserial -out /work/backend.crt -days 365 -sha256
docker run --rm -v "${certDir}:/work" alpine/openssl req -newkey rsa:2048 -nodes -keyout /work/lock-demo.key -out /work/lock-demo.csr -subj '/CN=lock-demo'
docker run --rm -v "${certDir}:/work" alpine/openssl x509 -req -in /work/lock-demo.csr -CA /work/ca.crt -CAkey /work/ca.key -CAcreateserial -out /work/lock-demo.crt -days 365 -sha256

Remove-Item -LiteralPath (Join-Path $certDir 'server.csr'), (Join-Path $certDir 'server.ext'), (Join-Path $certDir 'backend.csr'), (Join-Path $certDir 'lock-demo.csr'), (Join-Path $certDir 'ca.srl') -ErrorAction SilentlyContinue
Write-Host "Generated local MQTT certificates in $certDir"
