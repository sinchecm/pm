#!/usr/bin/env bash
cd "$(dirname "$0")/.."
docker compose up -d --build
echo "Running at http://localhost:8001"
