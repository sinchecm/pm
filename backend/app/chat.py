from fastapi import APIRouter, HTTPException
from openai import OpenAIError
from pydantic import BaseModel, ValidationError

from app import ai, db
from app.auth import CurrentUser
from app.models import BoardData

router = APIRouter(prefix="/api")


class ChatRequest(BaseModel):
    message: str
    history: list[ai.Message] = []


class ChatResponse(BaseModel):
    reply: str
    board: BoardData | None


@router.post("/chat")
def chat(request: ChatRequest, username: CurrentUser) -> ChatResponse:
    board = db.get_board(username)
    try:
        result = ai.complete(ai.build_messages(board, request.history, request.message))
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
    db.save_board(username, new_board)
    return ChatResponse(reply=result.reply, board=new_board)
