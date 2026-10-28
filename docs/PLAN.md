# Project Plan

Each part lists substeps as a checklist, the tests to write/run, and success criteria. The agent checks items off as they are completed. Parts 1 and 5 require explicit user sign-off before moving on.

## Key decisions (proposed)

- Single container. Multi-stage Dockerfile: a Node stage builds the Next.js app as a static export (`output: "export"` -> `frontend/out`); a Python stage installs the backend with `uv` and runs `uvicorn` on port 8001.
- FastAPI serves all API routes under `/api/*` and mounts the static export at `/`.
- `docker compose` drives the container (port 8001, `.env` passed in, a named volume for the SQLite file). Scripts in `scripts/` wrap `docker compose up -d --build` / `docker compose down`: `start.sh`/`stop.sh` for Mac and Linux, `start.ps1`/`stop.ps1` for Windows.
- Auth: `POST /api/login` checks the hardcoded credentials and sets a session via Starlette `SessionMiddleware` (signed cookie). `POST /api/logout` clears it. `GET /api/me` returns the current user or 401. Board/AI routes require a session.
- AI: the `openai` Python SDK pointed at OpenRouter (`base_url="https://openrouter.ai/api/v1"`), model `openai/gpt-oss-120b`, Structured Outputs via a JSON schema response format.
- Backend tests: `pytest` with FastAPI `TestClient`, run via `uv run pytest`. AI tests that hit the real API are marked so they can be skipped without a key.

---

## Part 1: Plan

- [x] Enrich this document with substeps, tests and success criteria for every part
- [x] Create `frontend/AGENTS.md` describing the existing frontend code
- [x] User reviews and approves the plan

Success criteria: user has approved this plan.

## Part 2: Scaffolding

- [x] `backend/` as a uv project (`pyproject.toml`, `uv.lock`) with FastAPI and uvicorn
- [x] `backend/app/main.py`: `GET /api/health` returning `{"status": "ok"}`; serve a placeholder `static/index.html` ("hello world") at `/` that calls `/api/health` and displays the result
- [x] `Dockerfile` (Python stage only for now, using uv) and `docker-compose.yml` (port 8001, `env_file: .env`)
- [x] `scripts/start.sh`, `scripts/stop.sh`, `scripts/start.ps1`, `scripts/stop.ps1`
- [x] pytest test for `/api/health`
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md`; minimal root README with start/stop instructions

Tests:
- `uv run pytest` passes
- `scripts/start.sh` builds and starts the container; `curl localhost:8001/api/health` returns ok; opening `http://localhost:8001/` shows hello world plus the API response; `scripts/stop.sh` stops it

Success criteria: one command starts the container locally, the static page and API call both work, one command stops it.

## Part 3: Add in Frontend

- [x] Configure Next.js for static export; confirm `npm run build` produces `frontend/out`
- [x] Add a Node build stage to the Dockerfile; copy `out/` into the Python image and mount it at `/` (replacing the placeholder page)
- [x] Add card editing (edit title and details of an existing card) since the business requirements need it and the demo lacks it
- [x] Unit tests for card editing; extend existing unit tests where coverage is thin
- [x] Point Playwright at the running container (configurable `baseURL`) so e2e tests exercise the real served app

Tests:
- `npm run lint`, `npm run test:unit` pass
- `npm run test:e2e` passes against the container at `localhost:8001`

Success criteria: `http://localhost:8001/` shows the Kanban demo served by FastAPI from inside the container; cards can be edited.

## Part 4: Fake user sign in

- [x] Backend: `SessionMiddleware`, `POST /api/login`, `POST /api/logout`, `GET /api/me`
- [x] Frontend: on load call `/api/me`; show a login form if not signed in, the board if signed in; a Log out button in the header
- [x] Wrong credentials show an error message

Tests:
- pytest: login success, login failure (401), `/api/me` with and without a session, logout clears session
- Vitest: login form renders, submits, shows error on failure
- Playwright: unauthenticated visit shows login; bad credentials show error; `user`/`password` shows board; logout returns to login; reload keeps session

Success criteria: the board is only reachable after logging in with `user`/`password`, and logging out works.

## Part 5: Database modeling

- [x] Propose a schema and save it as `docs/schema.json`. Proposal: `users` (id, username unique, created_at) and `boards` (id, user_id unique FK, data JSON, updated_at), where `data` is the `BoardData` JSON the frontend already uses. Storing the board as one JSON document keeps reads/writes and AI updates to a single whole-board replace; normalized `columns`/`cards` tables are the alternative if per-card queries become necessary.
- [x] Document the approach in `docs/DATABASE.md` (schema, why JSON, how the db is created and seeded with the default board for a new user)
- [x] User sign-off

