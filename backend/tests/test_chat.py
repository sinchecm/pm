import json
import os
from typing import ClassVar

import openai
import pydantic
import pytest

from app import ai, db
from app.models import BoardData

DEFAULT = json.loads(db.DEFAULT_BOARD)


def default_ai_board() -> ai.AIBoard:
    return ai.to_ai_board(BoardData.model_validate(DEFAULT))


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
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 401


def test_reply_only_leaves_board_unchanged(auth_client, fake_ai):
    response = auth_client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 200
    assert response.json() == {"reply": "Hello", "board": None}
    assert auth_client.get("/api/board").json() == DEFAULT


def test_sends_board_history_and_message(auth_client, fake_ai):
    history = [
        {"role": "user", "content": "Earlier question"},
        {"role": "assistant", "content": "Earlier answer"},
    ]
    auth_client.post("/api/chat", json={"message": "What is next?", "history": history})

    system, *rest = fake_ai.messages
    assert system["role"] == "system"
    assert default_ai_board().model_dump_json() in system["content"]
    assert rest == [*history, {"role": "user", "content": "What is next?"}]


def test_board_update_is_saved_and_returned(auth_client, fake_ai):
    board = default_ai_board()
    card = board.columns[0].cards.pop(0)
    board.columns[2].cards.append(card)
    board.columns[3].cards.append(ai.AICard(id="card-ai-new", title="New", details="From AI"))
    fake_ai.response = ai.AIResponse(reply="Done", board=board)

    response = auth_client.post("/api/chat", json={"message": "Update the board"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Done"
    assert body["board"]["columns"][2]["cardIds"][-1] == "card-1"
    assert body["board"]["columns"][3]["cardIds"][-1] == "card-ai-new"
    assert body["board"]["cards"]["card-ai-new"]["title"] == "New"
    assert auth_client.get("/api/board").json() == body["board"]


def test_invalid_board_is_rejected_and_not_saved(auth_client, fake_ai):
    board = default_ai_board()
    board.columns.pop()
    fake_ai.response = ai.AIResponse(reply="Removed Done", board=board)

    response = auth_client.post("/api/chat", json={"message": "Delete the Done column"})
    assert response.status_code == 502
    assert auth_client.get("/api/board").json() == DEFAULT


def test_duplicate_card_from_ai_is_rejected(auth_client, fake_ai):
    board = default_ai_board()
    board.columns[1].cards.append(board.columns[0].cards[0])
    fake_ai.response = ai.AIResponse(reply="Copied", board=board)

    assert auth_client.post("/api/chat", json={"message": "Copy"}).status_code == 502
    assert auth_client.get("/api/board").json() == DEFAULT


@pytest.mark.parametrize(
    "error",
    [
        openai.OpenAIError("Request timed out"),
        pydantic.ValidationError.from_exception_data("AIResponse", []),
    ],
)
def test_ai_failure_returns_502(auth_client, monkeypatch, error):
    def complete(messages):
        raise error

    monkeypatch.setattr(ai, "complete", complete)
    response = auth_client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 502
    assert auth_client.get("/api/board").json() == DEFAULT


def test_ai_refusal_returns_502(auth_client, monkeypatch):
    monkeypatch.setattr(ai, "complete", lambda messages: None)
    assert auth_client.post("/api/chat", json={"message": "hi"}).status_code == 502


def test_board_conversion_round_trips():
    board = BoardData.model_validate(DEFAULT)
    assert ai.from_ai_board(ai.to_ai_board(board)) == board


requires_key = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set"
)


@requires_key
def test_real_ai_adds_card(auth_client):
    response = auth_client.post(
        "/api/chat",
        json={"message": "Add a card titled 'Plan launch party' to the Backlog column."},
    )
    assert response.status_code == 200
    board = auth_client.get("/api/board").json()
    backlog = board["columns"][0]["cardIds"]
    assert any(board["cards"][card_id]["title"] == "Plan launch party" for card_id in backlog)


@requires_key
def test_real_ai_answers_question_without_changing_board(auth_client):
    response = auth_client.post("/api/chat", json={"message": "How many cards are in Done?"})
    assert response.status_code == 200
    assert response.json()["board"] is None
    assert "2" in response.json()["reply"]
    assert auth_client.get("/api/board").json() == DEFAULT
