# Code Review

Date: 2026-10-28. Scope: the whole repository at commit `a44d70a` (backend, frontend, Docker, scripts, tests, docs).

## Summary

The codebase is small, readable and well tested: 30 backend tests, 30 frontend unit tests and 11 e2e tests all pass, including real AI calls. The architecture is simple and consistent: one FastAPI app, one JSON board per user, the same `BoardData` contract everywhere, and server-side validation of every board, including those written by the AI.

The main weaknesses are in error handling on the frontend. Under realistic failures (network blip, server restart, slow AI provider) the app can silently stop saving or get stuck. These are the first things to fix.

| Severity | Count |
|---|---|
| High | 3 |
| Medium | 5 |
| Low | 14 |

## Strengths

- Board integrity is enforced in one place (`backend/app/models.py`): fixed columns, every card in exactly one column, keys matching ids. The AI cannot corrupt stored data.
- The AI gets a nested, schema-friendly board (`backend/app/ai.py`) and responds through strict Structured Outputs. The DeepInfra exclusion is backed by evidence (8/8 non-JSON responses).
- Tests are isolated: per-test temp SQLite database, a `fake_ai` fixture for the chat route, and e2e runs against a throwaway container (`scripts/test-e2e.sh`), never the real app.
- Saves are serialized through a queue so rapid edits (typing a column name) reach the server in order.
- Docs (`AGENTS.md` per directory, `docs/DATABASE.md`, `CLAUDE.md`) match the code closely.

## Findings

### High

**H1. One failed save permanently stops all later saves** - `frontend/src/components/KanbanBoard.tsx:45`

`saveQueue.current = saveQueue.current.then(() => saveBoard(board))`. If a `fetch` rejects once (network drop, server restarting), the queue promise is rejected and every later `.then` callback is skipped. Nothing is saved for the rest of the session, with no message, and the rejection is unhandled.

Evidence: simulating saves 1-4 where save 2 throws `TypeError: Failed to fetch` results in only `[1]` running.

Action: keep the chain alive, e.g. `saveQueue.current.then(() => saveBoard(board)).catch(handleSaveError)`, and surface the error (see H2). Add a unit test where one save rejects and the next save still runs.

**H2. Failed saves are silent** - `frontend/src/components/KanbanBoard.tsx:25-31`

`saveBoard` ignores the response status. The most likely failure is a 401 after a server restart: the session secret is random per process (`backend/app/main.py:28`), so every restart signs the user out. The board stays on screen, the user keeps editing, every save gets a 401, and all changes are lost on reload.

Action: check `response.ok`. On 401, return to the login screen (reuse the `onLogout` path in `page.tsx`). Otherwise show a short "Changes not saved" notice. Optionally read the session secret from `.env` (`SESSION_SECRET`) so restarts don't sign users out (see L7).

**H3. Chat gets stuck forever on a network error** - `frontend/src/components/ChatSidebar.tsx:40-45`

If `fetch("/api/chat")` rejects, `setIsSending(false)` never runs. "Thinking..." stays on screen, the Send button stays disabled, and the user's message is neither answered nor restored. The same happens if `response.json()` fails.

Action: wrap the request in `try/catch/finally`. Reset `isSending` in `finally`, and in `catch` use the same restore-message-plus-error path as the non-ok branch. Add a unit test with a rejected `fetch`.

### Medium

**M1. AI failures surface as bare 500 errors** - `backend/app/main.py:91`, `backend/app/ai.py:100-109`

Only `from_ai_board` validation errors are mapped to 502. Everything else in `ai.complete` becomes an unhandled 500:
- OpenRouter/API errors (rate limit, bad key, provider down)
- timeouts
- a provider returning non-JSON (pydantic `ValidationError` from `parse`; the DeepInfra case)
- a model refusal, where `message.parsed` is `None` and `result.board` raises `AttributeError`

Action: in the chat route, catch `openai.APIError` and `ValidationError` around `ai.complete` and return 502 with a clear detail. Treat `parsed is None` as an error. Add tests with `fake_ai` raising.

**M2. No timeout on AI calls** - `backend/app/ai.py:49-50`

The OpenAI client defaults are `read=600s` with `max_retries=2`, so a hung provider can leave the user watching "Thinking..." for up to about 30 minutes.

Evidence: `OpenAI().timeout` is `Timeout(connect=5.0, read=600, ...)` and `max_retries` is 2.

Action: `OpenAI(..., timeout=60, max_retries=1)`.

**M3. Edits made while the AI is working are lost** - `backend/app/main.py:88-99`, `frontend/src/components/KanbanBoard.tsx:49-52`

`/api/chat` reads the board, waits 3-10 s for the AI, then saves the AI's board. Any change the user makes in that window is saved first, then overwritten on the server, and also replaced in the UI by `handleAIBoardUpdate`.

