import copy

import pytest
from conftest import DEFAULT, query

URL = "/api/boards/{}/cards/{}/comments"


def post(client, board_id, text="Looks good", card_id="card-1"):
    return client.post(URL.format(board_id, card_id), json={"text": text})


@pytest.fixture
def shared(auth_client, board_id, other_client):
    auth_client.post(f"/api/boards/{board_id}/members", json={"username": "other"})
    return board_id


def test_post_and_list_comments(auth_client, board_id):
    response = post(auth_client, board_id, "  First!  ")
    assert response.status_code == 201
    comment = response.json()
    assert comment["author"] == "user"
    assert comment["text"] == "First!"
    assert comment["cardId"] == "card-1"
    post(auth_client, board_id, "Second")
    listed = auth_client.get(URL.format(board_id, "card-1")).json()
    assert [c["text"] for c in listed] == ["First!", "Second"]
    assert set(listed[0]) == {"id", "cardId", "author", "text", "createdAt"}


def test_comments_are_per_card(auth_client, board_id):
    post(auth_client, board_id, card_id="card-1")
    assert auth_client.get(URL.format(board_id, "card-2")).json() == []


def test_author_comes_from_the_session(auth_client, board_id):
    response = auth_client.post(
        URL.format(board_id, "card-1"), json={"text": "Hi", "author": "someone-else"}
    )
    assert response.json()["author"] == "user"


def test_validates_text(auth_client, board_id):
    assert post(auth_client, board_id, "   ").status_code == 422
    assert post(auth_client, board_id, "x" * 2001).status_code == 422


def test_unknown_card_returns_404(auth_client, board_id):
    assert post(auth_client, board_id, card_id="card-missing").status_code == 404
    assert auth_client.get(URL.format(board_id, "card-missing")).status_code == 404


def test_members_can_comment(auth_client, other_client, shared):
    assert post(other_client, shared, "From a member").status_code == 201
    listed = auth_client.get(URL.format(shared, "card-1")).json()
    assert [(c["author"], c["text"]) for c in listed] == [("other", "From a member")]


def test_outsiders_get_404(auth_client, board_id, other_client):
    comment_id = post(auth_client, board_id).json()["id"]
    assert post(other_client, board_id).status_code == 404
    assert other_client.get(URL.format(board_id, "card-1")).status_code == 404
    assert other_client.delete(f"/api/boards/{board_id}/comments/{comment_id}").status_code == 404
    assert other_client.get(f"/api/boards/{board_id}/comment-counts").status_code == 404


def test_routes_require_session(client):
    assert client.get(URL.format(1, "card-1")).status_code == 401
    assert post(client, 1).status_code == 401
    assert client.delete("/api/boards/1/comments/1").status_code == 401


def test_author_deletes_own_comment(other_client, shared):
    comment_id = post(other_client, shared).json()["id"]
    assert other_client.delete(f"/api/boards/{shared}/comments/{comment_id}").status_code == 204
    assert other_client.get(URL.format(shared, "card-1")).json() == []


def test_owner_deletes_any_comment(auth_client, other_client, shared):
    comment_id = post(other_client, shared).json()["id"]
    assert auth_client.delete(f"/api/boards/{shared}/comments/{comment_id}").status_code == 204


def test_member_cannot_delete_others_comments(auth_client, other_client, shared):
    comment_id = post(auth_client, shared).json()["id"]
    response = other_client.delete(f"/api/boards/{shared}/comments/{comment_id}")
    assert response.status_code == 403
    assert len(auth_client.get(URL.format(shared, "card-1")).json()) == 1


def test_delete_missing_or_other_boards_comment_returns_404(auth_client, board_id, other_client):
    assert auth_client.delete(f"/api/boards/{board_id}/comments/999").status_code == 404
    other_board = other_client.get("/api/boards").json()[0]["id"]
    comment_id = post(other_client, other_board).json()["id"]
    # A comment id from another board is not found through this board
    assert auth_client.delete(f"/api/boards/{board_id}/comments/{comment_id}").status_code == 404


def test_comment_counts(auth_client, board_id):
    post(auth_client, board_id, card_id="card-1")
    post(auth_client, board_id, card_id="card-1")
    post(auth_client, board_id, card_id="card-3")
    counts = auth_client.get(f"/api/boards/{board_id}/comment-counts").json()
    assert counts == {"card-1": 2, "card-3": 1}


def test_removing_a_card_deletes_its_comments(auth_client, board_id):
    post(auth_client, board_id, card_id="card-1")
    post(auth_client, board_id, card_id="card-2")
    board = copy.deepcopy(DEFAULT)
    del board["cards"]["card-1"]
    board["columns"][0]["cardIds"].remove("card-1")
    auth_client.put(f"/api/boards/{board_id}", json=board)
    assert auth_client.get(f"/api/boards/{board_id}/comment-counts").json() == {"card-2": 1}


def test_saving_an_empty_board_deletes_all_comments(auth_client, board_id):
    post(auth_client, board_id)
    board = {"columns": [{"id": "c", "title": "Only", "cardIds": []}], "cards": {}}
    auth_client.put(f"/api/boards/{board_id}", json=board)
    assert auth_client.get(f"/api/boards/{board_id}/comment-counts").json() == {}


def test_deleting_board_deletes_comments(auth_client, board_id, temp_db):
    post(auth_client, board_id)
    auth_client.delete(f"/api/boards/{board_id}")
    assert query(temp_db, "SELECT COUNT(*) FROM comments") == [(0,)]


def test_deleting_account_deletes_its_comments(auth_client, other_client, shared, temp_db):
    post(auth_client, shared, "Owner comment")
    post(other_client, shared, "Member comment")
    other_client.request("DELETE", "/api/me", json={"password": "password2"})
    listed = auth_client.get(URL.format(shared, "card-1")).json()
    assert [c["text"] for c in listed] == ["Owner comment"]
