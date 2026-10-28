# Backend

FastAPI app managed with uv (Python 3.13). Runs inside the Docker container on port 8001.

## Structure

- `app/models.py` - Pydantic `BoardData` (mirrors the frontend type) with validation: fixed column ids in order, every card in exactly one column.
- `app/db.py` - SQLite via `sqlite3` (see `docs/DATABASE.md`). `init_db()` runs at startup; `get_board(username)` creates the user and seeds `default_board.json` on first access; `save_board()` replaces the board. `DB_PATH` env var overrides the default `data/kanban.db`.
- `app/ai.py` - OpenRouter client via the `openai` SDK (`base_url=https://openrouter.ai/api/v1`), model `openai/gpt-oss-120b`, key from `OPENROUTER_API_KEY`. `ask(prompt)` returns the reply text. `complete(messages)` uses Structured Outputs (`chat.completions.parse` with the `AIResponse` model: `reply` plus an optional full board). The AI sees and returns a nested board (`AIBoard`: columns containing their cards) converted with `to_ai_board` / `from_ai_board`; the latter validates against `BoardData`. Provider routing requires structured-output support and excludes DeepInfra, which returns free text for this model. The client uses a 60 s timeout with 1 retry.
- `app/main.py` - app wiring only: lifespan (`db.init_db()`), session middleware, the routers below, `/api/health`, and the static mount at `/` (registered last so `/api/*` wins; `html=True` serves `index.html`).
- `app/auth.py` - hardcoded credentials (compared with `secrets.compare_digest`), login/logout router, and the `current_user` dependency exposed as the `CurrentUser` type (`Annotated[str, Depends(current_user)]`). Add `username: CurrentUser` to a route to require a session.
- `app/board.py` - `/api/board` router.
- `app/chat.py` - `/api/chat` router with its request/response models; maps AI failures to 502.
- `static/` - files served at `/`. Not in git: the Dockerfile copies the Next.js static export (`frontend/out`) here. To run locally, copy `frontend/out` to `backend/static` after `npm run build`.
- `tests/` - pytest with FastAPI `TestClient`. `conftest.py` points `db.DB_PATH` at a temp file per test and provides `client` and `auth_client` (signed in) fixtures. `test_chat.py` uses a `fake_ai` fixture that replaces `ai.complete`.

## Routes

- `GET /api/health` -> `{"status": "ok"}`
- `POST /api/login` `{username, password}` -> `{username}` and sets the session cookie; 401 on bad credentials (hardcoded `user` / `password`)
- `POST /api/logout` clears the session
- `POST /api/chat` `{message, history: [{role, content}]}` -> `{reply, board | null}`. Sends the current board, history and message to the AI; a returned board is validated and saved. Any AI failure (API error, timeout, non-JSON output, refusal, invalid board) returns 502 and saves nothing. The client keeps the history.
- `GET /api/board` -> the user's `BoardData`; `PUT /api/board` replaces it (422 if invalid). Both 401 without a session.

Sessions use Starlette `SessionMiddleware` (signed cookie). The secret key is generated randomly at startup, so a server restart signs everyone out. Require a signed-in user with a `username: CurrentUser` parameter.

## Commands (run in `backend/`)

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001
uv run pytest
uv run pytest tests/test_main.py::test_health
uv run --env-file ../.env pytest   # include tests that call the real AI (skipped without the key)
uv run ruff check app tests && uv run ruff format --check app tests   # lint/format (line length 100)
```
