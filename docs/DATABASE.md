# Database

SQLite, accessed with Python's built-in `sqlite3` module. Schema: `docs/schema.json`.

## Tables

- `users` - one row per user (`id`, `username`, `created_at`). No password column: the MVP checks the hardcoded `user` / `password` in code. A `password_hash` column can be added when real accounts arrive.
- `boards` - one row per user (`user_id` is `UNIQUE`). `data` stores the whole board as JSON text, in the same `BoardData` shape the frontend uses: `{ columns: [{ id, title, cardIds }], cards: { [id]: { id, title, details } } }`.

## Why one JSON document per board

- The frontend already works with the whole board as one object, and the AI (Part 9) returns a whole updated board. Both become a single read and a single replace, with no mapping between tables and the frontend shape.
- Column order and card order within a column come for free from the arrays, with no position columns to maintain.
- A board is small (tens of cards), so rewriting it on each change is cheap.
- Trade-off: the database can't query or update individual cards. If that becomes necessary, the JSON maps directly onto normalized `columns` and `cards` tables.

## Validation

`PUT /api/board` and AI updates are validated with Pydantic models mirroring `BoardData` before saving. Columns are fixed, so a valid board must keep the same five column ids (titles may change), and every id in `cardIds` must exist in `cards`.

## Lifecycle

- The database file is `backend/data/kanban.db` (`/app/data/kanban.db` in the container), overridable with a `DB_PATH` environment variable so tests can use a temporary file.
- On startup the backend creates the directory, the file and the tables if they don't exist (`CREATE TABLE IF NOT EXISTS`).
- The first time a user loads their board, the backend creates their `users` row if needed and a `boards` row seeded with the default board: the five columns (Backlog, Discovery, In Progress, Review, Done) and the current demo cards.
- `docker-compose.yml` mounts a named volume at `/app/data`, so data survives container rebuilds and restarts. `scripts/stop.sh` (`docker compose down`) keeps the volume; deleting it (`docker compose down -v`) resets all data.
