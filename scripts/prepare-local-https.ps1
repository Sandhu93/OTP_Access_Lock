param(
  [switch]$Force,
  [switch]$RotateCa,
  [string]$ServerAddress = '127.0.0.1'
)

$ErrorActionPreference = "Stop"

$certDir = Join-Path $PSScriptRoot "..\infra\edge\certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$caFile = Join-Path $certDir "local-ca.crt"
$caKeyFile = Join-Path $certDir "local-ca.key"
$serverFile = Join-Path $certDir "server.crt"
if ((Test-Path $caFile) -and (Test-Path $serverFile) -and -not $Force) {
  Write-Host "Local HTTPS certificates already exist. Use -Force to issue a server certificate for a changed LAN address."
  exit 0
}
$extFile = Join-Path $certDir "server-ext.cnf"
@"
basicConstraints=critical,CA:FALSE
subjectAltName=IP:$ServerAddress
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
"@ | Set-Content -LiteralPath $extFile -NoNewline

if ($RotateCa -or -not (Test-Path $caFile) -or -not (Test-Path $caKeyFile)) {
  docker run --rm -v "${certDir}:/out" alpine/openssl:latest req -x509 -newkey rsa:3072 -nodes -keyout /out/local-ca.key -out /out/local-ca.crt -days 825 -subj "/CN=Access Lock Local Demo Root" -addext "basicConstraints=critical,CA:TRUE,pathlen:1" -addext "keyUsage=critical,keyCertSign,cRLSign"
  Write-Host "Generated a new local CA. Reinstall local-ca.crt on every demo phone."
} else {
  Write-Host "Reusing the existing local CA; only the server certificate will be regenerated."
}
docker run --rm -v "${certDir}:/out" alpine/openssl:latest genrsa -out /out/server.key 2048
docker run --rm -v "${certDir}:/out" alpine/openssl:latest req -new -key /out/server.key -out /out/server.csr -subj "/CN=$ServerAddress"
docker run --rm -v "${certDir}:/out" alpine/openssl:latest x509 -req -in /out/server.csr -CA /out/local-ca.crt -CAkey /out/local-ca.key -CAcreateserial -out /out/server.crt -days 825 -sha256 -extfile /out/server-ext.cnf
Remove-Item -LiteralPath (Join-Path $certDir "server.csr"), (Join-Path $certDir "local-ca.srl"), $extFile -Force

Write-Host "Local CA exported to $(Join-Path $certDir 'local-ca.crt')"
Write-Host "Install this CA on each Android phone as a user CA certificate, then open:"
Write-Host "  https://$ServerAddress"
Write-Host "Do not bypass certificate warnings. Android debug builds trust installed user CAs; cleartext HTTP remains disabled."
Write-Host "The local CA private key is ignored by Git and must never be committed."
