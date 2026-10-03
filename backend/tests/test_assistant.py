import asyncio
import json
from contextlib import aclosing

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from api.assistant import get_model
from assistant.model import DeepSeekModel, Message, ModelError, ModelEvent, ModelSettings
from main import create_app


def wire(event):
    return f"data: {json.dumps(event)}\n\n".encode()


def completed(text="你好"):
    return {"type": "response.completed", "response": {
        "id": "resp_test", "object": "response", "created_at": 0, "status": "completed",
        "model": "test-model", "output": [{"id": "msg_test", "type": "message",
        "status": "completed", "role": "assistant", "content": [
            {"type": "output_text", "text": text, "annotations": []}]}],
    }}


def install_transport(monkeypatch, handler):
    def client(**kwargs):
        return AsyncOpenAI(**kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr("assistant.model.AsyncOpenAI", client)
    return DeepSeekModel(ModelSettings("deepseek", "test-model", "secret-test"))


def test_model_responses_stream(monkeypatch):
    def handler(request):
        assert request.url.path == "/responses"
        body = json.loads(request.content)
        assert body["model"] == "test-model"
        assert body["input"] == [{"role": "user", "content": "你好"}]
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=
            wire({"type": "response.output_text.delta", "delta": "你"}) +
            wire({"type": "response.output_text.delta", "delta": "好"}) + wire(completed()))
    model = install_transport(monkeypatch, handler)
    async def collect():
        return [event async for event in model.stream([Message("user", "你好")])]
    assert asyncio.run(collect()) == [ModelEvent("text_delta", "你"), ModelEvent("text_delta", "好"),
                                    ModelEvent("message_completed", "你好")]


@pytest.mark.parametrize("ending", [b"", wire({"type": "response.incomplete"}), wire(completed(""))])
def test_model_requires_nonempty_completed_response(monkeypatch, ending):
    model = install_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={"content-type": "text/event-stream"}, content=ending))
    async def collect():
        with pytest.raises(ModelError):
            return [event async for event in model.stream([Message("user", "问题")])]
    asyncio.run(collect())


def test_upstream_error_is_sanitized_and_not_retried(monkeypatch):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(401, json={"error": {"message": "secret-test", "type": "auth"}})
    model = install_transport(monkeypatch, handler)
    async def collect():
        with pytest.raises(ModelError, match="模型服务请求失败") as error:
            return [event async for event in model.stream([Message("user", "问题")])]
        assert "secret-test" not in str(error.value)
    asyncio.run(collect())
    assert len(calls) == 1


def test_cancellation_closes_upstream(monkeypatch):
    class WaitingStream(httpx.AsyncByteStream):
        closed = False
        async def __aiter__(self):
            yield wire({"type": "response.output_text.delta", "delta": "你"})
            await asyncio.Event().wait()
        async def aclose(self):
            self.closed = True
    upstream = WaitingStream()
    model = install_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={"content-type": "text/event-stream"}, stream=upstream))
    async def run():
        started = asyncio.Event()
        async def consume():
            async with aclosing(model.stream([Message("user", "问题")])) as stream:
                async for event in stream:
                    started.set()
        task = asyncio.create_task(consume())
        await asyncio.wait_for(started.wait(), 2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert upstream.closed
    asyncio.run(run())


@pytest.mark.parametrize("fail", [False, True])
def test_http_event_contract_and_cleanup(fail):
    class FakeModel:
        closed = False
        async def stream(self, messages):
            try:
                assert messages[-1] == Message("user", "你好")
                yield ModelEvent("text_delta", "你")
                if fail:
                    raise ModelError("模型回答未完成，请重试。")
                yield ModelEvent("message_completed", "你好")
            finally:
                self.closed = True
    model = FakeModel()
    app = create_app()
    app.dependency_overrides[get_model] = lambda: model
    with TestClient(app, client=("127.0.0.1", 1234)) as client:
        session_id = client.post("/api/assistant/sessions").json()["id"]
        response = client.post(f"/api/assistant/sessions/{session_id}/messages", json={"text": "你好"})
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [e["type"] for e in events] == (
        ["text_delta", "run_failed"] if fail else ["text_delta", "message_completed", "run_completed"])
    assert model.closed


def test_missing_configuration_and_input_validation(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    app = create_app()
    with TestClient(app, client=("127.0.0.1", 1234)) as client:
        session_id = client.post("/api/assistant/sessions").json()["id"]
        endpoint = f"/api/assistant/sessions/{session_id}/messages"
        assert client.post(endpoint, json={"text": "你好"}).status_code == 503
        app.dependency_overrides[get_model] = lambda: object()
        assert client.post(endpoint, json={"text": "  "}).status_code == 422
        assert client.post(endpoint, json={"text": "你好", "provider": "evil"}).status_code == 422
        assert client.post(endpoint, json={"text": "你好"},
                           headers={"Origin": "https://example.com"}).status_code == 403
    with TestClient(app, client=("192.0.2.1", 1234)) as client:
        assert client.post(endpoint, json={"text": "你好"}).status_code == 403
