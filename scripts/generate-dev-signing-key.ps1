$ErrorActionPreference = 'Stop'
$target = (Resolve-Path (Join-Path $PSScriptRoot '..\infra\dev-signing')).Path

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required to generate the local development signing key.'
}

docker run --rm -v "${target}:/work" alpine/openssl ecparam -name prime256v1 -genkey -noout -out /work/dev-private.pem
docker run --rm -v "${target}:/work" alpine/openssl ec -in /work/dev-private.pem -pubout -out /work/dev-public.pem
Write-Host "Generated local development signing keypair in $target"
Write-Host 'The private key is ignored by git and must never be used outside this local demo.'
