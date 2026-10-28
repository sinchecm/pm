import hashlib
import os
import secrets
import sqlite3
from contextlib import closing
from pathlib import Path

from app.models import BoardData, BoardSummary, Comment, Member, Role, User

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).parent.parent / "data" / "kanban.db"))
DEFAULT_BOARD = (Path(__file__).parent / "default_board.json").read_text()
EMPTY_BOARD = (Path(__file__).parent / "empty_board.json").read_text()

# The MVP account, kept so the original sign-in still works
DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
STARTER_BOARD_NAME = "My Board"

SCHEMA_VERSION = 3
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS boards_user_id ON boards (user_id);
CREATE TABLE IF NOT EXISTS board_members (
    board_id INTEGER NOT NULL REFERENCES boards(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id, user_id)
);
CREATE INDEX IF NOT EXISTS board_members_user_id ON board_members (user_id);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id),
    card_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS comments_board_card ON comments (board_id, card_id);
"""


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return secrets.compare_digest(candidate.hex(), digest)


# Checked when the username is unknown, so response time doesn't reveal which usernames exist
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def connect():
    # autocommit=False keeps DDL inside the transaction too, so the migration is all-or-nothing
    conn = sqlite3.connect(DB_PATH, autocommit=False)
    conn.row_factory = sqlite3.Row
    return closing(conn)


def _migrate_from_v0(conn):
    """The MVP layout: users without passwords and one board per user."""
    conn.execute("ALTER TABLE users RENAME TO users_v0")
    conn.execute("ALTER TABLE boards RENAME TO boards_v0")
    conn.executescript(SCHEMA)
    for row in conn.execute("SELECT id, username, created_at FROM users_v0").fetchall():
        # Only the demo account had a password; any other account is locked
        password = DEMO_PASSWORD if row["username"] == DEMO_USERNAME else secrets.token_hex(16)
        conn.execute(
            "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (row["id"], row["username"], hash_password(password), row["created_at"]),
        )
    conn.execute(
        """INSERT INTO boards (user_id, name, data, updated_at)
        SELECT user_id, ?, data, updated_at FROM boards_v0""",
        (STARTER_BOARD_NAME,),
    )
    conn.execute("DROP TABLE boards_v0")
    conn.execute("DROP TABLE users_v0")


def _migrate_from_v1(conn):
    """Version 1 had no board version counter; board_members is created by SCHEMA."""
    conn.execute("ALTER TABLE boards ADD COLUMN version INTEGER NOT NULL DEFAULT 1")


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn, conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        has_tables = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        ).fetchone()
        if version == 0 and has_tables:
            _migrate_from_v0(conn)
        elif version == 1:
            _migrate_from_v1(conn)
        conn.executescript(SCHEMA)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    if not get_user_by_username(DEMO_USERNAME):
        create_user(DEMO_USERNAME, DEMO_PASSWORD)


def _to_user(row) -> User | None:
    return User(id=row["id"], username=row["username"]) if row else None


def get_user(user_id: int) -> User | None:
    with connect() as conn:
        row = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
    return _to_user(row)


def get_user_by_username(username: str) -> User | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT id, username FROM users WHERE username = ?", (username,)
        ).fetchone()
    return _to_user(row)


def create_user(username: str, password: str) -> User | None:
    """Creates the user with a starter board; returns None if the username is taken."""
    with connect() as conn, conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hash_password(password)),
            )
        except sqlite3.IntegrityError:
            return None
        conn.execute(
            "INSERT INTO boards (user_id, name, data) VALUES (?, ?, ?)",
            (cursor.lastrowid, STARTER_BOARD_NAME, DEFAULT_BOARD),
        )
    return User(id=cursor.lastrowid, username=username)


def authenticate(username: str, password: str) -> User | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    valid = verify_password(password, row["password_hash"] if row else _DUMMY_HASH)
    return _to_user(row) if valid else None


def check_password(user_id: int, password: str) -> bool:
    with connect() as conn:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    return verify_password(password, row["password_hash"])


def set_password(user_id: int, password: str):
    with connect() as conn, conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id)
        )


def _unassign(conn, board_id: int, username: str):
    """Clears the user's card assignments on the board, as a new board version."""
    board = BoardData.model_validate_json(
        conn.execute("SELECT data FROM boards WHERE id = ?", (board_id,)).fetchone()["data"]
    )
    assigned = [card for card in board.cards.values() if card.assignee == username]
    if not assigned:
        return
    for card in assigned:
        card.assignee = None
    conn.execute(
        """UPDATE boards SET data = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?""",
        (board.model_dump_json(), board_id),
    )


