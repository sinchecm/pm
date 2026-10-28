# Scripts

Start and stop the app container with Docker Compose from the project root (`docker-compose.yml`). The app runs at http://localhost:8001 and reads `OPENROUTER_API_KEY` from `.env`. Board data lives in the `data` Docker volume, which stop keeps; `docker compose down -v` resets it.

- Mac/Linux: `scripts/start.sh`, `scripts/stop.sh`
- Windows (PowerShell): `scripts/start.ps1`, `scripts/stop.ps1`

Start rebuilds the image (`docker compose up -d --build`); stop removes the container (`docker compose down`).
