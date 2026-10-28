# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, tech decisions, color scheme and coding standards live in AGENTS.md (imported below). Follow them strictly: keep it simple, no over-engineering, no emojis, find root causes with evidence before fixing.

@AGENTS.md

## Current state

- `frontend/` is a Next.js Kanban board behind a login, loaded from and saved to `/api/board`, built as a static export and served by FastAPI at `/` from the Docker image (multi-stage `Dockerfile`).
- `backend/` is a uv-managed FastAPI app with session auth, a SQLite-backed board API and an AI chat endpoint (see `backend/AGENTS.md` and `docs/DATABASE.md`; tests: `cd backend && uv run pytest`; add `--env-file ../.env` after `uv run` to include real OpenRouter calls). The root `Dockerfile` + `docker-compose.yml` build and run it on port 8001; `scripts/start.sh` / `scripts/stop.sh` (and `.ps1`) wrap compose.
- `docs/PLAN.md` defines the 10-part build sequence. Read it before starting work and follow the current part; Parts 1 and 5 require explicit user sign-off before proceeding. Keep each directory's AGENTS.md updated as code is added (`frontend/AGENTS.md` is a Part 1 deliverable).

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

IMPORTANT: the app on port 8001 holds the user's real board. Never run e2e tests or board-changing API calls against it; if you must change it for a manual check, save the current board first and restore that, not the default.

## Frontend architecture

- `src/lib/kanban.ts` holds the data model and pure logic: `BoardData` is normalized as `columns` (each with ordered `cardIds`) plus a `cards` record keyed by id. `moveCard` handles reorder within a column and moves across columns (dropping on a column id appends; dropping on a card id inserts at that card's index). `initialData` seeds the five fixed columns.
- `src/components/KanbanBoard.tsx` owns all board state (`useState`) and the dnd-kit `DndContext`; it passes rename/add/edit/delete handlers down to `KanbanColumn` -> `KanbanCard`. `KanbanCardPreview` renders the `DragOverlay`.
- The `BoardData` shape is the JSON contract for `/api/board`. The AI uses a nested variant (columns containing cards) converted in `backend/app/ai.py`.
- Path alias `@/` maps to `src/`. Styling is Tailwind v4.
