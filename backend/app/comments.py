from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app import db
from app.auth import CurrentUser
from app.boards import BoardAccess
from app.models import Comment, CommentText

router = APIRouter(prefix="/api/boards/{board_id}")


class CommentRequest(BaseModel):
    text: CommentText


def require_card(board_id: int, card_id: str):
    board, _ = db.get_board(board_id)
    if card_id not in board.cards:
        raise HTTPException(status_code=404, detail="Card not found")


@router.get("/cards/{card_id}/comments")
def list_comments(board_id: int, card_id: str, _: BoardAccess) -> list[Comment]:
    require_card(board_id, card_id)
    return db.list_comments(board_id, card_id)


@router.post("/cards/{card_id}/comments", status_code=201)
def add_comment(
    board_id: int, card_id: str, request: CommentRequest, user: CurrentUser, _: BoardAccess
) -> Comment:
    require_card(board_id, card_id)
    return db.add_comment(board_id, card_id, user.id, request.text)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(board_id: int, comment_id: int, user: CurrentUser, role: BoardAccess):
    """The author or the board owner can delete a comment."""
    comment = db.get_comment(board_id, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author != user.username and role != "owner":
        raise HTTPException(
            status_code=403, detail="Only the author or the board owner can do that"
        )
    db.delete_comment(comment_id)
    return Response(status_code=204)


@router.get("/comment-counts")
def comment_counts(board_id: int, _: BoardAccess) -> dict[str, int]:
    return db.comment_counts(board_id)
