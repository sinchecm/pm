from conftest import login, query


def register(client, username="alice", password="secret-pass"):
    return client.post("/api/register", json={"username": username, "password": password})


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_demo_user_can_sign_in(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"id": 1, "username": "user"}


def test_login_wrong_password(client):
    assert login(client, password="wrong").status_code == 401
    assert client.get("/api/me").status_code == 401


def test_login_unknown_user(client):
    assert login(client, username="nobody").status_code == 401


def test_login_rejects_missing_fields(client):
    assert client.post("/api/login", json={"username": "user"}).status_code == 422


def test_me_requires_session(client):
    assert client.get("/api/me").status_code == 401


def test_me_returns_signed_in_user(auth_client):
    assert auth_client.get("/api/me").json() == {"id": 1, "username": "user"}


def test_logout_clears_session(auth_client):
    assert auth_client.post("/api/logout").status_code == 200
    assert auth_client.get("/api/me").status_code == 401


def test_register_signs_in_and_creates_starter_board(client):
    response = register(client)
    assert response.status_code == 201
    assert response.json()["username"] == "alice"
    assert client.get("/api/me").json()["username"] == "alice"
    boards = client.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["My Board"]


def test_registered_user_can_sign_in_again(client):
    register(client)
    client.post("/api/logout")
    assert login(client, "alice", "secret-pass").status_code == 200
    assert login(client, "alice", "wrong-pass").status_code == 401


def test_register_rejects_taken_username(client):
    register(client)
    assert register(client).status_code == 409
    assert register(client, username="user").status_code == 409


def test_register_validates_input(client):
    assert register(client, username="ab").status_code == 422
    assert register(client, username="has space").status_code == 422
    assert register(client, password="short").status_code == 422


def test_passwords_are_hashed(client, temp_db):
    register(client)
    [(stored,)] = query(temp_db, "SELECT password_hash FROM users WHERE username = 'alice'")
    assert "secret-pass" not in stored
    assert stored.startswith("scrypt$")


def test_change_password(auth_client):
    response = auth_client.put(
        "/api/me/password", json={"currentPassword": "password", "newPassword": "new-password"}
    )
    assert response.status_code == 204
    auth_client.post("/api/logout")
    assert login(auth_client).status_code == 401
    assert login(auth_client, password="new-password").status_code == 200


def test_change_password_requires_current_password(auth_client):
    response = auth_client.put(
        "/api/me/password", json={"currentPassword": "wrong", "newPassword": "new-password"}
    )
    assert response.status_code == 403
    auth_client.post("/api/logout")
    assert login(auth_client).status_code == 200


def test_change_password_validates_new_password(auth_client):
    response = auth_client.put(
        "/api/me/password", json={"currentPassword": "password", "newPassword": "short"}
    )
    assert response.status_code == 422


def test_change_password_requires_session(client):
    response = client.put("/api/me/password", json={"currentPassword": "a", "newPassword": "b" * 8})
    assert response.status_code == 401


def test_delete_account(client):
    register(client)
    response = client.request("DELETE", "/api/me", json={"password": "secret-pass"})
    assert response.status_code == 204
    assert client.get("/api/me").status_code == 401
    assert login(client, "alice", "secret-pass").status_code == 401
    # The username is free again, with a fresh starter board
    assert register(client).status_code == 201
    assert len(client.get("/api/boards").json()) == 1


def test_delete_account_requires_password(auth_client):
    response = auth_client.request("DELETE", "/api/me", json={"password": "wrong"})
    assert response.status_code == 403
    assert auth_client.get("/api/me").status_code == 200


def test_deleted_account_ends_other_sessions(client, other_client):
    login(client, "other", "password2")
    other_client.request("DELETE", "/api/me", json={"password": "password2"})
    assert client.get("/api/me").status_code == 401
