# Backend

FastAPI app managed with uv (Python 3.13). Runs inside the Docker container on port 8001.

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api/*` and must be registered before the static mount. `static/` is mounted at `/` (with `html=True`, so `/` serves `index.html`).
- `static/` - files served at `/`. Currently a placeholder hello-world page that calls `/api/health`; replaced by the Next.js static export in Part 3.
- `tests/` - pytest tests using FastAPI `TestClient`.

## Routes

- `GET /api/health` -> `{"status": "ok"}`

## Commands (run in `backend/`)

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001
uv run pytest
uv run pytest tests/test_main.py::test_health
```
