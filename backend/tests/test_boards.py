import copy

from conftest import DEFAULT, EMPTY, login, query
from fastapi.testclient import TestClient

from app.main import app


def modified_board():
    board = copy.deepcopy(DEFAULT)
    board["columns"][0]["title"] = "Ideas"
    board["cards"]["card-9"] = {
        "id": "card-9",
        "title": "New",
        "details": "Added",
        "priority": "high",
        "dueDate": "2026-12-01",
        "labels": ["urgent"],
        "checklist": [{"id": "item-9", "text": "Do it", "done": False}],
        "assignee": "user",
    }
    board["columns"][4]["cardIds"].append("card-9")
    board["columns"][0]["cardIds"].remove("card-1")
    board["columns"][1]["cardIds"].insert(0, "card-1")
    return board


def test_creates_db_when_missing(client, temp_db):
    assert temp_db.exists()


def test_lists_starter_board(auth_client):
    boards = auth_client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"
    assert boards[0]["owner"] == "user"
    assert boards[0]["role"] == "owner"
    assert set(boards[0]) == {"id", "name", "createdAt", "updatedAt", "owner", "role"}


def test_get_returns_seeded_default_board(auth_client, board_id):
    response = auth_client.get(f"/api/boards/{board_id}")
    assert response.status_code == 200
    assert response.json() == DEFAULT


def test_put_then_get_round_trips(auth_client, board_id):
    board = modified_board()
    response = auth_client.put(f"/api/boards/{board_id}", json=board)
    assert response.status_code == 200
    assert response.json() == board
    assert auth_client.get(f"/api/boards/{board_id}").json() == board


def test_create_board_starts_empty(auth_client):
    response = auth_client.post("/api/boards", json={"name": "  Launch plan  "})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Launch plan"
    assert auth_client.get(f"/api/boards/{created['id']}").json() == EMPTY
    assert [b["name"] for b in auth_client.get("/api/boards").json()] == ["My Board", "Launch plan"]


def test_create_board_validates_name(auth_client):
    assert auth_client.post("/api/boards", json={"name": "   "}).status_code == 422
    assert auth_client.post("/api/boards", json={"name": "x" * 81}).status_code == 422


def test_boards_are_independent(auth_client, board_id):
    second = auth_client.post("/api/boards", json={"name": "Second"}).json()["id"]
    auth_client.put(f"/api/boards/{board_id}", json=modified_board())
    assert auth_client.get(f"/api/boards/{second}").json() == EMPTY


def test_rename_board(auth_client, board_id):
    response = auth_client.patch(f"/api/boards/{board_id}", json={"name": "Roadmap"})
    assert response.status_code == 200
    assert response.json()["name"] == "Roadmap"
    assert auth_client.get("/api/boards").json()[0]["name"] == "Roadmap"


def test_delete_board(auth_client, board_id):
    assert auth_client.delete(f"/api/boards/{board_id}").status_code == 204
    assert auth_client.get("/api/boards").json() == []
    assert auth_client.get(f"/api/boards/{board_id}").status_code == 404


def test_missing_board_returns_404(auth_client):
    assert auth_client.get("/api/boards/999").status_code == 404
    assert auth_client.put("/api/boards/999", json=DEFAULT).status_code == 404
    assert auth_client.patch("/api/boards/999", json={"name": "X"}).status_code == 404
    assert auth_client.delete("/api/boards/999").status_code == 404


def test_cannot_access_another_users_board(auth_client, board_id, other_client):
    assert other_client.get(f"/api/boards/{board_id}").status_code == 404
    assert other_client.put(f"/api/boards/{board_id}", json=EMPTY).status_code == 404
    assert other_client.patch(f"/api/boards/{board_id}", json={"name": "Mine"}).status_code == 404
    assert other_client.delete(f"/api/boards/{board_id}").status_code == 404
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT
    assert board_id not in [b["id"] for b in other_client.get("/api/boards").json()]


def test_routes_require_session(client):
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"name": "X"}).status_code == 401
    assert client.get("/api/boards/1").status_code == 401
    assert client.put("/api/boards/1", json=DEFAULT).status_code == 401
    assert client.patch("/api/boards/1", json={"name": "X"}).status_code == 401
    assert client.delete("/api/boards/1").status_code == 401


def test_rejects_malformed_payload(auth_client, board_id):
    assert auth_client.put(f"/api/boards/{board_id}", json={"columns": "nope"}).status_code == 422


def test_accepts_added_and_removed_columns(auth_client, board_id):
    board = copy.deepcopy(EMPTY)
    board["columns"] = board["columns"][:2]
    board["columns"].append({"id": "col-new", "title": "Blocked", "cardIds": []})
    response = auth_client.put(f"/api/boards/{board_id}", json=board)
    assert response.status_code == 200
    assert auth_client.get(f"/api/boards/{board_id}").json() == board


def test_rejects_board_without_columns(auth_client, board_id):
    response = auth_client.put(f"/api/boards/{board_id}", json={"columns": [], "cards": {}})
    assert response.status_code == 422


def test_rejects_duplicate_column_ids(auth_client, board_id):
    board = copy.deepcopy(EMPTY)
    board["columns"].append({"id": "col-backlog", "title": "Again", "cardIds": []})
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_unknown_card_in_column(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["columns"][0]["cardIds"].append("card-missing")
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_card_not_in_any_column(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-9"] = {"id": "card-9", "title": "Orphan", "details": ""}
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_duplicate_card_placement(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["columns"][1]["cardIds"].append("card-1")
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_mismatched_card_key(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-1"]["id"] = "card-x"
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_invalid_priority_and_due_date(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-1"]["priority"] = "urgent"
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-1"]["dueDate"] = "next tuesday"
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_rejects_invalid_labels_and_checklist(auth_client, board_id):
    for labels in [[""], ["x" * 31], "not-a-list"]:
        board = copy.deepcopy(DEFAULT)
        board["cards"]["card-1"]["labels"] = labels
        assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-1"]["checklist"] = [{"id": "item-x", "text": "No done flag"}]
    assert auth_client.put(f"/api/boards/{board_id}", json=board).status_code == 422


def test_labels_are_trimmed(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-1"]["labels"] = ["  spaced  "]
    response = auth_client.put(f"/api/boards/{board_id}", json=board)
    assert response.json()["cards"]["card-1"]["labels"] == ["spaced"]


def test_card_fields_are_optional(auth_client, board_id):
    board = copy.deepcopy(DEFAULT)
    board["cards"]["card-1"] = {"id": "card-1", "title": "Plain", "details": ""}
    response = auth_client.put(f"/api/boards/{board_id}", json=board)
    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["priority"] is None
    assert response.json()["cards"]["card-1"]["dueDate"] is None
    assert response.json()["cards"]["card-1"]["labels"] == []
    assert response.json()["cards"]["card-1"]["checklist"] == []


def test_rejected_update_keeps_stored_board(auth_client, board_id):
    auth_client.put(f"/api/boards/{board_id}", json={"columns": "nope"})
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_save_updates_timestamp(auth_client, board_id, temp_db):
    query(temp_db, "UPDATE boards SET updated_at = '2000-01-01 00:00:00'")
    auth_client.put(f"/api/boards/{board_id}", json=modified_board())
    assert auth_client.get("/api/boards").json()[0]["updatedAt"] != "2000-01-01 00:00:00"


def test_persists_across_app_restarts(auth_client, board_id):
    board = modified_board()
    auth_client.put(f"/api/boards/{board_id}", json=board)

    with TestClient(app) as restarted:
        login(restarted)
        assert restarted.get(f"/api/boards/{board_id}").json() == board