def delete_user(user_id: int):
    with connect() as conn, conn:
        username = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()[0]
        for row in conn.execute(
            "SELECT board_id FROM board_members WHERE user_id = ?", (user_id,)
        ).fetchall():
            _unassign(conn, row["board_id"], username)
        owned = "SELECT id FROM boards WHERE user_id = ?"
        conn.execute(
            f"DELETE FROM comments WHERE user_id = ? OR board_id IN ({owned})",
            (user_id, user_id),
        )
        conn.execute(
            f"DELETE FROM board_members WHERE user_id = ? OR board_id IN ({owned})",
            (user_id, user_id),
        )
        conn.execute("DELETE FROM boards WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# Boards the user owns or is a member of, with the user's role on each
BOARD_SUMMARY_SQL = """
SELECT b.id, b.name, b.created_at, b.updated_at, u.username AS owner,
    CASE WHEN b.user_id = :user_id THEN 'owner' ELSE 'member' END AS role
FROM boards b JOIN users u ON u.id = b.user_id
WHERE (b.user_id = :user_id
    OR b.id IN (SELECT board_id FROM board_members WHERE user_id = :user_id))
"""


def _to_summary(row) -> BoardSummary:
    return BoardSummary(
        id=row["id"],
        name=row["name"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
        owner=row["owner"],
        role=row["role"],
    )


def list_boards(user_id: int) -> list[BoardSummary]:
    """Owned boards first, then shared ones, each in creation order."""
    with connect() as conn:
        rows = conn.execute(
            f"{BOARD_SUMMARY_SQL} ORDER BY b.user_id != :user_id, b.id", {"user_id": user_id}
        )
        return [_to_summary(row) for row in rows]


def get_summary(user_id: int, board_id: int) -> BoardSummary | None:
    with connect() as conn:
        row = conn.execute(
            f"{BOARD_SUMMARY_SQL} AND b.id = :board_id", {"user_id": user_id, "board_id": board_id}
        ).fetchone()
    return _to_summary(row) if row else None


def get_role(user_id: int, board_id: int) -> Role | None:
    summary = get_summary(user_id, board_id)
    return summary.role if summary else None


# Functions below take a board id only: routes check access with get_role first


def create_board(user_id: int, name: str) -> BoardSummary:
    with connect() as conn, conn:
        cursor = conn.execute(
            "INSERT INTO boards (user_id, name, data) VALUES (?, ?, ?)",
            (user_id, name, EMPTY_BOARD),
        )
    return get_summary(user_id, cursor.lastrowid)


def get_board(board_id: int) -> tuple[BoardData, int]:
    """Returns the board and its version."""
    with connect() as conn:
        row = conn.execute("SELECT data, version FROM boards WHERE id = ?", (board_id,)).fetchone()
    return BoardData.model_validate_json(row["data"]), row["version"]


def save_board(board_id: int, board: BoardData, expected_version: int | None = None) -> int | None:
    """Returns the new version, or None if expected_version is given and no longer current."""
    with connect() as conn, conn:
        cursor = conn.execute(
            """UPDATE boards SET data = :data, version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND (:expected IS NULL OR version = :expected)""",
            {"data": board.model_dump_json(), "id": board_id, "expected": expected_version},
        )
        if cursor.rowcount == 0:
            return None
        # Comments belong to cards; drop those of cards no longer on the board
        card_ids = list(board.cards)
        conn.execute(
            f"""DELETE FROM comments WHERE board_id = ?
            AND card_id NOT IN ({", ".join("?" * len(card_ids))})""",
            (board_id, *card_ids),
        )
        return conn.execute("SELECT version FROM boards WHERE id = ?", (board_id,)).fetchone()[0]


def rename_board(board_id: int, name: str):
    with connect() as conn, conn:
        conn.execute(
            "UPDATE boards SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (name, board_id),
        )


def delete_board(board_id: int):
    with connect() as conn, conn:
        conn.execute("DELETE FROM comments WHERE board_id = ?", (board_id,))
        conn.execute("DELETE FROM board_members WHERE board_id = ?", (board_id,))
        conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def list_members(board_id: int) -> list[Member]:
    """The owner first, then members in the order they were added."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT u.username, 'owner' AS role, 0 AS position
            FROM boards b JOIN users u ON u.id = b.user_id WHERE b.id = :board_id
            UNION ALL
            SELECT u.username, 'member', m.rowid
            FROM board_members m JOIN users u ON u.id = m.user_id WHERE m.board_id = :board_id
            ORDER BY position""",
            {"board_id": board_id},
        ).fetchall()
    return [Member(username=row["username"], role=row["role"]) for row in rows]


def add_member(board_id: int, username: str) -> Member | None:
    """Returns None if there is no such user; raises ValueError if they already have access."""
    user = get_user_by_username(username)
    if not user:
        return None
    if get_role(user.id, board_id):
        raise ValueError("already has access")
    with connect() as conn, conn:
        conn.execute(
            "INSERT INTO board_members (board_id, user_id) VALUES (?, ?)", (board_id, user.id)
        )
    return Member(username=user.username, role="member")


def remove_member(board_id: int, username: str) -> bool:
    """Also unassigns the member's cards on the board."""
    with connect() as conn, conn:
        cursor = conn.execute(
            """DELETE FROM board_members WHERE board_id = ?
            AND user_id = (SELECT id FROM users WHERE username = ?)""",
            (board_id, username),
        )
        if cursor.rowcount == 0:
            return False
        _unassign(conn, board_id, username)
    return True


def assignees_are_members(board_id: int, board: BoardData) -> bool:
    usernames = {member.username for member in list_members(board_id)}
    return all(card.assignee in usernames for card in board.cards.values() if card.assignee)


COMMENT_SQL = """
SELECT c.id, c.card_id, c.text, c.created_at, u.username AS author
FROM comments c JOIN users u ON u.id = c.user_id
"""


def _to_comment(row) -> Comment:
    return Comment(
        id=row["id"],
        cardId=row["card_id"],
        author=row["author"],
        text=row["text"],
        createdAt=row["created_at"],
    )


def list_comments(board_id: int, card_id: str) -> list[Comment]:
    with connect() as conn:
        rows = conn.execute(
            f"{COMMENT_SQL} WHERE c.board_id = ? AND c.card_id = ? ORDER BY c.id",
            (board_id, card_id),
        )
        return [_to_comment(row) for row in rows]


def add_comment(board_id: int, card_id: str, user_id: int, text: str) -> Comment:
    with connect() as conn, conn:
        cursor = conn.execute(
            "INSERT INTO comments (board_id, card_id, user_id, text) VALUES (?, ?, ?, ?)",
            (board_id, card_id, user_id, text),
        )
        return _to_comment(
            conn.execute(f"{COMMENT_SQL} WHERE c.id = ?", (cursor.lastrowid,)).fetchone()
        )


def get_comment(board_id: int, comment_id: int) -> Comment | None:
    with connect() as conn:
        row = conn.execute(
            f"{COMMENT_SQL} WHERE c.id = ? AND c.board_id = ?", (comment_id, board_id)
        ).fetchone()
    return _to_comment(row) if row else None


def delete_comment(comment_id: int):
    with connect() as conn, conn:
        conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))


def comment_counts(board_id: int) -> dict[str, int]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT card_id, COUNT(*) AS n FROM comments WHERE board_id = ? GROUP BY card_id",
            (board_id,),
        )
        return {row["card_id"]: row["n"] for row in rows}
