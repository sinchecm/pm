from pydantic import BaseModel, model_validator

COLUMN_IDS = ["col-backlog", "col-discovery", "col-progress", "col-review", "col-done"]


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_consistency(self):
        if [column.id for column in self.columns] != COLUMN_IDS:
            raise ValueError(f"columns must be {COLUMN_IDS} in order")
        placed = sorted(card_id for column in self.columns for card_id in column.cardIds)
        if placed != sorted(self.cards):
            raise ValueError("every card must appear in exactly one column")
        if any(key != card.id for key, card in self.cards.items()):
            raise ValueError("card keys must match card ids")
        return self
