import os
from typing import ClassVar

import openai
import pydantic
import pytest
from conftest import DEFAULT

from app import ai
from app.models import BoardData


def default_ai_board() -> ai.AIBoard:
    return ai.to_ai_board(BoardData.model_validate(DEFAULT))


def chat_url(board_id):
    return f"/api/boards/{board_id}/chat"


@pytest.fixture
def fake_ai(monkeypatch):
    """Replace the real AI call; set fake_ai.response and inspect fake_ai.messages."""

    class FakeAI:
        response = ai.AIResponse(reply="Hello", board=None)
        messages: ClassVar[list[dict]] = []

    def complete(messages):
        FakeAI.messages = messages
        return FakeAI.response

    monkeypatch.setattr(ai, "complete", complete)
    return FakeAI


def test_chat_requires_session(client, fake_ai):
    assert client.post(chat_url(1), json={"message": "hi"}).status_code == 401


def test_reply_only_leaves_board_unchanged(auth_client, board_id, fake_ai):
    response = auth_client.post(chat_url(board_id), json={"message": "hi"})
    assert response.status_code == 200
    assert response.json() == {"reply": "Hello", "board": None}
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_sends_board_history_and_message(auth_client, board_id, fake_ai):
    history = [
        {"role": "user", "content": "Earlier question"},
        {"role": "assistant", "content": "Earlier answer"},
    ]
    auth_client.post(chat_url(board_id), json={"message": "What is next?", "history": history})

    system, *rest = fake_ai.messages
    assert system["role"] == "system"
    assert default_ai_board().model_dump_json() in system["content"]
    assert rest == [*history, {"role": "user", "content": "What is next?"}]


