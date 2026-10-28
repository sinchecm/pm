Set-Location (Join-Path $PSScriptRoot "..")
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$port = if ($env:PORT) { $env:PORT } else { "8001" }
Write-Host "Running at http://localhost:$port"
