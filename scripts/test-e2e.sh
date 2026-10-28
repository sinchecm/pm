#!/usr/bin/env bash
# Runs the Playwright e2e tests against a throwaway app container on port 8002 with its own
# database, so the real app on port 8001 is never touched. Extra args go to playwright test.
set -e
cd "$(dirname "$0")/.."

export PORT=8002
docker compose -p pm-test up -d --build
trap 'docker compose -p pm-test down -v' EXIT
until curl -sf -o /dev/null http://localhost:8002/api/health; do sleep 1; done

cd frontend
version=$(node -p "require('@playwright/test/package.json').version")
docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/work -w /work "mcr.microsoft.com/playwright:v$version-noble" \
  npx playwright test "$@"
