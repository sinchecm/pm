import copy

import pytest
from conftest import DEFAULT, EMPTY, login
from fastapi.testclient import TestClient

from app import ai
from app.main import app


def share(owner, board_id, username="other"):
    return owner.post(f"/api/boards/{board_id}/members", json={"username": username})


@pytest.fixture
def shared(auth_client, board_id, other_client):
    """The demo user's board, shared with "other"."""
    share(auth_client, board_id)
    return board_id


def test_owner_lists_members(auth_client, shared):
    assert auth_client.get(f"/api/boards/{shared}/members").json() == [
        {"username": "user", "role": "owner"},
        {"username": "other", "role": "member"},
    ]


def test_add_member_returns_member(auth_client, board_id, other_client):
    response = share(auth_client, board_id)
    assert response.status_code == 201
    assert response.json() == {"username": "other", "role": "member"}


def test_add_unknown_user_returns_404(auth_client, board_id):
    assert share(auth_client, board_id, "nobody").status_code == 404


def test_add_existing_member_or_owner_returns_409(auth_client, shared):
    assert share(auth_client, shared).status_code == 409
    assert share(auth_client, shared, "user").status_code == 409


def test_shared_board_appears_in_member_list(other_client, shared):
    boards = other_client.get("/api/boards").json()
    assert [(b["name"], b["owner"], b["role"]) for b in boards] == [
        ("My Board", "other", "owner"),
        ("My Board", "user", "member"),
    ]


def test_member_can_read_edit_and_see_members(other_client, auth_client, shared):
    assert other_client.get(f"/api/boards/{shared}").json() == DEFAULT
    board = copy.deepcopy(DEFAULT)
    board["columns"][0]["title"] = "Edited by member"
    assert other_client.put(f"/api/boards/{shared}", json=board).status_code == 200
    assert auth_client.get(f"/api/boards/{shared}").json() == board
    assert other_client.get(f"/api/boards/{shared}/members").status_code == 200


def test_member_cannot_manage_board(other_client, shared):
    assert other_client.patch(f"/api/boards/{shared}", json={"name": "Mine"}).status_code == 403
    assert other_client.delete(f"/api/boards/{shared}").status_code == 403
    assert share(other_client, shared, "user").status_code == 403
    assert other_client.delete(f"/api/boards/{shared}/members/user").status_code == 403


def test_member_can_leave(other_client, shared):
    assert other_client.delete(f"/api/boards/{shared}/members/other").status_code == 204
    assert other_client.get(f"/api/boards/{shared}").status_code == 404
    assert len(other_client.get("/api/boards").json()) == 1


def test_owner_removes_member(auth_client, other_client, shared):
    assert auth_client.delete(f"/api/boards/{shared}/members/other").status_code == 204
    assert other_client.get(f"/api/boards/{shared}").status_code == 404
    assert auth_client.delete(f"/api/boards/{shared}/members/other").status_code == 404


def test_owner_cannot_remove_themselves(auth_client, shared):
    assert auth_client.delete(f"/api/boards/{shared}/members/user").status_code == 404
    assert auth_client.get(f"/api/boards/{shared}").status_code == 200


def test_rename_is_visible_to_members(auth_client, other_client, shared):
    response = auth_client.patch(f"/api/boards/{shared}", json={"name": "Team board"})
    assert response.json()["role"] == "owner"
    assert other_client.get("/api/boards").json()[1]["name"] == "Team board"


def test_deleting_board_removes_access(auth_client, other_client, shared):
    auth_client.delete(f"/api/boards/{shared}")
    assert other_client.get(f"/api/boards/{shared}").status_code == 404
    assert len(other_client.get("/api/boards").json()) == 1


def test_deleting_owner_account_removes_shared_boards(client, other_client):
    login(client, "other", "password2")
    with TestClient(app) as third:
        third.post("/api/register", json={"username": "third", "password": "password3"})
        other_board = other_client.get("/api/boards").json()[0]["id"]
        share(other_client, other_board, "third")
        other_client.request("DELETE", "/api/me", json={"password": "password2"})
        assert third.get(f"/api/boards/{other_board}").status_code == 404
        assert len(third.get("/api/boards").json()) == 1


