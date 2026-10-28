import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from pydantic import BaseModel, ValidationError
from starlette.middleware.sessions import SessionMiddleware

from app import ai, db
from app.models import BoardData

STATIC_DIR = Path(__file__).parent.parent / "static"

# MVP: single hardcoded user
USERNAME = "user"
PASSWORD = "password"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
# Random key per process: sessions end when the server restarts
app.add_middleware(SessionMiddleware, secret_key=secrets.token_hex(32))


class Credentials(BaseModel):
    username: str
    password: str


class ChatRequest(BaseModel):
    message: str
    history: list[ai.Message] = []


class ChatResponse(BaseModel):
    reply: str
    board: BoardData | None


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/login")
def login(credentials: Credentials, request: Request):
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["username"] = credentials.username
    return {"username": credentials.username}


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/me")
def me(username: str = Depends(current_user)):
    return {"username": username}


@app.get("/api/board")
def read_board(username: str = Depends(current_user)) -> BoardData:
    return db.get_board(username)


@app.put("/api/board")
def update_board(board: BoardData, username: str = Depends(current_user)) -> BoardData:
    db.save_board(username, board)
    return board


@app.post("/api/chat")
def chat(request: ChatRequest, username: str = Depends(current_user)) -> ChatResponse:
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


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
