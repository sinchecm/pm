# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, dnd-kit. Built as a static export (`output: "export"` -> `out/`) that FastAPI serves at `/` inside the Docker image. Board state is still in memory and resets on reload.

## Structure

- `src/app/layout.tsx` - root layout; loads Space Grotesk (`--font-display`) and Manrope (`--font-body`) via `next/font/google`.
- `src/app/page.tsx` - client component; on load calls `GET /api/me` and renders `LoginForm` when signed out or `KanbanBoard` when signed in. Handles logout (`POST /api/logout`).
- `src/components/LoginForm.tsx` - username/password form posting to `/api/login`; shows "Invalid username or password" on failure.
- `src/app/globals.css` - Tailwind import plus CSS variables for the project color scheme (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`) and surface/stroke/shadow tokens. Components reference these as `text-[var(--navy-dark)]` etc.
- `src/lib/kanban.ts` - data model and pure logic:
  - `BoardData = { columns: Column[]; cards: Record<string, Card> }`, where each `Column` holds ordered `cardIds` and `Card` is `{ id, title, details }`.
  - `initialData` - seed board with five columns (Backlog, Discovery, In Progress, Review, Done) and eight cards.
  - `moveCard(columns, activeId, overId)` - reorders within a column or moves across columns. Dropping on a column id appends; dropping on a card id inserts at that card's position.
  - `createId(prefix)` - random id generator for new cards.
- `src/components/KanbanBoard.tsx` - takes an `onLogout` prop (Log out button in the header); owns board state (`useState`) and the dnd-kit `DndContext` (PointerSensor, 6px activation distance, `closestCorners`). Handles drag end, column rename, add, edit and delete card.
- `src/components/KanbanColumn.tsx` - droppable column; title is an always-editable input (rename); renders cards in a `SortableContext` plus `NewCardForm`.
- `src/components/KanbanCard.tsx` - sortable card showing title/details with Edit and Remove buttons. Edit switches to an inline form (drag attributes/listeners are not attached while editing).
- `src/components/KanbanCardPreview.tsx` - static card used in the `DragOverlay`.
- `src/components/NewCardForm.tsx` - toggleable form to add a card (title required, details optional, defaults to "No details yet.").

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/kanban.test.ts` (moveCard), `src/components/KanbanBoard.test.tsx` (renders columns, rename, add/edit/remove card, logout), `src/app/page.test.tsx` (sign-in flow with `fetch` stubbed via `vi.stubGlobal`). Setup in `src/test/setup.ts`.
- E2E (Playwright, Chromium): `tests/auth.spec.ts` (login, bad credentials, session on reload, logout), `tests/kanban.spec.ts` (load board, add, edit, rename, drag between columns; logs in first via `tests/helpers.ts`). Tests run against the app container at `http://localhost:8001` (override with `BASE_URL`), because the frontend needs the API. Start it with `scripts/start.sh` first.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e   # needs the container running
```

`npm run dev` serves the UI without the API, so it only shows the login form; use the container for real testing.

## Conventions

- Path alias `@/` -> `src/`.
- Test selectors: `data-testid="column-<id>"`, `data-testid="card-<id>"`, plus aria labels ("Column title", "Card title", "Card details", "Edit <title>", "Delete <title>").
