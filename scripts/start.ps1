Set-Location (Join-Path $PSScriptRoot "..")
docker compose up -d --build
Write-Host "Running at http://localhost:8001"