def test_deleting_member_account_removes_membership(auth_client, other_client, shared):
    other_client.request("DELETE", "/api/me", json={"password": "password2"})
    assert auth_client.get(f"/api/boards/{shared}/members").json() == [
        {"username": "user", "role": "owner"}
    ]


def test_outsider_gets_404_on_member_routes(auth_client, board_id, other_client):
    assert other_client.get(f"/api/boards/{board_id}/members").status_code == 404
    assert share(other_client, board_id, "other").status_code == 404
    assert other_client.delete(f"/api/boards/{board_id}/members/other").status_code == 404


def test_member_routes_require_session(client):
    assert client.get("/api/boards/1/members").status_code == 401
    assert share(client, 1).status_code == 401


def test_member_can_chat(other_client, shared, monkeypatch):
    monkeypatch.setattr(ai, "complete", lambda messages: ai.AIResponse(reply="Hi", board=None))
    response = other_client.post(f"/api/boards/{shared}/chat", json={"message": "hi"})
    assert response.status_code == 200


# Optimistic concurrency


def test_get_returns_etag_that_changes_on_save(auth_client, board_id):
    first = auth_client.get(f"/api/boards/{board_id}").headers["etag"]
    put = auth_client.put(f"/api/boards/{board_id}", json=DEFAULT)
    assert put.headers["etag"] != first
    assert auth_client.get(f"/api/boards/{board_id}").headers["etag"] == put.headers["etag"]


def test_put_with_current_etag_succeeds(auth_client, board_id):
    tag = auth_client.get(f"/api/boards/{board_id}").headers["etag"]
    response = auth_client.put(f"/api/boards/{board_id}", json=EMPTY, headers={"If-Match": tag})
    assert response.status_code == 200


def test_put_with_stale_etag_is_rejected(auth_client, other_client, shared):
    stale = auth_client.get(f"/api/boards/{shared}").headers["etag"]
    other_client.put(f"/api/boards/{shared}", json=EMPTY)

    response = auth_client.put(f"/api/boards/{shared}", json=DEFAULT, headers={"If-Match": stale})
    assert response.status_code == 412
    assert auth_client.get(f"/api/boards/{shared}").json() == EMPTY


def test_put_with_malformed_etag_is_rejected(auth_client, board_id):
    response = auth_client.put(
        f"/api/boards/{board_id}", json=DEFAULT, headers={"If-Match": "nonsense"}
    )
    assert response.status_code == 412


def test_chat_returns_new_etag(auth_client, board_id, monkeypatch):
    board = ai.to_ai_board(_default())
    monkeypatch.setattr(ai, "complete", lambda messages: ai.AIResponse(reply="Ok", board=board))
    before = auth_client.get(f"/api/boards/{board_id}").headers["etag"]
    response = auth_client.post(f"/api/boards/{board_id}/chat", json={"message": "x"})
    assert response.headers["etag"] != before
    assert auth_client.get(f"/api/boards/{board_id}").headers["etag"] == response.headers["etag"]


def test_chat_does_not_overwrite_changes_made_meanwhile(
    auth_client, other_client, shared, monkeypatch
):
    def complete(messages):
        # Someone else saves while the AI is thinking
        other_client.put(f"/api/boards/{shared}", json=EMPTY)
        return ai.AIResponse(reply="Done", board=ai.to_ai_board(_default()))

    monkeypatch.setattr(ai, "complete", complete)
    response = auth_client.post(f"/api/boards/{shared}/chat", json={"message": "x"})
    assert response.status_code == 409
    assert auth_client.get(f"/api/boards/{shared}").json() == EMPTY


def _default():
    from app.models import BoardData

    return BoardData.model_validate(DEFAULT)