def test_board_update_is_saved_and_returned(auth_client, board_id, fake_ai):
    board = default_ai_board()
    card = board.columns[0].cards.pop(0)
    board.columns[2].cards.append(card)
    board.columns[3].cards.append(
        ai.AICard(
            id="card-ai-new",
            title="New",
            details="From AI",
            priority="high",
            dueDate="2026-12-24",
            labels=["ai"],
            checklist=[{"id": "item-ai-1", "text": "Check", "done": True}],
            assignee="user",
        )
    )
    fake_ai.response = ai.AIResponse(reply="Done", board=board)

    response = auth_client.post(chat_url(board_id), json={"message": "Update the board"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Done"
    assert body["board"]["columns"][2]["cardIds"][-1] == "card-1"
    assert body["board"]["columns"][3]["cardIds"][-1] == "card-ai-new"
    assert body["board"]["cards"]["card-ai-new"]["title"] == "New"
    assert body["board"]["cards"]["card-ai-new"]["dueDate"] == "2026-12-24"
    assert body["board"]["cards"]["card-ai-new"]["labels"] == ["ai"]
    assert body["board"]["cards"]["card-ai-new"]["assignee"] == "user"
    assert body["board"]["cards"]["card-ai-new"]["checklist"][0]["done"] is True
    assert auth_client.get(f"/api/boards/{board_id}").json() == body["board"]


def test_invalid_board_is_rejected_and_not_saved(auth_client, board_id, fake_ai):
    board = default_ai_board()
    board.columns.clear()
    fake_ai.response = ai.AIResponse(reply="Removed everything", board=board)

    response = auth_client.post(chat_url(board_id), json={"message": "Delete all columns"})
    assert response.status_code == 502
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_duplicate_card_from_ai_is_rejected(auth_client, board_id, fake_ai):
    board = default_ai_board()
    board.columns[1].cards.append(board.columns[0].cards[0])
    fake_ai.response = ai.AIResponse(reply="Copied", board=board)

    assert auth_client.post(chat_url(board_id), json={"message": "Copy"}).status_code == 502
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


@pytest.mark.parametrize(
    "error",
    [
        openai.OpenAIError("Request timed out"),
        pydantic.ValidationError.from_exception_data("AIResponse", []),
    ],
)
def test_ai_failure_returns_502(auth_client, board_id, monkeypatch, error):
    def complete(messages):
        raise error

    monkeypatch.setattr(ai, "complete", complete)
    response = auth_client.post(chat_url(board_id), json={"message": "hi"})
    assert response.status_code == 502
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_ai_refusal_returns_502(auth_client, board_id, monkeypatch):
    monkeypatch.setattr(ai, "complete", lambda messages: None)
    assert auth_client.post(chat_url(board_id), json={"message": "hi"}).status_code == 502


def test_invalid_due_date_from_ai_is_rejected(auth_client, board_id, fake_ai):
    board = default_ai_board()
    board.columns[0].cards[0].dueDate = "soon"
    fake_ai.response = ai.AIResponse(reply="Set", board=board)

    assert auth_client.post(chat_url(board_id), json={"message": "Set"}).status_code == 502
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_ai_can_add_a_column(auth_client, board_id, fake_ai):
    board = default_ai_board()
    board.columns.insert(4, ai.AIColumn(id="col-ai-blocked", title="Blocked", cards=[]))
    fake_ai.response = ai.AIResponse(reply="Added", board=board)

    response = auth_client.post(chat_url(board_id), json={"message": "Add a Blocked column"})
    assert response.status_code == 200
    assert [c["title"] for c in response.json()["board"]["columns"]][4] == "Blocked"


def test_chat_on_missing_board_returns_404(auth_client, fake_ai):
    assert auth_client.post(chat_url(999), json={"message": "hi"}).status_code == 404


def test_chat_on_another_users_board_returns_404(board_id, other_client, fake_ai):
    assert other_client.post(chat_url(board_id), json={"message": "hi"}).status_code == 404


def test_chat_updates_only_the_selected_board(auth_client, board_id, fake_ai):
    second = auth_client.post("/api/boards", json={"name": "Second"}).json()["id"]
    empty = auth_client.get(f"/api/boards/{second}").json()
    board = default_ai_board()
    board.columns[0].cards.clear()
    board.columns[0].cards.append(board.columns[1].cards.pop())
    fake_ai.response = ai.AIResponse(reply="Moved", board=board)

    auth_client.post(chat_url(board_id), json={"message": "Move"})
    assert auth_client.get(f"/api/boards/{second}").json() == empty
    assert auth_client.get(f"/api/boards/{board_id}").json()["columns"][0]["cardIds"] == ["card-3"]


def test_ai_assigning_a_non_member_is_rejected(auth_client, board_id, fake_ai):
    board = default_ai_board()
    board.columns[0].cards[0].assignee = "stranger"
    fake_ai.response = ai.AIResponse(reply="Assigned", board=board)

    assert auth_client.post(chat_url(board_id), json={"message": "Assign"}).status_code == 502
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT


def test_prompt_lists_board_members(auth_client, board_id, other_client, fake_ai):
    auth_client.post(f"/api/boards/{board_id}/members", json={"username": "other"})
    auth_client.post(chat_url(board_id), json={"message": "hi"})
    assert "Board members: user, other." in fake_ai.messages[0]["content"]


def test_prompt_includes_today(fake_ai, auth_client, board_id):
    from datetime import date

    auth_client.post(chat_url(board_id), json={"message": "hi"})
    assert date.today().isoformat() in fake_ai.messages[0]["content"]


def test_board_conversion_round_trips():
    board = BoardData.model_validate(DEFAULT)
    assert ai.from_ai_board(ai.to_ai_board(board)) == board


requires_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set"
)


@requires_key
def test_real_ai_adds_card(auth_client, board_id):
    response = auth_client.post(
        chat_url(board_id),
        json={"message": "Add a card titled 'Plan launch party' to the Backlog column."},
    )
    assert response.status_code == 200
    board = auth_client.get(f"/api/boards/{board_id}").json()
    backlog = board["columns"][0]["cardIds"]
    assert any(board["cards"][card_id]["title"] == "Plan launch party" for card_id in backlog)


@requires_key
def test_real_ai_answers_question_without_changing_board(auth_client, board_id):
    response = auth_client.post(chat_url(board_id), json={"message": "How many cards are in Done?"})
    assert response.status_code == 200
    assert response.json()["board"] is None
    assert "2" in response.json()["reply"]
    assert auth_client.get(f"/api/boards/{board_id}").json() == DEFAULT
