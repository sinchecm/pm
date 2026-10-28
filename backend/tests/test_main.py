from fastapi.testclient import TestClient

from app.main import app


def make_client():
    return TestClient(app)


def login(client, password="password"):
    return client.post("/api/login", json={"username": "user", "password": password})


def test_health():
    response = make_client().get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_success():
    client = make_client()
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_login_wrong_password():
    client = make_client()
    response = login(client, password="wrong")
    assert response.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_login_wrong_username():
    response = make_client().post(
        "/api/login", json={"username": "admin", "password": "password"}
    )
    assert response.status_code == 401


def test_me_requires_session():
    assert make_client().get("/api/me").status_code == 401


def test_me_with_session():
    client = make_client()
    login(client)
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session():
    client = make_client()
    login(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401
