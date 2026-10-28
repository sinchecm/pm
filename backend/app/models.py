from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints, model_validator

Priority = Literal["low", "medium", "high"]
Role = Literal["owner", "member"]
BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]


class ChecklistItem(BaseModel):
    id: str
    text: str
    done: bool


class Card(BaseModel):
    id: str
    title: str
    details: str
    priority: Priority | None = None
    dueDate: date | None = None
    labels: list[Label] = []
    checklist: list[ChecklistItem] = []
    assignee: str | None = None


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_consistency(self):
        column_ids = [column.id for column in self.columns]
        if not column_ids:
            raise ValueError("a board needs at least one column")
        if len(set(column_ids)) != len(column_ids):
            raise ValueError("column ids must be unique")
        placed = sorted(card_id for column in self.columns for card_id in column.cardIds)
        if placed != sorted(self.cards):
            raise ValueError("every card must appear in exactly one column")
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("card keys must match card ids")
        return self


class BoardSummary(BaseModel):
    id: int
    name: str
    createdAt: str
    updatedAt: str
    owner: str
    role: Role


class Member(BaseModel):
    username: str
    role: Role


CommentText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
]


class Comment(BaseModel):
    id: int
    cardId: str
    author: str
    text: str
    createdAt: str


class MyCard(BaseModel):
    boardId: int
    boardName: str
    columnTitle: str
    card: Card


class User(BaseModel):
    id: int
    username: str
