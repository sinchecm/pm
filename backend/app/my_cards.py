from fastapi import APIRouter

from app import db
from app.auth import CurrentUser
from app.models import MyCard

router = APIRouter(prefix="/api/me")


@router.get("/cards")
def my_cards(user: CurrentUser) -> list[MyCard]:
    """Open cards assigned to the user on all their boards, soonest due first (undated last)."""
    found = []
    for summary in db.list_boards(user.id):
        board, _ = db.get_board(summary.id)
        for column in board.columns[:-1]:  # the last column is done
            for card_id in column.cardIds:
                card = board.cards[card_id]
                if card.assignee == user.username:
                    found.append(
                        MyCard(
                            boardId=summary.id,
                            boardName=summary.name,
                            columnTitle=column.title,
                            card=card,
                        )
                    )
    return sorted(found, key=lambda item: (item.card.dueDate is None, item.card.dueDate))
