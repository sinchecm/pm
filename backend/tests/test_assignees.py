import copy

import pytest
from conftest import DEFAULT
from fastapi.testclient import TestClient

from app.main import app


def assign(board, card_id, username):
    board = copy.deepcopy(board)
    board["cards"][card_id]["assignee"] = username
    return board


def move(board, card_id, column_index):
    board = copy.deepcopy(board)
    for column in board["columns"]:
        if card_id in column["cardIds"]:
            column["cardIds"].remove(card_id)
    board["columns"][column_index]["cardIds"].append(card_id)
    return board


@pytest.fixture
def shared(auth_client, board_id, other_client):
    auth_client.post(f"/api/boards/{board_id}/members", json={"username": "other"})
    return board_id


def test_owner_can_be_assigned(auth_client, board_id):
    response = auth_client.put(f"/api/boards/{board_id}", json=assign(DEFAULT, "card-1", "user"))
    assert response.status_code == 200
    assert response.json()["cards"]["card-1"]["assignee"] == "user"


def test_member_can_be_assigned(auth_client, shared):
    board = assign(DEFAULT, "card-1", "other")
    assert auth_client.put(f"/api/boards/{shared}", json=board).status_code == 200


def test_non_member_cannot_be_assigned(auth_client, board_id, other_client):
    board = assign(DEFAULT, "card-1", "other")
    response = auth_client.put(f"/api/boards/{board_id}", json=board)
    assert response.status_code == 422
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_removing_member_unassigns_their_cards(auth_client, shared):
    board = assign(assign(DEFAULT, "card-1", "other"), "card-2", "user")
    auth_client.put(f"/api/boards/{shared}", json=board)
    before = auth_client.get(f"/api/boards/{shared}").headers["etag"]

    auth_client.delete(f"/api/boards/{shared}/members/other")
    response = auth_client.get(f"/api/boards/{shared}")
    assert response.json()["cards"]["card-1"]["assignee"] is None
    assert response.json()["cards"]["card-2"]["assignee"] == "user"
    assert response.headers["etag"] != before


def test_removing_member_without_cards_keeps_version(auth_client, shared):
    before = auth_client.get(f"/api/boards/{shared}").headers["etag"]
    auth_client.delete(f"/api/boards/{shared}/members/other")
    assert auth_client.get(f"/api/boards/{shared}").headers["etag"] == before


def test_leaving_unassigns_cards(auth_client, other_client, shared):
    auth_client.put(f"/api/boards/{shared}", json=assign(DEFAULT, "card-1", "other"))
    other_client.delete(f"/api/boards/{shared}/members/other")
    assert auth_client.get(f"/api/boards/{shared}").json()["cards"]["card-1"]["assignee"] is None


def test_deleting_account_unassigns_cards_on_shared_boards(auth_client, other_client, shared):
    auth_client.put(f"/api/boards/{shared}", json=assign(DEFAULT, "card-1", "other"))
    other_client.request("DELETE", "/api/me", json={"password": "password2"})
    assert auth_client.get(f"/api/boards/{shared}").json()["cards"]["card-1"]["assignee"] is None


def test_my_cards_requires_session(client):
    assert client.get("/api/me/cards").status_code == 401


def test_my_cards_is_empty_without_assignments(auth_client):
    assert auth_client.get("/api/me/cards").json() == []


def test_my_cards_lists_open_assigned_cards_across_boards(auth_client, other_client, shared):
    # On the shared board: card-1 (due 2026-11-20) and card-5 (due 2026-11-12) for "other",
    # card-2 (no due date) too, card-7 is in Done, card-3 belongs to the owner
    board = DEFAULT
    for card_id in ["card-1", "card-5", "card-2", "card-7"]:
        board = assign(board, card_id, "other")
    board = assign(board, "card-3", "user")
    auth_client.put(f"/api/boards/{shared}", json=board)

    # On their own board: card-4 with an earlier due date
    own = other_client.get("/api/boards").json()[0]["id"]
    own_board = assign(DEFAULT, "card-4", "other")
    own_board["cards"]["card-4"]["dueDate"] = "2026-11-01"
    other_client.put(f"/api/boards/{own}", json=own_board)

    cards = other_client.get("/api/me/cards").json()
    assert [(c["boardId"], c["card"]["id"]) for c in cards] == [
        (own, "card-4"),
        (shared, "card-5"),
        (shared, "card-1"),
        (shared, "card-2"),
    ]
    assert cards[1]["boardName"] == "My Board"
    assert cards[1]["columnTitle"] == "In Progress"
    assert cards[1]["card"]["title"] == "Design card layout"


def test_my_cards_skips_the_last_column(auth_client, board_id):
    board = move(assign(DEFAULT, "card-1", "user"), "card-1", 4)
    auth_client.put(f"/api/boards/{board_id}", json=board)
    assert auth_client.get("/api/me/cards").json() == []


def test_my_cards_on_single_column_board_is_empty(auth_client, board_id):
    board = {"columns": [{"id": "c", "title": "Only", "cardIds": ["card-1"]}], "cards": {}}
    board["cards"]["card-1"] = {**DEFAULT["cards"]["card-1"], "assignee": "user"}
    auth_client.put(f"/api/boards/{board_id}", json=board)
    assert auth_client.get("/api/me/cards").json() == []


def test_other_users_assignments_are_private(auth_client, board_id):
    auth_client.put(f"/api/boards/{board_id}", json=assign(DEFAULT, "card-1", "user"))
    with TestClient(app) as third:
        third.post("/api/register", json={"username": "third", "password": "password3"})
        assert third.get("/api/me/cards").json() == []
