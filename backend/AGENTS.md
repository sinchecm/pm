# Backend

FastAPI app managed with uv (Python 3.13). Runs inside the Docker container on port 8001.

## Structure

- `app/models.py` - Pydantic models. `BoardData` (mirrors the frontend type) validates: at least one column, unique column ids, every card in exactly one column, card keys match ids. `Card` has optional `priority` (`low`/`medium`/`high`), `dueDate` (ISO date), `labels` (1-30 chars each, stripped), `checklist` (`ChecklistItem`: `id`, `text`, `done`) and `assignee` (username or null). Also `Comment`, `CommentText` (1-2000 chars, stripped), `MyCard` (`boardId`, `boardName`, `columnTitle`, `card`). Also `BoardSummary` (with `owner` and the caller's `role`), `Member`, `Role` (`owner`/`member`), `User` and the `BoardName` constraint (1-80 chars, stripped).
- `app/db.py` - SQLite via `sqlite3` (see `docs/DATABASE.md`). Connections use `autocommit=False` so DDL is transactional. `init_db()` runs at startup: migrates older databases in place (v0 rebuilds the tables, v1 adds `boards.version`, later versions only add tables), creates tables, sets `PRAGMA user_version`, and seeds the demo user `user` / `password`. Passwords are hashed with `hashlib.scrypt`. Users: `create_user` (with a starter board from `default_board.json`), `authenticate`, `check_password`, `set_password`, `delete_user`. Access: `get_role(user_id, board_id)` returns `owner`, `member` or `None`; `list_boards` / `get_summary` cover owned and shared boards (owned first). The other board functions take a board id only, so routes must check the role first: `create_board` (from `empty_board.json`), `get_board` (returns data and version), `save_board(board_id, board, expected_version=None)` (bumps the version; returns `None` if `expected_version` is stale), `rename_board`, `delete_board`, `list_members`, `add_member` (`None` for an unknown user, `ValueError` if they already have access), `remove_member` (also unassigns their cards via `_unassign`, which saves a new board version), `assignees_are_members(board_id, board)`. `save_board` also deletes comments of cards no longer on the board. Comments: `list_comments`, `add_comment`, `get_comment(board_id, comment_id)`, `delete_comment`, `comment_counts`. `delete_user` also unassigns them on boards they were a member of, and removes their memberships, comments and owned boards (with those boards' memberships and comments). `DB_PATH` env var overrides the default `data/kanban.db`.
- `app/ai.py` - OpenRouter client via the `openai` SDK (`base_url=https://openrouter.ai/api/v1`), model `openai/gpt-oss-120b`, key from `OPENROUTER_API_KEY`. `ask(prompt)` returns the reply text. `complete(messages)` uses Structured Outputs (`chat.completions.parse` with the `AIResponse` model: `reply` plus an optional full board). The AI sees and returns a nested board (`AIBoard`: columns containing their cards, each with priority and due date) converted with `to_ai_board` / `from_ai_board`; the latter validates against `BoardData`. The system prompt includes today's date. Provider routing requires structured-output support and excludes DeepInfra, which returns free text for this model. The client uses a 60 s timeout with 1 retry.
- `app/main.py` - app wiring only: lifespan (`db.init_db()`), session middleware, the routers below, `/api/health`, and the static mount at `/` (registered last so `/api/*` wins; `html=True` serves `index.html`).
- `app/auth.py` - accounts router and the `current_user` dependency exposed as `CurrentUser` (`Annotated[User, Depends(current_user)]`). The session stores `user_id`; `current_user` loads the user, so deleted accounts lose their sessions. Add `user: CurrentUser` to a route to require a session.
- `app/boards.py` - `/api/boards` router. Dependencies `BoardAccess` (owner or member, else 404) and `OwnerAccess` (else 403) take the `board_id` path parameter; `etag()` formats the board version. Both are shared with chat.
- `app/my_cards.py` - `GET /api/me/cards`.
- `app/comments.py` - card comments router under `/api/boards/{id}`.
- `app/chat.py` - `/api/boards/{id}/chat` router with its request/response models; maps AI failures to 502.
- `static/` - files served at `/`. Not in git: the Dockerfile copies the Next.js static export (`frontend/out`) here. To run locally, copy `frontend/out` to `backend/static` after `npm run build`.
- `tests/` - pytest with FastAPI `TestClient`. `conftest.py` points `db.DB_PATH` at a temp file per test and provides `client`, `auth_client` (demo user), `board_id` (demo user's starter board), `other_client` (a second registered user), plus `login()` and `query()` (direct SQL on the db file) helpers. `test_db.py` covers the v0 and v1 migrations with dbs built from those schemas. `test_sharing.py` covers roles, members and ETag conflicts; `test_assignees.py` assignee rules and My cards; `test_comments.py` comments. `test_chat.py` uses a `fake_ai` fixture that replaces `ai.complete`.

## Routes

- `GET /api/health` -> `{"status": "ok"}`
- `POST /api/register` `{username, password}` -> 201 `{id, username}`, signs in. Username 3-32 of `A-Za-z0-9_.-`, password 8-128 chars (422 otherwise); 409 if taken. New users get a starter board.
- `POST /api/login` `{username, password}` -> `{id, username}` and sets the session cookie; 401 on bad credentials
- `POST /api/logout` clears the session
- `GET /api/me` -> `{id, username}`
- `PUT /api/me/password` `{currentPassword, newPassword}` -> 204; 403 if the current password is wrong
- `DELETE /api/me` `{password}` -> 204; deletes the user and their boards, clears the session; 403 on wrong password
- `GET /api/boards` -> `[{id, name, createdAt, updatedAt, owner, role}]`, owned boards first, then shared ones; `POST /api/boards` `{name}` -> 201 summary of a new board with the default five empty columns
- `GET /api/me/cards` -> open cards (not in a board's last column) assigned to the user on all their boards, `[{boardId, boardName, columnTitle, card}]`, soonest due first, undated last
- `GET /api/boards/{id}` -> `BoardData` with an `ETag` header (the board version); `PUT` replaces it (422 if invalid, including a card assigned to someone who is not the owner or a member) and returns the new `ETag`. With `If-Match: <etag>` the save only happens if the board is still at that version, otherwise 412. Owner or member.
- `PATCH /api/boards/{id}` `{name}` renames and returns the summary; `DELETE` -> 204. Owner only (403 for members).
- `GET /api/boards/{id}/members` -> `[{username, role}]`, owner first (owner or member). `POST` `{username}` -> 201 member (owner only; 404 unknown user, 409 already has access). `DELETE /api/boards/{id}/members/{username}` -> 204: the owner removes a member, or a member removes themselves (leave); 403 otherwise, 404 if not a member. Removing a member (or leaving) unassigns their cards on that board.
- `GET /api/boards/{id}/cards/{card_id}/comments` -> `[{id, cardId, author, text, createdAt}]` oldest first; `POST` `{text}` -> 201 comment, author from the session (404 if the card is not on the board). `DELETE /api/boards/{id}/comments/{comment_id}` -> 204 for the author or the board owner, 403 otherwise. `GET /api/boards/{id}/comment-counts` -> `{card_id: count}`. Owner or member.
- `POST /api/boards/{id}/chat` `{message, history: [{role, content}]}` -> `{reply, board | null}`. Sends that board, history and message to the AI; a returned board is validated and saved (with a new `ETag` header) only if nobody changed the board while the AI worked, else 409; a board assigning cards to non-members is rejected (502). The prompt lists the board members. Owner or member. Any AI failure (API error, timeout, non-JSON output, refusal, invalid board) returns 502 and saves nothing. The client keeps the history.

All routes except health, register and login return 401 without a session. Board routes return 404 for boards that don't exist or that the user neither owns nor is a member of.

Sessions use Starlette `SessionMiddleware` (signed cookie). The secret key is generated randomly at startup, so a server restart signs everyone out.

## Commands (run in `backend/`)

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8001
uv run pytest
uv run pytest tests/test_auth.py::test_health
uv run pytest --cov=app --cov-report=term-missing   # coverage
uv run --env-file ../.env pytest   # include tests that call the real AI (skipped without the key)
uv run ruff check app tests && uv run ruff format --check app tests   # lint/format (line length 100)
```
