import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    path = tmp_path / "data" / "test.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    return path


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth_client(client):
    client.post("/api/login", json={"username": "user", "password": "password"})
    return client
