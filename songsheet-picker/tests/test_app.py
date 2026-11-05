import pytest
from fastapi.testclient import TestClient

import app as app_module
from picker import PickFailed

BODY = {"theme": "Let us glorify God", "count": 1,
        "songs": [{"id": "a", "title": "Shout To The Lord", "artist": "", "excerpt": "Shout"}]}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("PICKER_KEY", "secret")
    return TestClient(app_module.app)


@pytest.fixture
def fake_pick(monkeypatch):
    def fake(theme, count, songs, llm, deadline):
        return [{"id": "a", "section": "opening", "reason": "Shout to the Lord"}]
    monkeypatch.setattr(app_module, "pick", fake)
    monkeypatch.setattr(app_module, "get_llm", lambda: object())


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert r.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("headers", [{}, {"X-Picker-Key": "wrong"}])
def test_pick_rejects_missing_or_wrong_key(client, fake_pick, headers):
    r = client.post("/api/pick", json=BODY, headers=headers)
    assert r.status_code == 401
    assert r.headers["cache-control"] == "no-store"


def test_pick_rejects_when_server_has_no_key(monkeypatch, fake_pick):
    monkeypatch.delenv("PICKER_KEY", raising=False)
    r = TestClient(app_module.app).post("/api/pick", json=BODY, headers={"X-Picker-Key": ""})
    assert r.status_code == 401


def test_pick_ok(client, fake_pick):
    r = client.post("/api/pick", json=BODY, headers={"X-Picker-Key": "secret"})
    assert r.status_code == 200
    assert r.json() == {"picks": [{"id": "a", "section": "opening", "reason": "Shout to the Lord"}]}
    assert r.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("reason,status", [("deadline", 504), ("model_failed", 502)])
def test_pick_failures(client, monkeypatch, reason, status):
    def boom(*a, **k):
        raise PickFailed(reason)
    monkeypatch.setattr(app_module, "pick", boom)
    monkeypatch.setattr(app_module, "get_llm", lambda: object())
    r = client.post("/api/pick", json=BODY, headers={"X-Picker-Key": "secret"})
    assert r.status_code == status
    assert r.json() == {"error": reason}


def test_pick_validates_body(client, fake_pick):
    r = client.post("/api/pick", json={"theme": "x"}, headers={"X-Picker-Key": "secret"})
    assert r.status_code == 422
