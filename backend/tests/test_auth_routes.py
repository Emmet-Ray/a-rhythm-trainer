from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from auth import Auth
from auth_routes import AuthHttpSettings, AuthRuntime, SESSION_LIFETIME
from db.sessions import LoginSession, create_login_session
from db.users import User
from main import create_app
from sms_auth import SmsSendRejected, SmsServiceError


ORIGIN = "https://testserver"
PHONE = "13800138000"
COOKIE = "__Host-rhythm_session"


@pytest.fixture
def http(migrated_db):
    sms = SimpleNamespace(send_code=AsyncMock(), verify_code=AsyncMock(return_value=True))
    runtime = AuthRuntime(
        migrated_db, Auth(migrated_db, sms, session_lifetime=SESSION_LIFETIME),
        AuthHttpSettings((ORIGIN,)),
    )
    with TestClient(create_app(auth_runtime=runtime), base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        yield client, sms, migrated_db


def request_code(client):
    response = client.post("/api/auth/sms-code", json={"phone_number": PHONE})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    return response.json()["request_id"]


def login(client):
    return client.post("/api/auth/login", json={"request_id": request_code(client), "code": "012345"})


def test_login_me_logout_round_trip(http):
    client, sms, engine = http
    assert client.get("/api/auth/me").status_code == 401
    response = login(client)
    assert response.status_code == 200
    assert set(response.json()) == {"id"}
    token = client.cookies.get(COOKIE)
    assert token and token not in response.text
    cookie = response.headers["set-cookie"]
    for attribute in ("HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age=604800", "expires="):
        assert attribute in cookie
    assert "Domain=" not in cookie
    assert client.get("/api/auth/me").json() == response.json()
    sms.verify_code.assert_awaited_once_with(PHONE, "012345")
    with Session(engine) as session:
        assert session.scalar(select(User.id)) == response.json()["id"]
        assert session.scalar(select(LoginSession.token_hash)) != token
    result = client.post("/api/auth/logout")
    assert result.status_code == 204 and result.content == b""
    assert "Max-Age=0" in result.headers["set-cookie"]
    assert client.cookies.get(COOKIE) is None
    assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={token}"}).status_code == 401
    assert client.post("/api/auth/logout").status_code == 204


@pytest.mark.parametrize("origin", [None, "null", "https://evil.example", "https://testserver.evil.example", "http://testserver", "https://testserver:444"])
@pytest.mark.parametrize("path", ["sms-code", "login", "logout"])
def test_untrusted_or_missing_origin_is_rejected_before_work(http, origin, path):
    client, sms, _ = http
    client.headers.pop("origin")
    headers = {} if origin is None else {"Origin": origin}
    response = client.post(f"/api/auth/{path}", json={}, headers=headers)
    assert response.status_code == 403
    assert response.headers["cache-control"] == "no-store"
    sms.send_code.assert_not_awaited()
    sms.verify_code.assert_not_awaited()


def test_duplicate_origin_rejected(http):
    client, sms, _ = http
    client.headers.pop("origin")
    response = client.post("/api/auth/logout", headers=[("Origin", ORIGIN), ("Origin", ORIGIN)])
    assert response.status_code == 403


@pytest.mark.parametrize("path,body", [
    ("sms-code", {"phone_number": "secret-phone"}),
    ("sms-code", {"phone_number": PHONE, "unexpected": "secret-value"}),
    ("sms-code", {"phone_number": 13800138000}),
    ("login", {"request_id": "a" * 43, "code": "secret-code"}),
    ("login", {"request_id": "a" * 43, "code": 123456}),
    ("login", {"request_id": "a" * 43, "code": "012345", "phone_number": PHONE}),
])
def test_validation_does_not_echo_input(http, path, body):
    client, sms, _ = http
    response = client.post(f"/api/auth/{path}", json=body)
    assert response.status_code == 422
    assert response.json() == {"detail": "请求参数格式错误。"}
    sms.send_code.assert_not_awaited()
    sms.verify_code.assert_not_awaited()


def test_malformed_json_is_sanitized(http):
    response = http[0].post("/api/auth/login", content='{"code":"secret', headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert "secret" not in response.text


def test_cooldown_wrong_code_and_used_request(http):
    client, sms, _ = http
    request_id = request_code(client)
    assert client.post("/api/auth/sms-code", json={"phone_number": PHONE}).status_code == 429
    sms.send_code.assert_awaited_once()
    sms.verify_code.return_value = False
    body = {"request_id": request_id, "code": "012345"}
    failed = client.post("/api/auth/login", json=body)
    assert failed.status_code == 400 and "set-cookie" not in failed.headers
    sms.verify_code.return_value = True
    assert client.post("/api/auth/login", json=body).status_code == 200
    assert client.post("/api/auth/login", json=body).status_code == 400
    assert sms.verify_code.await_count == 2


@pytest.mark.parametrize("stage,error", [
    ("send", SmsSendRejected("secret-provider-response")),
    ("send", SmsServiceError("secret-provider-response")),
    ("verify", SmsServiceError("secret-provider-response")),
])
def test_service_failure_is_sanitized(http, stage, error):
    client, sms, _ = http
    if stage == "send":
        sms.send_code.side_effect = error
        response = client.post("/api/auth/sms-code", json={"phone_number": PHONE})
    else:
        request_id = request_code(client)
        sms.verify_code.side_effect = error
        response = client.post("/api/auth/login", json={"request_id": request_id, "code": "012345"})
    assert response.status_code == 503
    assert "secret" not in response.text and "set-cookie" not in response.headers


def test_database_failure_does_not_issue_cookie(http, monkeypatch):
    client, _, _ = http
    request_id = request_code(client)

    def fail(*args, **kwargs):
        raise OperationalError("secret-sql", {"secret": PHONE}, Exception("secret-db-error"))

    monkeypatch.setattr("auth.create_login_session", fail)
    response = client.post("/api/auth/login", json={"request_id": request_id, "code": "012345"})
    assert response.status_code == 503
    assert "secret" not in response.text and "set-cookie" not in response.headers


def test_expired_invalid_and_unknown_cookies(http):
    client, _, engine = http
    login(client)
    with Session(engine) as session, session.begin():
        session.execute(update(LoginSession).values(
            created_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2),
            expires_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1),
        ))
    assert client.get("/api/auth/me").status_code == 401
    for token in ("bad", "a" * 43):
        response = client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={token}"})
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"


