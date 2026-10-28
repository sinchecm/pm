import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app import auth, boards, chat, comments, db, my_cards

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
# Random key per process: sessions end when the server restarts
app.add_middleware(SessionMiddleware, secret_key=secrets.token_hex(32))

app.include_router(auth.router)
app.include_router(boards.router)
app.include_router(chat.router)
app.include_router(my_cards.router)
app.include_router(comments.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Mounted last so /api routes take precedence
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
