import copy
import json

from fastapi.testclient import TestClient

from app import db
from app.main import app

DEFAULT = json.loads(db.DEFAULT_BOARD)


def modified_board():
    board = copy.deepcopy(DEFAULT)
    board["columns"][0]["title"] = "Ideas"
    board["cards"]["card-9"] = {"id": "card-9", "title": "New", "details": "Added"}
    board["columns"][4]["cardIds"].append("card-9")
    board["columns"][0]["cardIds"].remove("card-1")
    board["columns"][1]["cardIds"].insert(0, "card-1")
    return board


def test_creates_db_when_missing(client, temp_db):
    assert temp_db.exists()


def test_get_returns_seeded_default_board(auth_client):
    response = auth_client.get("/api/board")
    assert response.status_code == 200
    assert response.json() == DEFAULT


def test_put_then_get_round_trips(auth_client):
    board = modified_board()
    response = auth_client.put("/api/board", json=board)
    assert response.status_code == 200
    assert response.json() == board
    assert auth_client.get("/api/board").json() == board


def test_get_requires_session(client):
    assert client.get("/api/board").status_code == 401


def test_put_requires_session(client):
    assert client.put("/api/board", json=DEFAULT).status_code == 401


def test_rejects_malformed_payload(auth_client):
    assert auth_client.put("/api/board", json={"columns": "nope"}).status_code == 422


def test_rejects_changed_columns(auth_client):
    board = copy.deepcopy(DEFAULT)
    board["columns"].append({"id": "col-extra", "title": "Extra", "cardIds": []})
    assert auth_client.put("/api/board", json=board).status_code == 422


def test_rejects_unknown_card_in_column(auth_client):
    board = copy.deepcopy(DEFAULT)
    board["columns"][0]["cardIds"].append("card-missing")
    assert auth_client.put("/api/board", json=board).status_code == 422


def test_rejects_card_not_in_any_column(auth_client):
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-9"] = {"id": "card-9", "title": "Orphan", "details": ""}
    assert auth_client.put("/api/board", json=board).status_code == 422


def test_rejects_duplicate_card_placement(auth_client):
    board = copy.deepcopy(DEFAULT)
    board["columns"][1]["cardIds"].append("card-1")
    assert auth_client.put("/api/board", json=board).status_code == 422


def test_rejected_update_keeps_stored_board(auth_client):
    auth_client.put("/api/board", json={"columns": "nope"})
    assert auth_client.get("/api/board").json() == DEFAULT


def test_persists_across_app_restarts(auth_client):
    board = modified_board()
    auth_client.put("/api/board", json=board)

    with TestClient(app) as restarted:
        restarted.post("/api/login", json={"username": "user", "password": "password"})
        assert restarted.get("/api/board").json() == board


def test_boards_are_per_user():
    db.init_db()
    db.save_board("user", db.BoardData.model_validate(modified_board()))
    assert db.get_board("other").model_dump() == DEFAULT
