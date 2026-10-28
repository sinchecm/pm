import os
from typing import Literal

from openai import OpenAI
from pydantic import BaseModel

from app.models import BoardData

MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are a helpful project management assistant for a Kanban board.
The user's current board is below as JSON. It has five fixed columns; their ids must not change,
but you may rename their titles. Cards can be created, edited, moved between columns, reordered or deleted.

Always reply to the user in "reply". If the user asks you to change the board, return the complete
updated board in "board" (every column and every remaining card, in order). Keep existing card ids;
give new cards a unique id like "card-ai-<short-slug>". If no change is needed, set "board" to null.

Current board:
"""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AICard(BaseModel):
    id: str
    title: str
    details: str


class AIColumn(BaseModel):
    id: str
    title: str
    cards: list[AICard]


class AIBoard(BaseModel):
    columns: list[AIColumn]


class AIResponse(BaseModel):
    reply: str
    board: AIBoard | None


def get_client() -> OpenAI:
    return OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])


def ask(prompt: str) -> str:
    response = get_client().chat.completions.create(
        model=MODEL, messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content


def to_ai_board(board: BoardData) -> AIBoard:
    return AIBoard(
        columns=[
            AIColumn(
                id=column.id,
                title=column.title,
                cards=[AICard(**board.cards[card_id].model_dump()) for card_id in column.cardIds],
            )
            for column in board.columns
        ]
    )


def from_ai_board(ai_board: AIBoard) -> BoardData:
    """Convert to BoardData, raising ValidationError if the board breaks the board rules."""
    return BoardData.model_validate(
        {
            "columns": [
                {
                    "id": column.id,
                    "title": column.title,
                    "cardIds": [card.id for card in column.cards],
                }
                for column in ai_board.columns
            ],
            "cards": {
                card.id: card.model_dump() for column in ai_board.columns for card in column.cards
            },
        }
    )


def build_messages(board: BoardData, history: list[Message], message: str) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT + to_ai_board(board).model_dump_json()},
        *(item.model_dump() for item in history),
        {"role": "user", "content": message},
    ]


def complete(messages: list[dict]) -> AIResponse:
    response = get_client().chat.completions.parse(
        model=MODEL,
        messages=messages,
        response_format=AIResponse,
        # Only route to OpenRouter providers that support structured outputs.
        # DeepInfra claims support but returns free text for this model, so skip it.
        extra_body={"provider": {"require_parameters": True, "ignore": ["DeepInfra"]}},
    )
    return response.choices[0].message.parsed
