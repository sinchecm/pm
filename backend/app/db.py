import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.models import BoardData

DB_PATH = Path(os.environ.get("DB_PATH", Path(__file__).parent.parent / "data" / "kanban.db"))
DEFAULT_BOARD = (Path(__file__).parent / "default_board.json").read_text()

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def connect():
    return closing(sqlite3.connect(DB_PATH))


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def _user_id(conn, username: str) -> int:
    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
    return conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()[0]


def get_board(username: str) -> BoardData:
    with connect() as conn, conn:
        user_id = _user_id(conn, username)
        conn.execute(
            "INSERT OR IGNORE INTO boards (user_id, data) VALUES (?, ?)", (user_id, DEFAULT_BOARD)
        )
        data = conn.execute("SELECT data FROM boards WHERE user_id = ?", (user_id,)).fetchone()[0]
    return BoardData.model_validate_json(data)


def save_board(username: str, board: BoardData):
    with connect() as conn, conn:
        user_id = _user_id(conn, username)
        conn.execute(
            """INSERT INTO boards (user_id, data) VALUES (?, ?)
            ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP""",
            (user_id, board.model_dump_json()),
        )