Success criteria: user has approved the schema.

## Part 6: Backend

- [x] SQLite access with the standard library `sqlite3` module; create the db file and tables on startup if missing (path configurable, default in the compose volume)
- [x] Seed the `user` row and a default board on first access
- [x] `GET /api/board` returns the signed-in user's board
- [x] `PUT /api/board` replaces it, validated with Pydantic models mirroring `BoardData`
- [x] Both routes return 401 without a session

Tests (pytest, temp db per test):
- db is created when missing; default board is seeded
- get returns the seeded board; put then get round-trips; invalid payload returns 422; unauthenticated returns 401
- data persists across app restarts (new app instance, same db file)

Success criteria: backend tests pass; board data survives container restarts.

## Part 7: Frontend + Backend

- [x] Frontend loads the board from `GET /api/board` after login (loading state while fetching)
- [x] Every change (move, rename, add, edit, delete) updates local state and saves with `PUT /api/board`
- [x] Remove `initialData` usage from the runtime path (keep only as a test fixture if useful)

Tests:
- Vitest with mocked fetch: board loads from API; each action triggers a save with the right payload
- Playwright against the container: add, edit, move, rename, delete, then reload and verify everything persisted; restart the container and verify again

Success criteria: the app is a persistent Kanban board; all changes survive reloads and restarts.

## Part 8: AI connectivity

- [x] Add the `openai` SDK; a small `ai.py` client configured for OpenRouter using `OPENROUTER_API_KEY`
- [x] Temporary/debug route or test that asks "What is 2+2?" and returns the answer

Tests:
- pytest (real API, skipped if no key): response contains "4"

Success criteria: the container can reach OpenRouter and get a correct answer from `openai/gpt-oss-120b`.

## Part 9: AI with board context and Structured Outputs

- [x] `POST /api/chat` taking `{ message, history }`
- [x] Build the prompt: system instructions, the current board JSON, conversation history, user message
- [x] Structured Output schema: `{ reply: string, board: BoardData | null }`. When `board` is present, validate it and save it as the new board
- [x] Return `{ reply, board }` to the client

Tests:
- pytest with the AI client mocked: reply-only response leaves board unchanged; response with a board saves it; invalid board from the model is rejected without corrupting stored data; 401 without session
- pytest (real API, skippable): asking to "add a card titled X to Backlog" results in a saved board containing that card; asking a plain question returns a reply and no board change

Success criteria: the AI can answer questions about the board and create/edit/move one or more cards via structured output, persisted to the db.

## Part 10: AI chat sidebar

- [x] Sidebar chat panel (toggleable) styled with the project color scheme: message list, input, send button (purple), loading indicator
- [x] Keep conversation history in component state and send it with each message
- [x] When the response includes a board, replace the board state so the UI refreshes immediately

Tests:
- Vitest with mocked fetch: messages render; sending shows loading then reply; a returned board updates the displayed columns/cards
- Playwright against the container (real AI, skippable): ask the AI to create a card and see it appear on the board without reload

Success criteria: user can chat with the AI in the sidebar, and AI-driven board changes appear on the board automatically.

---

# Phase 2: Comprehensive project management

Goal: grow the MVP into a multi-user, multi-board project management app, keeping tests strong at every step. Parts are built as vertical slices (backend + frontend + tests).

## Key decisions

- Real accounts: users register with a username and password, hashed with the standard library `hashlib.scrypt` (no new dependency). The demo account `user` / `password` is still seeded so the original flow keeps working.
- Sessions store the user id; `current_user` loads the user from the db, so deleting an account ends its sessions.
- Many boards per user. `boards` loses its `UNIQUE (user_id)` and gains `name` and `created_at`. Board data stays one JSON document per board.
- Schema versioning with `PRAGMA user_version`. Version 0 (the MVP layout) is migrated in place on startup, keeping existing users and boards. The migration is tested against a v0 database file.
- Columns become flexible (add, rename, remove; at least one). The last column counts as "done" for overdue stats.
- Cards gain optional `priority` (`low` | `medium` | `high`) and `dueDate` (ISO date).
- API: `/api/board` is replaced by `/api/boards` (list/create) and `/api/boards/{id}` (get/put data, patch name, delete); chat moves to `/api/boards/{id}/chat`. Boards of other users return 404.
- E2E tests register a fresh user per test, so they are isolated without resetting shared data.

## Part 11: Accounts

