#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
docker compose up -d --build
echo "Running at http://localhost:${PORT:-8001}"
