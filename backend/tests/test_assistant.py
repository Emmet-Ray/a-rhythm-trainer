import pytest
from fastapi.testclient import TestClient
from api.assistant import get_model
from main import create_app

def test_missing_configuration_and_input_validation(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    app = create_app()
    with TestClient(app, client=("127.0.0.1", 1234)) as client:
        session_id = client.post("/api/assistant/sessions").json()["id"]
        endpoint = f"/api/assistant/sessions/{session_id}/messages"
        assert client.post(endpoint, json={"message_id": "u1", "text": "你好"}).status_code == 503
        app.dependency_overrides[get_model] = lambda: object()
        assert client.post(endpoint, json={"message_id": "u1", "text": "  "}).status_code == 422
        assert client.post(endpoint, json={"text": "你好"}).status_code == 422
        assert client.post(endpoint, json={"message_id": "", "text": "你好"}).status_code == 422
        assert client.post(endpoint, json={"message_id": "u1", "text": "你好", "provider": "evil"}).status_code == 422
        assert client.post(endpoint, json={"message_id": "u1", "text": "你好"},
                           headers={"Origin": "https://example.com"}).status_code == 403
    with TestClient(app, client=("192.0.2.1", 1234)) as client:
        assert client.post("/api/assistant/sessions").status_code == 201


@pytest.mark.parametrize("origin,expected", [
    ("http://localhost:8080", 201), ("https://rhythm.example", 201),
    ("https://evil.example", 403), ("null", 403),
    ("https://rhythm.example/", 403), ("https://rhythm.example:bad", 403),
])
def test_proxy_origins(monkeypatch, origin, expected):
    monkeypatch.setenv("AI_ALLOWED_ORIGINS", "http://localhost:8080,https://rhythm.example")
    with TestClient(create_app(), client=("172.18.0.2", 1234)) as client:
        response = client.post("/api/assistant/sessions", headers={"Origin": origin})
        assert response.status_code == expected
        assert client.post("/api/assistant/sessions", headers={
            "Origin": "https://evil.example", "X-Forwarded-Host": "rhythm.example",
            "X-Forwarded-For": "127.0.0.1", "X-Forwarded-Proto": "https",
        }).status_code == 403
        assert client.post("/api/assistant/sessions", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
        assert client.post("/api/assistant/sessions", headers=[("Origin", origin), ("Origin", origin)]).status_code == 403


@pytest.mark.parametrize("key,provider,status", [
    ("", "deepseek", "unconfigured"), ("  ", "deepseek", "unconfigured"),
    ("secret-test", "deepseek", "ready"), ("secret-test", "unsupported", "invalid"),
])
def test_configuration_status_never_calls_model(monkeypatch, key, provider, status):
    monkeypatch.setenv("AI_API_KEY", key)
    monkeypatch.setenv("AI_PROVIDER", provider)
    monkeypatch.setenv("AI_MODEL", "test-model")
    def forbidden(*args, **kwargs):
        raise AssertionError("status must not create a model client")
    monkeypatch.setattr("assistant.model.AsyncOpenAI", forbidden)
    with TestClient(create_app()) as client:
        response = client.get("/api/assistant/status")
    assert response.status_code == 200
    assert response.json()["status"] == status
    assert set(response.json()) == {"status", "message"}
    assert "secret-test" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_model_client_is_closed_when_request_validation_fails(monkeypatch):
    import httpx
    from openai import AsyncOpenAI
    clients = []
    def create_client(**kwargs):
        def forbidden(request):
            raise AssertionError("invalid input must not call upstream")
        client = AsyncOpenAI(**kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(forbidden)))
        clients.append(client)
        return client
    monkeypatch.setenv("AI_API_KEY", "test-only")
    monkeypatch.setenv("AI_PROVIDER", "deepseek")
    monkeypatch.setattr("assistant.model.AsyncOpenAI", create_client)
    with TestClient(create_app()) as client:
        sid = client.post("/api/assistant/sessions").json()["id"]
        response = client.post(f"/api/assistant/sessions/{sid}/messages", json={"message_id": "u1", "text": "  "})
        assert response.status_code == 422
    assert clients and all(client.is_closed() for client in clients)