- [x] Schema v1 with migration from v0; seed the demo user
- [x] `POST /api/register`, db-backed `POST /api/login`, `GET /api/me`, `PUT /api/me/password`, `DELETE /api/me`
- [x] Frontend: sign in / create account form; account settings (change password, delete account)

Tests: pytest for registration (success, duplicate 409, validation 422), login against the db, password change, account deletion (sessions end, boards removed), v0 migration. Vitest for the auth form and account settings. Playwright: register, sign out, sign back in; change password.

## Part 12: Multiple boards

- [x] Boards CRUD API scoped to the signed-in user; new users get a starter board
- [x] Chat per board
- [x] Frontend: board list sidebar (select, create, rename, delete), selected board kept in the URL hash

Tests: pytest for CRUD, ownership (404 for another user's board), chat on a specific board. Vitest for the workspace. Playwright: create, switch, rename, delete boards; data stays separate.

## Part 13: Richer boards

- [x] Add and remove columns
- [x] Card priority and due date (edit form, badges, overdue highlight)
- [x] Search and priority filter; board stats (cards, high priority, overdue)
- [x] AI prompt knows about flexible columns, priority and due dates

Tests: pytest validation of the new fields and columns; Vitest for column add/remove, card fields, filters and stats; Playwright for each.

## Part 14: Board sharing

- [x] Schema v2: `board_members (board_id, user_id, created_at)` and a `version` counter on `boards`; migrate v1 in place
- [x] Owners add members by username and remove them; members can view, edit and chat, and can leave; only owners rename, delete and manage members (403 otherwise)
- [x] Board list includes shared boards with `owner` and `role`
- [x] Optimistic concurrency: `GET /api/boards/{id}` returns an `ETag` (the version); `PUT` with `If-Match` returns 412 if the board changed since; the client reloads the latest board and says so. Chat saves only if the board didn't change while the AI worked (409)
- [x] Frontend: members panel (share, remove, leave), shared boards in the sidebar, owner-only controls hidden for members

Tests: pytest for access rules per role, member management, migration from v1, ETag/If-Match and chat conflicts, account deletion cleaning memberships. Vitest for the members panel, conflict reload, role-based controls. Playwright with two users: share, edit as member, see it as owner, conflict reload, leave.

## Part 15: Labels and checklists

- [x] Cards gain `labels` (list of short tags) and `checklist` (items with `id`, `text`, `done`); both default to empty, so existing boards stay valid
- [x] Card view shows label chips and the checklist with progress; items can be ticked without opening the editor
- [x] Editor: labels as comma-separated text, checklist one item per line (ticks kept for unchanged lines)
- [x] Label filter; search also matches labels; the AI can read and set both

Tests: pytest validation and AI round trip; Vitest for parsing helpers, ticking, editing and filtering; Playwright for adding labels and checklist items, ticking, filtering, persistence.

## Part 16: Assignees and My cards

- [x] Cards gain `assignee` (a username or null). A board save is rejected (422) if a card is assigned to someone who is not the owner or a member; the AI is told the members and its board is checked the same way
- [x] Removing a member, a member leaving, or deleting an account unassigns that user's cards on the affected boards (the board version changes)
- [x] `GET /api/me/cards`: open cards (not in a board's last column) assigned to me across all my boards, with board and column, soonest due first
- [x] Frontend: assignee select in the card editor, assignee chip on cards, assignee filter, a "My cards" view in the sidebar that links to each card's board

Tests: pytest for assignee validation, unassignment on removal/leave/deletion, my-cards contents and order, AI assignee check. Vitest for the editor, chip, filter and My cards view. Playwright: owner assigns a card to a member, the member sees it in My cards and opens the board; removing the member unassigns it.

## Part 17: Card comments

- [x] Schema v3: `comments (id, board_id, card_id, user_id, text, created_at)`; additive, so older databases just gain the table
- [x] `GET/POST /api/boards/{id}/cards/{card_id}/comments` (owner or member; 404 for a card not on the board; text 1-2000 chars), `DELETE /api/boards/{id}/comments/{comment_id}` (the author or the board owner), `GET /api/boards/{id}/comment-counts`
- [x] The author comes from the session, never from the client. Comments of cards removed from the board are deleted on save; deleting a board or an account deletes its comments
- [x] Frontend: comment count on each card; a comments panel on the card to read, post and delete

Tests: pytest for access, validation, authorship, deletion rights, cleanup and counts. Vitest for the panel and counts. Playwright: two users comment on a shared card; the count shows; deleting a card removes its comments.
