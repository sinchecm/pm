from fastapi import APIRouter

from app import db
from app.auth import CurrentUser
from app.models import BoardData

router = APIRouter(prefix="/api")


@router.get("/board")
def read_board(username: CurrentUser) -> BoardData:
    return db.get_board(username)


@router.put("/board")
def update_board(board: BoardData, username: CurrentUser) -> BoardData:
    db.save_board(username, board)
    return board
