from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

from app import db
from app.models import User

router = APIRouter(prefix="/api")

Username = Annotated[
    str, StringConstraints(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
]
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Username
    password: NewPassword


class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: NewPassword


class PasswordConfirmation(BaseModel):
    password: str


def current_user(request: Request) -> User:
    user_id = request.session.get("user_id")
    user = db.get_user(user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def _require_password(user: User, password: str):
    if not db.check_password(user.id, password):
        raise HTTPException(status_code=403, detail="Password is incorrect")


@router.post("/register", status_code=201)
def register(registration: Registration, request: Request) -> User:
    user = db.create_user(registration.username, registration.password)
    if not user:
        raise HTTPException(status_code=409, detail="That username is taken")
    request.session["user_id"] = user.id
    return user


@router.post("/login")
def login(credentials: Credentials, request: Request) -> User:
    user = db.authenticate(credentials.username, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    request.session["user_id"] = user.id
    return user


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@router.get("/me")
def me(user: CurrentUser) -> User:
    return user


@router.put("/me/password", status_code=204)
def change_password(change: PasswordChange, user: CurrentUser):
    _require_password(user, change.currentPassword)
    db.set_password(user.id, change.newPassword)
    return Response(status_code=204)


@router.delete("/me", status_code=204)
def delete_account(confirmation: PasswordConfirmation, user: CurrentUser, request: Request):
    _require_password(user, confirmation.password)
    db.delete_user(user.id)
    request.session.clear()
    return Response(status_code=204)
