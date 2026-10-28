from fastapi import APIRouter, HTTPException, Response
from openai import OpenAIError
from pydantic import BaseModel, ValidationError

from app import ai, db
from app.boards import BoardAccess, etag
from app.models import BoardData

router = APIRouter(prefix="/api")


class ChatRequest(BaseModel):
    message: str
    history: list[ai.Message] = []


class ChatResponse(BaseModel):
    reply: str
    board: BoardData | None


@router.post("/boards/{board_id}/chat")
def chat(board_id: int, request: ChatRequest, _: BoardAccess, response: Response) -> ChatResponse:
    board, version = db.get_board(board_id)
    members = [member.username for member in db.list_members(board_id)]
    try:
        result = ai.complete(ai.build_messages(board, members, request.history, request.message))
    except (OpenAIError, ValidationError):
        raise HTTPException(status_code=502, detail="The AI service failed, please try again")
    if result is None:
        raise HTTPException(status_code=502, detail="The AI did not return an answer")
    if result.board is None:
        return ChatResponse(reply=result.reply, board=None)
    try:
        new_board = ai.from_ai_board(result.board)
    except ValidationError:
        raise HTTPException(status_code=502, detail="The AI returned an invalid board")
    if not db.assignees_are_members(board_id, new_board):
        raise HTTPException(status_code=502, detail="The AI assigned a card to a non-member")
    # Only save if nobody changed the board while the AI was working
    new_version = db.save_board(board_id, new_board, version)
    if new_version is None:
        raise HTTPException(
            status_code=409, detail="The board changed while the AI was working, please try again"
        )
    response.headers["ETag"] = etag(new_version)
    return ChatResponse(reply=result.reply, board=new_board)
