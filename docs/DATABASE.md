# Database

SQLite, accessed with Python's built-in `sqlite3` module. Schema: `docs/schema.json`. The schema version is stored in `PRAGMA user_version` (currently 3).

## Tables

- `users` - one row per account (`id`, `username` unique, `password_hash`, `created_at`). Passwords are hashed with `hashlib.scrypt` (random 16-byte salt, stored as `scrypt$<salt hex>$<hash hex>`).
- `boards` - any number per user (`id`, `user_id` = the owner, `name`, `data`, `created_at`, `updated_at`, `version`, indexed on `user_id`). `data` stores the whole board as JSON text, in the same `BoardData` shape the frontend uses: `{ columns: [{ id, title, cardIds }], cards: { [id]: { id, title, details, priority, dueDate, labels, checklist: [{ id, text, done }] } } }`. `version` starts at 1 and increases on every save; the API exposes it as the `ETag` for optimistic concurrency.
- `comments` - card comments (`id`, `board_id`, `card_id` = the card's id inside the board JSON, `user_id` = author, `text`, `created_at`; indexed on `board_id, card_id`). Kept out of the board JSON so authors come from the session and saving a board can't rewrite them.
- `board_members` - boards shared with other users (`board_id`, `user_id`, `created_at`; primary key on both, indexed on `user_id`). The owner is not listed here. Members can read, edit and chat; only the owner renames, deletes or manages members.

## Why one JSON document per board

- The frontend already works with the whole board as one object, and the AI returns a whole updated board. Both become a single read and a single replace, with no mapping between tables and the frontend shape.
- Column order and card order within a column come for free from the arrays, with no position columns to maintain.
- A board is small (tens of cards), so rewriting it on each change is cheap.
- Trade-off: the database can't query or update individual cards. If that becomes necessary, the JSON maps directly onto normalized `columns` and `cards` tables.

## Validation

Board updates (`PUT /api/boards/{id}` and AI updates) are validated with Pydantic models mirroring `BoardData` before saving. A valid board has at least one column, unique column ids, every card in exactly one column (no missing, unknown or duplicate ids), and each `cards` key matching its card's `id`. `priority` is `low`, `medium`, `high` or null; `dueDate` is an ISO date or null; `labels` are 1-30 characters; checklist items need `id`, `text` and `done`; `assignee` is a username or null. All may be omitted (older boards don't have them).

The API also checks that every `assignee` is the board's owner or a member (422 otherwise). When a member is removed, leaves, or deletes their account, their cards on that board are unassigned as a new board version.

## Concurrency

Shared boards can be edited by several people, and each save replaces the whole board. To avoid silently overwriting someone else's change, the client sends the version it last saw as `If-Match`; the `UPDATE ... WHERE version = ?` matches nothing if the board moved on, and the API answers 412. The client then loads the latest board. The AI chat saves the same way against the version it read before calling the model (409 on conflict).

## Lifecycle

- The database file is `backend/data/kanban.db` (`/app/data/kanban.db` in the container), overridable with a `DB_PATH` environment variable so tests can use a temporary file.
- On startup the backend creates the directory, the file and the tables if they don't exist, then seeds the demo account `user` / `password` if it's missing.
- Registering creates the user and a starter board ("My Board") with the demo cards from `default_board.json`. New boards start from `empty_board.json` (five empty columns).
- Deleting an account deletes its boards (and their memberships and comments), its memberships of other boards, and its comments. Deleting a board deletes its memberships and comments. Saving a board deletes comments of cards that are no longer on it.
- `docker-compose.yml` mounts a named volume at `/app/data`, so data survives container rebuilds and restarts. `scripts/stop.sh` (`docker compose down`) keeps the volume; deleting it (`docker compose down -v`) resets all data.

## Migrations

`init_db()` reads `user_version`. A version 0 database (the MVP: users without passwords, one board per user enforced by `UNIQUE (user_id)`) is migrated in one transaction: the old tables are renamed, the new ones created, users copied (the demo user gets the demo password; any other account gets a random one, so it is locked), boards copied with the name "My Board" and their original `updated_at`, and the old tables dropped. Version 1 (accounts and many boards) gains `boards.version` (`ALTER TABLE ... ADD COLUMN ... DEFAULT 1`) and the `board_members` table. Version 2 gains the `comments` table (created by the schema script, so no explicit step). Connections use `autocommit=False`, so a failure rolls the whole migration back and leaves the old file untouched.
