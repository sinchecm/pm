# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, dnd-kit. Built as a static export (`output: "export"` -> `out/`) that FastAPI serves at `/` inside the Docker image. The board is loaded from and saved to the backend API.

## Structure

- `src/app/layout.tsx` - root layout; loads Space Grotesk (`--font-display`) and Manrope (`--font-body`) via `next/font/google`.
- `src/app/page.tsx` - client component; on load (and after login) calls `GET /api/board`. A 401 means signed out and shows `LoginForm`; otherwise renders `KanbanBoard` with the loaded board. Handles logout (`POST /api/logout`).
- `src/components/LoginForm.tsx` - username/password form posting to `/api/login`; shows "Invalid username or password" on failure.
- `src/app/globals.css` - Tailwind import plus CSS variables for the project color scheme (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`) and surface/stroke/shadow tokens. Components reference these as `text-[var(--navy-dark)]` etc.
- `src/lib/kanban.ts` - data model and pure logic:
  - `BoardData = { columns: Column[]; cards: Record<string, Card> }`, where each `Column` holds ordered `cardIds` and `Card` is `{ id, title, details }`.
  - `initialData` - the default board (same as `backend/app/default_board.json`); now only used by tests.
  - `moveCard(columns, activeId, overId)` - reorders within a column or moves across columns. Dropping on a column id appends; dropping on a card id inserts at that card's position.
  - `createId(prefix)` - random id generator for new cards.
- `src/components/KanbanBoard.tsx` - takes `initialBoard` and `onLogout` (Log out button in the header); owns board state (`useState`). An effect saves every change with `PUT /api/board`, queued so saves reach the server in order. Owns the dnd-kit `DndContext` (PointerSensor, 6px activation distance, `closestCorners`). Handles drag end, column rename, add, edit and delete card.
- `src/components/KanbanColumn.tsx` - droppable column; title is an always-editable input (rename); renders cards in a `SortableContext` plus `NewCardForm`.
- `src/components/KanbanCard.tsx` - sortable card showing title/details with Edit and Remove buttons. Edit switches to an inline form (drag attributes/listeners are not attached while editing).
- `src/components/KanbanCardPreview.tsx` - static card used in the `DragOverlay`.
- `src/components/NewCardForm.tsx` - toggleable form to add a card (title required, details optional, defaults to "No details yet.").

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/kanban.test.ts` (moveCard), `src/components/KanbanBoard.test.tsx` (UI actions and the PUT saved for each), `src/app/page.test.tsx` (board loading and sign-in flow). Both stub `fetch` with `vi.stubGlobal`. Setup in `src/test/setup.ts`.
- E2E (Playwright, Chromium): `tests/auth.spec.ts` (login, bad credentials, session on reload, logout), `tests/kanban.spec.ts` (load board, add, edit, rename, drag between columns), `tests/persistence.spec.ts` (all changes survive reload and re-login). `loginWithFreshBoard` in `tests/helpers.ts` resets the stored board first; tests run with one worker because they share the user's board. Tests need the API, so they run against a throwaway test container on `http://localhost:8002` started by `scripts/test-e2e.sh` (override with `BASE_URL`). Never point them at the real app on 8001: they reset the board.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test:unit
../scripts/test-e2e.sh   # e2e in an isolated test container
```

`npm run dev` serves the UI without the API, so it only shows the login form; use the container for real testing.

## Conventions

- Path alias `@/` -> `src/`.
- Test selectors: `data-testid="column-<id>"`, `data-testid="card-<id>"`, plus aria labels ("Column title", "Card title", "Card details", "Edit <title>", "Delete <title>").
