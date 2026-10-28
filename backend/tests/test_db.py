import json
import sqlite3
from contextlib import closing

from conftest import DEFAULT, login, query
from fastapi.testclient import TestClient

from app import db
from app.main import app

# The MVP (version 0) layout, exactly as shipped before accounts and multiple boards
V0_SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""

# A v0 board: cards without priority or due date, renamed column
V0_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Ideas", "cardIds": ["card-1"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": []},
        {"id": "col-progress", "title": "In Progress", "cardIds": []},
        {"id": "col-review", "title": "Review", "cardIds": []},
        {"id": "col-done", "title": "Done", "cardIds": []},
    ],
    "cards": {"card-1": {"id": "card-1", "title": "Keep me", "details": "Precious"}},
}


# Version 1: accounts and many boards, before sharing and board versions
V1_SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX boards_user_id ON boards (user_id);
PRAGMA user_version = 1;
"""


def make_v0_db(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.executescript(V0_SCHEMA)
        conn.execute("INSERT INTO users (username) VALUES ('user'), ('other')")
        conn.execute(
            "INSERT INTO boards (user_id, data, updated_at) VALUES (1, ?, '2026-10-01 12:00:00')",
            (json.dumps(V0_BOARD),),
        )


def table_sql(path, name):
    return query(path, "SELECT sql FROM sqlite_master WHERE name = ?", (name,))[0][0]


def user_version(path):
    return query(path, "PRAGMA user_version")[0][0]


def test_fresh_db_has_current_schema(client, temp_db):
    assert user_version(temp_db) == db.SCHEMA_VERSION
    assert "password_hash" in table_sql(temp_db, "users")


def test_demo_user_is_seeded_once(client):
    db.init_db()
    db.init_db()
    assert db.authenticate("user", "password").username == "user"
    assert len(db.list_boards(db.get_user_by_username("user").id)) == 1


def test_migrates_v0_database_keeping_data(temp_db):
    make_v0_db(temp_db)

    with TestClient(app) as client:
        login(client)
        boards = client.get("/api/boards").json()
        assert len(boards) == 1
        assert boards[0]["name"] == "My Board"
        assert boards[0]["updatedAt"] == "2026-10-01 12:00:00"
        board = client.get(f"/api/boards/{boards[0]['id']}").json()

    assert board["columns"] == V0_BOARD["columns"]
    assert board["cards"]["card-1"] == {
        "id": "card-1",
        "title": "Keep me",
        "details": "Precious",
        "priority": None,
        "dueDate": None,
        "labels": [],
        "checklist": [],
        "assignee": None,
    }
    assert user_version(temp_db) == db.SCHEMA_VERSION
    assert "UNIQUE" not in table_sql(temp_db, "boards")
    tables = {row[0] for row in query(temp_db, "SELECT name FROM sqlite_master WHERE type='table'")}
    assert tables == {"users", "boards", "board_members", "comments"}


def test_migration_locks_accounts_without_known_password(temp_db):
    make_v0_db(temp_db)
    db.init_db()
    other = db.get_user_by_username("other")
    assert other is not None
    assert db.authenticate("other", "password") is None
    assert db.list_boards(other.id) == []


def test_migration_runs_only_once(temp_db):
    make_v0_db(temp_db)
    db.init_db()
    user = db.get_user_by_username("user")
    db.create_board(user.id, "Second")
    db.init_db()
    assert [b.name for b in db.list_boards(user.id)] == ["My Board", "Second"]


def test_failed_migration_leaves_v0_database_untouched(temp_db, monkeypatch):
    make_v0_db(temp_db)

    def broken_hash(password):
        raise RuntimeError("boom")

    monkeypatch.setattr(db, "hash_password", broken_hash)
    try:
        db.init_db()
    except RuntimeError:
        pass
    assert user_version(temp_db) == 0
    assert "password_hash" not in table_sql(temp_db, "users")
    assert json.loads(query(temp_db, "SELECT data FROM boards")[0][0]) == V0_BOARD


def test_new_user_gets_default_starter_board(client):
    user = db.create_user("alice", "secret-pass")
    [board] = db.list_boards(user.id)
    data, version = db.get_board(board.id)
    assert data.model_dump(mode="json") == DEFAULT
    assert version == 1


def test_create_user_rejects_duplicate(client):
    assert db.create_user("user", "whatever1") is None


def test_password_hash_round_trip():
    stored = db.hash_password("correct horse")
    assert db.verify_password("correct horse", stored)
    assert not db.verify_password("wrong horse", stored)
    assert db.hash_password("correct horse") != stored


def test_migrates_v1_database_keeping_data(temp_db):
    temp_db.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(temp_db)) as conn, conn:
        conn.executescript(V1_SCHEMA)
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("alice", db.hash_password("secret-pass")),
        )
        conn.execute(
            "INSERT INTO boards (user_id, name, data) VALUES (1, 'Roadmap', ?)",
            (json.dumps(V0_BOARD),),
        )

    with TestClient(app) as client:
        login(client, "alice", "secret-pass")
        [board] = client.get("/api/boards").json()
        assert board["name"] == "Roadmap"
        response = client.get(f"/api/boards/{board['id']}")
        assert response.headers["etag"] == '"1"'
        assert response.json()["columns"] == V0_BOARD["columns"]
        assert client.get(f"/api/boards/{board['id']}/members").status_code == 200

    assert user_version(temp_db) == db.SCHEMA_VERSION


def test_migrates_v2_database_by_adding_comments(temp_db):
    # Build a current database, then turn it back into version 2 (no comments table)
    db.init_db()
    query(temp_db, "DROP TABLE comments")
    query(temp_db, "PRAGMA user_version = 2")

    with TestClient(app) as client:
        login(client)
        board_id = client.get("/api/boards").json()[0]["id"]
        response = client.post(f"/api/boards/{board_id}/cards/card-1/comments", json={"text": "Hi"})
        assert response.status_code == 201
    assert user_version(temp_db) == db.SCHEMA_VERSION
