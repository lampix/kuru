from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import SecretStr

from kuru.core.config import Settings
from kuru.main import create_app


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_single_user_without_token(client: TestClient) -> None:
    assert client.get("/api/auth/info").json() == {"requires_login": False}
    me = client.get("/api/auth/me").json()
    assert me["id"] == 1
    assert client.get("/api/auth/me").json()["id"] == 1  # same implicit user


def test_update_me_validates_timezone(client: TestClient) -> None:
    assert client.patch("/api/auth/me", json={"timezone": "Mars/Base"}).status_code == 422
    updated = client.patch("/api/auth/me", json={"timezone": "Europe/Vienna"}).json()
    assert updated["timezone"] == "Europe/Vienna"


def test_access_token_required(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, access_token=SecretStr("s3cret"))
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/auth/info").json() == {"requires_login": True}
        assert client.get("/api/auth/me").status_code == 401
        assert client.post("/api/auth/login", json={"token": "nope"}).status_code == 401

        bearer = {"Authorization": "Bearer s3cret"}
        assert client.get("/api/auth/me", headers=bearer).status_code == 200

        assert client.post("/api/auth/login", json={"token": "s3cret"}).status_code == 200
        assert client.get("/api/auth/me").status_code == 200  # cookie from login
