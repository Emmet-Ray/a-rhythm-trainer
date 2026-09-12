from copy import deepcopy
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from domain.auth import Auth
from api.dependencies import AppResources
from settings import AuthHttpSettings, SESSION_LIFETIME
from db.custom_exercises import CustomExercise
from db.sessions import LoginSession, create_login_session
from db.users import get_or_create_user
from main import create_app


ORIGIN = "https://testserver"
PATH = "/api/custom-exercises"
COOKIE = "__Host-rhythm_session"


def payload(mode="tapping"):
    return {
        "name": " 我的练习 ", "mode": mode,
        "exercise": {"timeSignature": {"beats": 4, "beatType": 4}, "measures": [
            {"elements": [{"kind": "note", "noteValue": "whole"}]},
        ]},
    }


@pytest.fixture
def http(migrated_db):
    with Session(migrated_db) as session, session.begin():
        tokens = [create_login_session(session, get_or_create_user(session, phone).id, lifetime=SESSION_LIFETIME)
                  for phone in ("13800000000", "13900000000")]
    sms = SimpleNamespace(send_code=AsyncMock(), verify_code=AsyncMock())
    runtime = AppResources(migrated_db, Auth(migrated_db, sms, session_lifetime=SESSION_LIFETIME), AuthHttpSettings((ORIGIN,)))
    with TestClient(create_app(resources=runtime), base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        yield client, tokens, migrated_db
    sms.send_code.assert_not_awaited()
    sms.verify_code.assert_not_awaited()


def headers(token):
    return {"Cookie": f"{COOKIE}={token}"}


def test_create_list_read_and_isolation(http):
    client, (a, b), engine = http
    response = client.post(PATH, json=payload(), headers=headers(a))
    assert response.status_code == 201
    detail = response.json()
    assert set(detail) == {"id", "name", "mode", "exercise", "created_at"}
    assert detail["name"] == "我的练习"
    assert detail["exercise"] == payload()["exercise"]
    assert datetime.fromisoformat(detail["created_at"]).utcoffset() == timedelta(0)
    assert response.headers["cache-control"] == "no-store"
    with Session(engine) as session:
        assert session.get(CustomExercise, detail["id"]) is not None
    assert client.get(f"{PATH}/{detail['id']}", headers=headers(a)).json() == detail
    page = client.get(PATH, params={"mode": "tapping"}, headers=headers(a)).json()
    assert page == {"items": [{key: value for key, value in detail.items() if key != "exercise"}], "limit": 50, "offset": 0}
    assert client.get(PATH, params={"mode": "tapping"}, headers=headers(b)).json()["items"] == []
    foreign = client.get(f"{PATH}/{detail['id']}", headers=headers(b))
    missing = client.get(f"{PATH}/missing", headers=headers(b))
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


@pytest.mark.parametrize("cookie", [None, "invalid", "a" * 43])
def test_requires_valid_session(http, cookie):
    client, _, _ = http
    request_headers = headers(cookie) if cookie else {}
    responses = [
        client.post(PATH, json=payload(), headers=request_headers),
        client.get(PATH, params={"mode": "tapping"}, headers=request_headers),
        client.get(f"{PATH}/missing", headers=request_headers),
    ]
    for response in responses:
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"


def test_expired_and_revoked_sessions(http):
    client, (a, b), engine = http
    assert client.post("/api/auth/logout", headers=headers(a)).status_code == 204
    assert client.post(PATH, json=payload(), headers=headers(a)).status_code == 401
    now = datetime.now(UTC).replace(tzinfo=None)
    with Session(engine) as session, session.begin():
        session.execute(update(LoginSession).values(created_at=now - timedelta(days=2), expires_at=now - timedelta(days=1)))
    assert client.post(PATH, json=payload(), headers=headers(b)).status_code == 401


@pytest.mark.parametrize("origin", [None, "null", "https://evil.example", "https://testserver.evil.example"])
def test_post_origin_guard(http, origin):
    client, (a, _), engine = http
    client.headers.pop("origin")
    request_headers = headers(a)
    if origin is not None:
        request_headers["Origin"] = origin
    response = client.post(PATH, json=payload(), headers=request_headers)
    assert response.status_code == 403
    with Session(engine) as session:
        assert session.scalars(select(CustomExercise)).all() == []


@pytest.mark.parametrize("extra", [{"user_id": 2}, {"id": "custom-client-id"}, {"created_at": "2020-01-01"}])
def test_rejects_client_owned_metadata(http, extra):
    client, (a, _), _ = http
    response = client.post(PATH, json={**payload(), **extra}, headers=headers(a))
    assert response.status_code == 422
    assert response.json() == {"detail": "请求参数格式错误。"}


@pytest.mark.parametrize("changes", [
    {"name": " "}, {"name": "x" * 101}, {"mode": "geometry"},
    {"exercise": {}}, {"exercise": []}, {"exercise": None},
])
def test_invalid_payload(http, changes):
    client, (a, _), engine = http
    assert client.post(PATH, json={**payload(), **changes}, headers=headers(a)).status_code == 422
    with Session(engine) as session:
        assert session.scalars(select(CustomExercise)).all() == []


def test_rhythm_validation_and_round_trip(http):
    client, (a, _), _ = http
    body = payload()
    body["exercise"]["measures"][0]["elements"] = [
        {"kind": "note", "noteValue": "eighth"},
        {"kind": "triplet", "notes": [{"kind": "note", "noteValue": "eighth"}] * 3},
        {"kind": "note", "noteValue": "eighth"},
        {"kind": "rest", "noteValue": "quarter", "dots": 1},
        {"kind": "note", "noteValue": "eighth"},
    ]
    response = client.post(PATH, json=body, headers=headers(a))
    assert response.status_code == 201
    assert response.json()["exercise"] == body["exercise"]
    invalid = deepcopy(body)
    invalid["exercise"]["measures"][0]["elements"].pop()
    assert client.post(PATH, json=invalid, headers=headers(a)).status_code == 422
    invalid = deepcopy(body)
    invalid["exercise"]["measures"][0]["elements"][1]["notes"][0]["dots"] = 1
    assert client.post(PATH, json=invalid, headers=headers(a)).status_code == 422


@pytest.mark.parametrize("query", [{}, {"mode": "geometry"}, {"mode": "tapping", "limit": 0}, {"mode": "tapping", "limit": 101}, {"mode": "tapping", "offset": -1}])
def test_invalid_pagination(http, query):
    client, (a, _), _ = http
    assert client.get(PATH, params=query, headers=headers(a)).status_code == 422


def test_modes_duplicates_and_pages(http):
    client, (a, _), _ = http
    saved = [client.post(PATH, json=payload(), headers=headers(a)).json() for _ in range(3)]
    client.post(PATH, json=payload("dictation"), headers=headers(a))
    assert len({item["id"] for item in saved}) == 3
    expected = sorted(saved, key=lambda item: (item["created_at"], item["id"]), reverse=True)
    for offset in range(3):
        page = client.get(PATH, params={"mode": "tapping", "limit": 1, "offset": offset}, headers=headers(a)).json()
        assert [item["id"] for item in page["items"]] == [expected[offset]["id"]]
    assert client.get(PATH, params={"mode": "tapping", "offset": 3}, headers=headers(a)).json()["items"] == []
    assert len(client.get(PATH, params={"mode": "dictation"}, headers=headers(a)).json()["items"]) == 1


def test_commit_failure_rolls_back_and_never_returns_success(http):
    client, (a, _), engine = http

    def fail(session):
        raise OperationalError("secret sql", {}, Exception("secret database path"))

    event.listen(Session, "before_commit", fail)
    try:
        response = client.post(PATH, json=payload(), headers=headers(a))
    finally:
        event.remove(Session, "before_commit", fail)
    assert response.status_code == 503
    assert "secret" not in response.text and "id" not in response.json()
    assert response.headers["cache-control"] == "no-store"
    with Session(engine) as session:
        assert session.scalars(select(CustomExercise)).all() == []


def test_query_failure_is_not_empty_list_or_not_found(http, monkeypatch):
    client, (a, _), _ = http

    def fail(*args, **kwargs):
        raise OperationalError("secret sql", {}, Exception("secret"))

    monkeypatch.setattr("api.custom_exercises.list_custom_exercises", fail)
    monkeypatch.setattr("api.custom_exercises.get_custom_exercise", fail)
    for url in (f"{PATH}?mode=tapping", f"{PATH}/missing"):
        response = client.get(url, headers=headers(a))
        assert response.status_code == 503 and "secret" not in response.text
