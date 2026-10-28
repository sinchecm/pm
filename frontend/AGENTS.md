# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, dnd-kit. Currently a frontend-only demo: all board state is in memory and resets on reload.

## Structure

- `src/app/layout.tsx` - root layout; loads Space Grotesk (`--font-display`) and Manrope (`--font-body`) via `next/font/google`.
- `src/app/page.tsx` - renders `KanbanBoard` at `/`.
- `src/app/globals.css` - Tailwind import plus CSS variables for the project color scheme (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`) and surface/stroke/shadow tokens. Components reference these as `text-[var(--navy-dark)]` etc.
- `src/lib/kanban.ts` - data model and pure logic:
  - `BoardData = { columns: Column[]; cards: Record<string, Card> }`, where each `Column` holds ordered `cardIds` and `Card` is `{ id, title, details }`.
  - `initialData` - seed board with five columns (Backlog, Discovery, In Progress, Review, Done) and eight cards.
  - `moveCard(columns, activeId, overId)` - reorders within a column or moves across columns. Dropping on a column id appends; dropping on a card id inserts at that card's position.
  - `createId(prefix)` - random id generator for new cards.
- `src/components/KanbanBoard.tsx` - client component that owns board state (`useState`) and the dnd-kit `DndContext` (PointerSensor, 6px activation distance, `closestCorners`). Handles drag end, column rename, add card and delete card.
- `src/components/KanbanColumn.tsx` - droppable column; title is an always-editable input (rename); renders cards in a `SortableContext` plus `NewCardForm`.
- `src/components/KanbanCard.tsx` - sortable card showing title/details with a Remove button.
- `src/components/KanbanCardPreview.tsx` - static card used in the `DragOverlay`.
- `src/components/NewCardForm.tsx` - toggleable form to add a card (title required, details optional, defaults to "No details yet.").

Cards can be added, removed and moved, but there is no way to edit an existing card's title or details yet.

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/kanban.test.ts` (moveCard), `src/components/KanbanBoard.test.tsx` (renders columns, rename, add/remove card). Setup in `src/test/setup.ts`.
- E2E (Playwright, Chromium): `tests/kanban.spec.ts` (load board, add card, drag card between columns). The config starts `npm run dev` on 127.0.0.1:3000.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
```

## Conventions

- Path alias `@/` -> `src/`.
- Test selectors: `data-testid="column-<id>"`, `data-testid="card-<id>"`, plus aria labels ("Column title", "Delete <title>").
