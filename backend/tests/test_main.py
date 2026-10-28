def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_success(client):
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_login_wrong_password(client):
    assert login(client, password="wrong").status_code == 401
    assert client.get("/api/board").status_code == 401


def test_login_wrong_username(client):
    assert login(client, username="admin").status_code == 401


def test_login_creates_session(client):
    assert client.get("/api/board").status_code == 401
    login(client)
    assert client.get("/api/board").status_code == 200


def test_login_rejects_missing_fields(client):
    assert client.post("/api/login", json={"username": "user"}).status_code == 422


def test_logout_clears_session(auth_client):
    assert auth_client.post("/api/logout").status_code == 200
    assert auth_client.get("/api/board").status_code == 401
