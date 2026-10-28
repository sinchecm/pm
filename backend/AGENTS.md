# Backend

FastAPI app managed with uv (Python 3.13). Runs inside the Docker container on port 8001.

## Structure

- `app/main.py` - FastAPI app. API routes live under `/api/*` and must be registered before the static mount. `static/` is mounted at `/` (with `html=True`, so `/` serves `index.html`).
- `static/` - files served at `/`. Not in git: the Dockerfile copies the Next.js static export (`frontend/out`) here. To run locally, copy `frontend/out` to `backend/static` after `npm run build`.
- `tests/` - pytest tests using FastAPI `TestClient`.

## Routes

- `GET /api/health` -> `{"status": "ok"}`
- `POST /api/login` `{username, password}` -> `{username}` and sets the session cookie; 401 on bad credentials (hardcoded `user` / `password`)
- `POST /api/logout` clears the session
- `GET /api/me` -> `{username}` or 401

Sessions use Starlette `SessionMiddleware` (signed cookie). The secret key is generated randomly at startup, so a server restart signs everyone out. Use the `current_user(request)` helper to require a signed-in user in a route.

## Commands (run in `backend/`)

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001
uv run pytest
uv run pytest tests/test_main.py::test_health
```