Action (simplest): block board edits while a chat request is pending. Lift `isSending` to `KanbanBoard`, disable drag and the edit controls, and show a small "AI is updating the board" state. Alternative: optimistic concurrency, comparing `updated_at` and returning 409, which needs more code.

**M4. Closing the chat sidebar erases the conversation** - `frontend/src/components/KanbanBoard.tsx:233-238`

`ChatSidebar` is mounted only while open, so its `messages` state (and with it the AI's context) is discarded on Close.

Action: lift `messages` into `KanbanBoard`, or keep the sidebar mounted and hide it.

**M5. Outdated dependencies with security advisories** - `frontend/package.json`

`npm audit --omit=dev` reports a critical advisory range for `next` (<=16.4.0, installed 16.1.6), plus high-severity `nanoid` and `postcss` advisories. The app ships as a static export (no Next server in production), which limits exposure, but `AGENTS.md` requires the latest versions. Several packages are behind:
- `next` 16.4.3
- `react` 19.3.1
- `tailwindcss` 4.3.3
- `@playwright/test` 1.64.1
- `vitest` 5
- `eslint` 10

Action: upgrade `next`/`eslint-config-next`, `react`/`react-dom` and tailwind first, then the test tooling (Vitest 5 and jsdom 30 may need config tweaks). `scripts/test-e2e.sh` picks up the Playwright image version automatically. Run all test suites afterwards.

### Low

**L1. Unused import** - `backend/app/db.py:1`. `json` is never used (ruff F401). Remove it.

**L2. Dead or duplicated code**
- `GET /api/me` (`backend/app/main.py:72-74`) is no longer used by the frontend. Remove it and its tests, or keep it deliberately and say so.
- `useMemo(() => board.cards, [board.cards])` (`KanbanBoard.tsx:61`) memoizes nothing. Use `board.cards` directly.
- `initialData` in `frontend/src/lib/kanban.ts` duplicates `backend/app/default_board.json` and is only used by tests, so the two can drift. Move it to a test fixture that imports the JSON, or add a test asserting they are equal.

**L3. Any board-load failure looks like "signed out"** - `frontend/src/app/page.tsx:8-11`. A 500 from `/api/board` shows the login form, and logging in again just stays there. Only treat 401 as signed out; show an error otherwise.

**L4. Login form has no pending or network-error handling** - `frontend/src/components/LoginForm.tsx:12-24`. A rejected `fetch` is unhandled, and the button can be double-submitted. Add `try/catch` and disable the button while pending.

**L5. Non-constant-time password comparison** - `backend/app/main.py:60`. Negligible for hardcoded MVP credentials, but `secrets.compare_digest` is a one-line change and the right habit before real accounts arrive.

**L6. No input size limits** - `backend/app/main.py:36-38`. `message` and `history` are unbounded, so a client can send a huge history and drive up token cost. Add `max_length` to `message`, and cap `history` to the last N messages on the server.

**L7. Sessions end on every restart** - `backend/app/main.py:27-28`. This is intentional for simplicity, but combined with H2 it causes data loss. Read `SESSION_SECRET` from `.env`, falling back to random.

**L8. Empty titles are accepted** - `backend/app/models.py:6-15`, `frontend/src/components/KanbanColumn.tsx:44-47`. A column (or, via the API or AI, a card) can be saved with an empty title. Add `Field(min_length=1)` to titles, and on the frontend keep the previous column title if the input is left empty on blur.

**L9. Script robustness** - `scripts/start.sh`, `scripts/test-e2e.sh:10`
- `start.sh` has no `set -e`, so it prints "Running at ..." even when the build fails, and it hardcodes port 8001 even when `PORT` is set.
- The health-wait loop in `test-e2e.sh` never gives up if the container crashes.

Add `set -e` and a bounded wait (e.g. 60 tries, then print the container logs and fail).

**L10. Stale frontend scaffolding**
- `npm start` (`next start`) does not work with `output: "export"`.
- `test` duplicates `test:unit`, and `test:all` runs e2e without the container.
- `frontend/README.md` still says to use `npm run dev`.
- `public/*.svg` are unused Next template files.

Remove or update these.

**L11. Card is a button containing buttons** - `frontend/src/components/KanbanCard.tsx:55`. dnd-kit spreads `role="button"` onto the whole card, which contains the Edit and Remove buttons. Screen readers announce one large button, and it already caused an e2e selector collision. Use a drag handle (`setActivatorNodeRef`) or move the drag attributes off the container.

**L12. No backend linter configured** - `backend/pyproject.toml`. Add `ruff` as a dev dependency and run it alongside the tests. It currently finds the L1 import and a mutable class attribute in `tests/test_chat.py:22`.

**L13. E2E chat tests always call the real AI** - `frontend/tests/chat.spec.ts`. They cost tokens and fail without network or a key. Tag them (e.g. `@ai` in the title) so they can be excluded with `--grep-invert @ai`, and document that.

**L14. Docker image hardening (optional)** - `Dockerfile`. The app runs as root and the image has no `HEALTHCHECK`. For a local MVP this is acceptable. If kept simple, at least add a non-root `USER`.

## Test gaps

These map to the fixes above; add them together with each fix:
- a save rejects, then later saves still run, and the user is told (H1, H2)
- a save returns 401, and the login screen is shown (H2)
- the chat `fetch` rejects, and the message is restored with Send enabled (H3)
- `ai.complete` raises an API error, a parse error or a refusal, and the route returns 502 (M1)
- the board is locked while the AI is working (M3)
- the conversation survives closing and reopening the sidebar (M4)

## Resolution (2026-10-28)

Fixed: H1, H2, H3, M1, M2, M3, M4, M5, plus L1, L2 (except the default-board duplication), L3, L4, L5, L9 and L12. Not yet done: L6-L8, L10, L11, L13, L14 and the default-board duplication from L2.

- H1/H2: `queueSave` in `KanbanBoard.tsx` catches failures so the queue keeps running. A 401 returns to login with a "session expired" notice; other failures show a notice with Retry.
- H3/L4: the chat and login requests use `try/catch/finally`, so network errors restore the UI.
- M1/M2: `/api/chat` maps `OpenAIError`, `ValidationError` and refusals to 502; the client uses a 60 s timeout with 1 retry.
- M3: the board area is `inert` (with an "AI is updating your board" status) while a chat request is in flight.
- M4: `ChatSidebar` stays mounted and is hidden with `isOpen`, keeping the conversation.
- M5: all dependencies are upgraded to latest, and `npm audit` reports 0 vulnerabilities. Two exceptions:
  - ESLint stays on 9.39.5: the plugins used by `eslint-config-next` don't support ESLint 10.
  - TypeScript stays on 6.0.3: `typescript-eslint` supports `<6.1`.

  The upgrade also required importing `@testing-library/jest-dom/vitest` (jest-dom 7), renaming the config to `vitest.config.mts` with `import.meta.dirname` (Vite 8), and restructuring board loading in `page.tsx` for the stricter `react-hooks/set-state-in-effect` rule.
- L3: only a 401 counts as signed out; other load failures show an error.
- Backend refactor: `main.py` now only wires the app. Routes live in `auth.py`, `board.py` and `chat.py`, using a `CurrentUser` dependency type. The unused `/api/me` route was removed (L2), and credentials are compared with `secrets.compare_digest` (L5). `ruff` is a dev dependency with `line-length = 100`; check and format are clean (L12).
- L9: `start.sh` uses `set -e` and prints the real port; `start.ps1` stops on failure; `test-e2e.sh` gives up after 60 s and prints the logs.
- Tests added: 3 backend (AI error, refusal and parse failure all return 502), 10 frontend unit (save failure and retry, 401 expiry, AI lock, conversation kept, chat network error, pending state, load error, login network error).

## Action plan

In priority order. Each step should end with all three test suites green (`uv run pytest`, `npm run test:unit`, `scripts/test-e2e.sh`).

1. [x] Fix the save pipeline: keep the queue alive after failures, check `response.ok`, return to login on 401, show a "not saved" notice otherwise (H1, H2). Add tests.
2. [x] Make chat requests failure-safe on the client with `try/catch/finally` (H3). Add a test.
3. [x] Map all AI failures to 502 and set a 60 s timeout with 1 retry (M1, M2). Add tests.
4. [x] Lock board editing while an AI request is in flight (M3).
5. [x] Keep chat history when the sidebar closes (M4).
6. [x] Upgrade frontend dependencies and clear `npm audit` (M5).
7. [ ] Quick cleanups:
   - [x] remove the unused import and dead `useMemo` (L1, L2)
   - [x] remove `/api/me` (L2)
   - [ ] de-duplicate the default board (L2)
   - [ ] fix stale npm scripts, README and template SVGs (L10)
   - [x] add ruff (L12)
8. [ ] Small hardening:
   - [x] only treat 401 as signed out (L3)
   - [x] login pending and network-error handling (L4)
   - [x] constant-time password comparison (L5)
   - [ ] input size limits (L6)
   - [ ] `SESSION_SECRET` from `.env` (L7)
   - [ ] non-empty titles (L8)
   - [x] script `set -e` and bounded wait (L9)
9. [ ] Optional:
   - [ ] drag handle for accessibility (L11)
   - [ ] tag the real-AI e2e tests (L13)
   - [ ] non-root Docker user (L14)
