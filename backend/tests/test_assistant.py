import asyncio
import json
from contextlib import aclosing

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from api.assistant import get_model
from agent.messages import UserMessage
from agent.model import DeepSeekModel, ModelError, ModelEvent, ModelSettings
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
    monkeypatch.setattr("agent.model.AsyncOpenAI", client)
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
        return [event async for event in model.stream([UserMessage("你好")])]
    assert asyncio.run(collect()) == [ModelEvent("text_delta", "你"), ModelEvent("text_delta", "好"),
                                    ModelEvent("message_completed", "你好")]


@pytest.mark.parametrize("ending", [b"", wire({"type": "response.incomplete"}), wire(completed(""))])
def test_model_requires_nonempty_completed_response(monkeypatch, ending):
    model = install_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={"content-type": "text/event-stream"}, content=ending))
    async def collect():
        with pytest.raises(ModelError):
            return [event async for event in model.stream([UserMessage("问题")])]
    asyncio.run(collect())


def test_upstream_error_is_sanitized_and_not_retried(monkeypatch):
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(401, json={"error": {"message": "secret-test", "type": "auth"}})
    model = install_transport(monkeypatch, handler)
    async def collect():
        with pytest.raises(ModelError, match="模型 API Key 无效") as error:
            return [event async for event in model.stream([UserMessage("问题")])]
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
            async with aclosing(model.stream([UserMessage("问题")])) as stream:
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
        async def stream(self, messages, *, tools=()):
            try:
                assert messages[-1] == UserMessage("你好")
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
        ["entry_added", "text_delta", "run_failed"] if fail else ["entry_added", "text_delta", "entry_added", "message_completed", "run_completed"])
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
        assert client.post("/api/assistant/sessions").status_code == 201


def test_responses_tool_round_trip_preserves_reasoning_and_call_id(monkeypatch):
    from assistant.sessions import ChatSession
    requests = []
    arguments = {"title": "练习", "description": "四拍", "exercise": {
        "timeSignature": {"beats": 4, "beatType": 4},
        "measures": [{"elements": [{"kind": "note", "noteValue": "whole"}]}]}}
    reasoning = {"id": "rs_1", "type": "reasoning", "summary": [],
                 "content": [{"type": "reasoning_text", "text": "规划节奏"}]}
    tool_call = {"id": "fc_1", "type": "function_call", "call_id": "call_1",
                 "name": "propose_rhythm_exercise", "arguments": json.dumps(arguments), "status": "completed"}
    def handler(request):
        body = json.loads(request.content)
        requests.append(body)
        assert body["tools"][0]["name"] == "propose_rhythm_exercise"
        if len(requests) == 1:
            response = completed("")
            response["response"]["output"] = [reasoning, tool_call]
            events = wire(response)
        else:
            assert body["input"][-3:] == [reasoning, tool_call, body["input"][-1]]
            result = body["input"][-1]
            assert result["type"] == "function_call_output"
            assert result["call_id"] == "call_1"
            assert json.loads(result["output"])["title"] == "练习"
            events = wire(completed("已生成练习"))
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=events)
    model = install_transport(monkeypatch, handler)
    session = ChatSession()
    async def run():
        async with session.run("生成", model) as stream:
            return [event async for event in stream]
    assert asyncio.run(run())[-1].text == "已生成练习"
    assert len(requests) == 2
    assert session.snapshot()["entries"][2]["type"] == "tool_result"


def test_partial_tool_arguments_never_execute(monkeypatch):
    from assistant.sessions import ChatSession
    model = install_transport(monkeypatch, lambda request: httpx.Response(
        200, headers={"content-type": "text/event-stream"}, content=wire({
            "type": "response.function_call_arguments.delta", "item_id": "fc1", "output_index": 0,
            "delta": '{"title":', "sequence_number": 1,
        })))
    session = ChatSession()
    async def run():
        with pytest.raises(ModelError):
            async with session.run("生成", model) as stream:
                async for _ in stream:
                    pass
    asyncio.run(run())
    assert [e["type"] for e in session.snapshot()["entries"]] == ["user"]


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
    monkeypatch.setattr("agent.model.AsyncOpenAI", forbidden)
    with TestClient(create_app()) as client:
        response = client.get("/api/assistant/status")
    assert response.status_code == 200
    assert response.json()["status"] == status
    assert set(response.json()) == {"status", "message"}
    assert "secret-test" not in response.text
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("code,message", [(402, "额度不足"), (429, "请求受限"), (500, "模型服务请求失败")])
def test_upstream_failure_messages(monkeypatch, code, message):
    model = install_transport(monkeypatch, lambda request: httpx.Response(code, json={"error": {"message": "secret-test"}}))
    async def collect():
        with pytest.raises(ModelError, match=message) as error:
            return [event async for event in model.stream([UserMessage("问题")])]
        assert "secret-test" not in str(error.value)
    asyncio.run(collect())
