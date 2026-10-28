import json
import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app

DEFAULT = json.loads(db.DEFAULT_BOARD)
EMPTY = json.loads(db.EMPTY_BOARD)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "data" / "test.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    return path


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


@pytest.fixture
def auth_client(client):
    """Signed in as the demo user."""
    login(client)
    return client


@pytest.fixture
def board_id(auth_client):
    """The demo user's starter board."""
    return auth_client.get("/api/boards").json()[0]["id"]


@pytest.fixture
def other_client(client):
    """A second, newly registered user with their own session."""
    with TestClient(app) as other:
        other.post("/api/register", json={"username": "other", "password": "password2"})
        yield other


def query(path, sql, params=()):
    """Runs one statement directly against a db file and commits; returns all rows."""
    with closing(sqlite3.connect(path)) as conn, conn:
        return conn.execute(sql, params).fetchall()
