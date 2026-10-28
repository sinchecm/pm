import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

# MVP: single hardcoded user
USERNAME = "user"
PASSWORD = "password"

router = APIRouter(prefix="/api")


class Credentials(BaseModel):
    username: str
    password: str


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


CurrentUser = Annotated[str, Depends(current_user)]


def _matches(value: str, expected: str) -> bool:
    return secrets.compare_digest(value.encode(), expected.encode())


@router.post("/login")
def login(credentials: Credentials, request: Request):
    # Evaluate both comparisons so timing doesn't reveal which one failed
    valid = _matches(credentials.username, USERNAME) & _matches(credentials.password, PASSWORD)
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["username"] = credentials.username
    return {"username": credentials.username}


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}
