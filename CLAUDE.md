# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project requirements, tech decisions, color scheme and coding standards live in AGENTS.md (imported below). Follow them strictly: keep it simple, no over-engineering, no emojis, find root causes with evidence before fixing.

@AGENTS.md

## Current state

- `frontend/` is a working, frontend-only Next.js demo (Kanban board with in-memory state). It is not yet wired to a backend or Docker.
- `backend/` is a uv-managed FastAPI app (see `backend/AGENTS.md`; tests: `cd backend && uv run pytest`). The root `Dockerfile` + `docker-compose.yml` build and run it on port 8001; `scripts/start.sh` / `scripts/stop.sh` (and `.ps1`) wrap compose.
- `docs/PLAN.md` defines the 10-part build sequence. Read it before starting work and follow the current part; Parts 1 and 5 require explicit user sign-off before proceeding. Keep each directory's AGENTS.md updated as code is added (`frontend/AGENTS.md` is a Part 1 deliverable).

## Frontend commands (run in `frontend/`)

```bash
npm install
npm run dev              # dev server on :3000
npm run build
npm run lint
npm run test:unit        # vitest (src/**/*.test.ts[x], jsdom)
npm run test:e2e         # playwright (tests/), auto-starts dev server on 127.0.0.1:3000
npx vitest run src/lib/kanban.test.ts          # single unit test file
npx vitest run -t "test name"                  # single unit test by name
npx playwright test tests/kanban.spec.ts -g "name"  # single e2e test
```

## Frontend architecture

- `src/lib/kanban.ts` holds the data model and pure logic: `BoardData` is normalized as `columns` (each with ordered `cardIds`) plus a `cards` record keyed by id. `moveCard` handles reorder within a column and moves across columns (dropping on a column id appends; dropping on a card id inserts at that card's index). `initialData` seeds the five fixed columns.
- `src/components/KanbanBoard.tsx` owns all board state (`useState`) and the dnd-kit `DndContext`; it passes rename/add/delete handlers down to `KanbanColumn` -> `KanbanCard`. `KanbanCardPreview` renders the `DragOverlay`.
- The `BoardData` shape is the natural JSON contract for the future backend API and the AI structured-output board updates (Parts 5-10).
- Path alias `@/` maps to `src/`. Styling is Tailwind v4.
