import secrets
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

STATIC_DIR = Path(__file__).parent.parent / "static"

# MVP: single hardcoded user
USERNAME = "user"
PASSWORD = "password"

app = FastAPI()
# Random key per process: sessions end when the server restarts
app.add_middleware(SessionMiddleware, secret_key=secrets.token_hex(32))


class Credentials(BaseModel):
    username: str
    password: str


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
def me(request: Request):
    return {"username": current_user(request)}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
