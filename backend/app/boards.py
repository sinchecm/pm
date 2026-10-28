from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel

from app import db
from app.auth import CurrentUser
from app.models import BoardData, BoardName, BoardSummary, Member, Role

router = APIRouter(prefix="/api/boards")


class BoardNameRequest(BaseModel):
    name: BoardName


class MemberRequest(BaseModel):
    username: str


def not_found():
    return HTTPException(status_code=404, detail="Board not found")


def board_role(board_id: int, user: CurrentUser) -> Role:
    """The user's role on the board; 404 if they can't see it."""
    role = db.get_role(user.id, board_id)
    if not role:
        raise not_found()
    return role


def owner_role(role: Annotated[Role, Depends(board_role)]) -> Role:
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the board owner can do that")
    return role


BoardAccess = Annotated[Role, Depends(board_role)]
OwnerAccess = Annotated[Role, Depends(owner_role)]


def etag(version: int) -> str:
    return f'"{version}"'


def parse_etag(value: str) -> int | None:
    try:
        return int(value.strip('"'))
    except ValueError:
        return None


@router.get("")
def list_boards(user: CurrentUser) -> list[BoardSummary]:
    return db.list_boards(user.id)


@router.post("", status_code=201)
def create_board(request: BoardNameRequest, user: CurrentUser) -> BoardSummary:
    return db.create_board(user.id, request.name)


@router.get("/{board_id}")
def read_board(board_id: int, _: BoardAccess, response: Response) -> BoardData:
    board, version = db.get_board(board_id)
    response.headers["ETag"] = etag(version)
    return board


@router.put("/{board_id}")
def update_board(
    board_id: int,
    board: BoardData,
    _: BoardAccess,
    response: Response,
    if_match: Annotated[str | None, Header()] = None,
) -> BoardData:
    """With If-Match, saves only if the board is still at that version (412 otherwise)."""
    if not db.assignees_are_members(board_id, board):
        raise HTTPException(status_code=422, detail="Cards can only be assigned to board members")
    expected = parse_etag(if_match) if if_match else None
    if if_match and expected is None:
        raise HTTPException(status_code=412, detail="Invalid If-Match header")
    version = db.save_board(board_id, board, expected)
    if version is None:
        raise HTTPException(status_code=412, detail="The board was changed by someone else")
    response.headers["ETag"] = etag(version)
    return board


@router.patch("/{board_id}")
def rename_board(
    board_id: int, request: BoardNameRequest, user: CurrentUser, _: OwnerAccess
) -> BoardSummary:
    db.rename_board(board_id, request.name)
    return db.get_summary(user.id, board_id)


@router.delete("/{board_id}", status_code=204)
def delete_board(board_id: int, _: OwnerAccess):
    db.delete_board(board_id)
    return Response(status_code=204)


@router.get("/{board_id}/members")
def list_members(board_id: int, _: BoardAccess) -> list[Member]:
    return db.list_members(board_id)


@router.post("/{board_id}/members", status_code=201)
def add_member(board_id: int, request: MemberRequest, _: OwnerAccess) -> Member:
    try:
        member = db.add_member(board_id, request.username)
    except ValueError:
        raise HTTPException(status_code=409, detail="That user already has access")
    if not member:
        raise HTTPException(status_code=404, detail="No user with that username")
    return member


@router.delete("/{board_id}/members/{username}", status_code=204)
def remove_member(board_id: int, username: str, user: CurrentUser, role: BoardAccess):
    """Owners remove members; members can only remove themselves (leave the board)."""
    if role != "owner" and username != user.username:
        raise HTTPException(status_code=403, detail="Only the board owner can do that")
    if not db.remove_member(board_id, username):
        raise HTTPException(status_code=404, detail="Not a member of this board")
    return Response(status_code=204)