def test_logout_only_revokes_current_session(http):
    client, _, engine = http
    user_id = login(client).json()["id"]
    with Session(engine) as session, session.begin():
        other = create_login_session(session, user_id, lifetime=SESSION_LIFETIME)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me", headers={"Cookie": f"{COOKIE}={other}"}).json() == {"id": user_id}


def test_disabled_auth_keeps_health_available(monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "false")
    with TestClient(create_app()) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        assert client.get("/api/auth/me").status_code == 503
        assert client.post("/api/auth/sms-code", json={"phone_number": PHONE}).status_code == 503


def test_local_http_cookie(migrated_db):
    origin = "http://localhost:5173"
    sms = SimpleNamespace(send_code=AsyncMock(), verify_code=AsyncMock(return_value=True))
    runtime = AuthRuntime(migrated_db, Auth(migrated_db, sms, session_lifetime=SESSION_LIFETIME), AuthHttpSettings((origin,), False))
    with TestClient(create_app(auth_runtime=runtime), base_url=origin, headers={"Origin": origin}) as client:
        response = login(client)
        assert "Secure" not in response.headers["set-cookie"]
        assert client.cookies.get("rhythm_session")
        assert client.get("/api/auth/me").status_code == 200
        assert client.post("/api/auth/logout").status_code == 204
        assert client.cookies.get("rhythm_session") is None


@pytest.mark.parametrize("origins,secure", [
    ((), True), (("*",), True), (("https://example.com/path",), True),
    (("https://example.com/",), True), (("https://user@example.com",), True),
    (("null",), True), (("http://example.com",), True),
    (("https://example.com",), False), (("https://example.com:bad",), True),
])
def test_invalid_settings_fail_closed(origins, secure):
    with pytest.raises(ValueError):
        AuthHttpSettings(origins, secure)


@pytest.mark.parametrize("name,value", [("AUTH_ENABLED", "yes"), ("AUTH_COOKIE_SECURE", "0"), ("AUTH_ALLOWED_ORIGINS", "")])
def test_invalid_environment_settings(monkeypatch, name, value):
    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    monkeypatch.setenv("AUTH_ALLOWED_ORIGINS", ORIGIN)
    monkeypatch.setenv(name, value)
    with pytest.raises(ValueError):
        AuthHttpSettings.from_env()


def test_lifespan_loads_and_disposes_owned_resources(migrated_db, monkeypatch):
    from unittest.mock import Mock
    import main

    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    monkeypatch.setenv("AUTH_ALLOWED_ORIGINS", ORIGIN)
    sms = SimpleNamespace(send_code=AsyncMock(), verify_code=AsyncMock(return_value=True))
    settings = object()
    monkeypatch.setattr(main.SmsSettings, "from_env", lambda: settings)
    sms_factory = Mock(return_value=sms)
    engine_factory = Mock(return_value=migrated_db)
    dispose = Mock(wraps=migrated_db.dispose)
    monkeypatch.setattr(main, "SmsAuth", sms_factory)
    monkeypatch.setattr(main, "create_database_engine", engine_factory)
    monkeypatch.setattr(migrated_db, "dispose", dispose)
    app = create_app()
    sms_factory.assert_not_called()
    engine_factory.assert_not_called()
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        sms_factory.assert_called_once_with(settings)
        engine_factory.assert_called_once()
        sms.send_code.assert_not_awaited()
        assert login(client).status_code == 200
        dispose.assert_not_called()
    dispose.assert_called_once()
    assert app.state.auth_runtime is None
