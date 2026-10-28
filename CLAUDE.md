# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, tech decisions, color scheme and coding standards live in AGENTS.md (imported below). Follow them strictly: keep it simple, no over-engineering, no emojis, find root causes with evidence before fixing.

@AGENTS.md

## Current state

- `frontend/` is a Next.js project management app: accounts (register, sign in, change password, delete account), multiple boards per user (`/api/boards`) that owners can share with other users (members edit; ETag/If-Match prevents overwriting each other), flexible columns, card priority, due dates, labels, checklists, assignees (board members) and comments, a cross-board "My cards" view, search/filter and stats, and an AI chat sidebar per board (`/api/boards/{id}/chat`). Built as a static export and served by FastAPI at `/` from the Docker image (multi-stage `Dockerfile`).
- `backend/` is a uv-managed FastAPI app with session auth, a SQLite-backed board API and an AI chat endpoint (see `backend/AGENTS.md` and `docs/DATABASE.md`; tests: `cd backend && uv run pytest`; add `--env-file ../.env` after `uv run` to include real OpenRouter calls). The root `Dockerfile` + `docker-compose.yml` build and run it on port 8001; `scripts/start.sh` / `scripts/stop.sh` (and `.ps1`) wrap compose.
- `docs/PLAN.md` defines the build sequence: Phase 1 (parts 1-10, the MVP) and Phase 2 (parts 11+: accounts, multiple boards, richer boards, sharing, labels and checklists, assignees, comments). Keep each directory's AGENTS.md updated as code is added (`frontend/AGENTS.md` is a Part 1 deliverable).

## Frontend commands (run in `frontend/`)

```bash
npm install
npm run dev              # UI only on :3000 (no API, so stuck at login)
npm run build
npm run lint
npm run test:unit        # vitest (src/**/*.test.ts[x], jsdom)
npx vitest run src/lib/kanban.test.ts          # single unit test file
npx vitest run -t "test name"                  # single unit test by name
```

## E2E tests

Run from the repo root with `scripts/test-e2e.sh` (extra args go to `playwright test`, e.g. `scripts/test-e2e.sh tests/kanban.spec.ts -g "name"`). It starts a throwaway `pm-test` compose project on port 8002 with its own database volume, runs Playwright in the official Docker image (local Chromium lacks system libraries on this machine), then removes the container and volume.

IMPORTANT: the app on port 8001 holds the user's real data. Never run e2e tests or data-changing API calls against it; if you must change it for a manual check, back up the `pm_data` volume first. E2E tests register a fresh user per test, so they don't share state. They run with 2 workers: more push this machine's memory into swap and assertions time out.

## Frontend architecture

- `src/app/page.tsx` checks `/api/me` and shows `AuthForm` or `Workspace`. `Workspace` holds the board list (selected board in the URL hash) and renders `KanbanBoard` (keyed by board id) or `AccountSettings`. `src/lib/api.ts` has the `request()` fetch helper.
- `src/lib/kanban.ts` holds the data model and pure logic: `BoardData` is normalized as `columns` (each with ordered `cardIds`) plus a `cards` record keyed by id; cards have optional `priority` and `dueDate`. `moveCard` handles reorder within a column and moves across columns (dropping on a column id appends; dropping on a card id inserts at that card's index). Also filter, overdue and stats helpers. `initialData` mirrors `backend/app/default_board.json` and is only used by tests (the server seeds boards).
- `src/components/KanbanBoard.tsx` owns one board's state (`useState`) and the dnd-kit `DndContext`; it passes column/card handlers down to `KanbanColumn` -> `KanbanCard`, and renders `ChatSidebar`, applying boards the AI returns without re-saving them. `KanbanCardPreview` renders the `DragOverlay`.
- The `BoardData` shape is the JSON contract for `/api/boards/{id}`. The AI uses a nested variant (columns containing cards) converted in `backend/app/ai.py`.
- Path alias `@/` maps to `src/`. Styling is Tailwind v4.

## DETAILED PLAN

@docs/PLAN.md
