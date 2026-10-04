import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient

from api.assistant import get_model
from agent.messages import UserMessage, AssistantMessage
from agent.model import ModelError, ModelEvent
from main import create_app


def test_entry_timestamps_are_generated_at_acceptance_and_completion(monkeypatch):
    accepted = datetime(2026, 10, 3, 2, 0, 0, tzinfo=UTC)
    completed = datetime(2026, 10, 3, 2, 0, 5, tzinfo=UTC)
    clock = [accepted]

    class Clock:
        @staticmethod
        def now(tz):
            assert tz == UTC
            return clock[0]

    monkeypatch.setattr("assistant.records.datetime", Clock)
    app = create_app()
    observed = []

    class TimedModel:
        async def stream(self, messages, *, tools=()):
            observed.append(messages)
            yield ModelEvent("text_delta", "部分回答")
            clock[0] = completed
            yield ModelEvent("message_completed", "完整回答")

    app.dependency_overrides[get_model] = TimedModel
    with TestClient(app, client=("127.0.0.1", 1000)) as client:
        sid = client.post("/api/assistant/sessions").json()["id"]
        url = f"/api/assistant/sessions/{sid}"
        client.post(f"{url}/messages", json={"text": "问题"})
        entries = client.get(url).json()["entries"]
        assert [datetime.fromisoformat(entry["created_at"]) for entry in entries] == [accepted, completed]
        assert all(entry["created_at"].endswith("+00:00") for entry in entries)
        clock[0] = datetime(2026, 10, 4, tzinfo=UTC)
        assert client.get(url).json()["entries"] == entries
        # 时间是会话元数据，本阶段不传入模型，也不允许请求方指定。
        assert all("created_at" not in message.content for message in observed[0])
        assert client.post(f"{url}/messages", json={
            "text": "问题", "created_at": accepted.isoformat(),
        }).status_code == 422


class RecordingModel:
    def __init__(self):
        self.inputs = []
        self.fail = False

    async def stream(self, messages, *, tools=()):
        self.inputs.append(messages)
        yield ModelEvent("text_delta", "临时文字")
        if self.fail:
            raise ModelError("模拟失败")
        yield ModelEvent("message_completed", f"回答{len(self.inputs)}")


def test_history_is_server_owned_and_sessions_are_isolated():
    app = create_app()
    model = RecordingModel()
    app.dependency_overrides[get_model] = lambda: model
    with TestClient(app, client=("127.0.0.1", 1000)) as client:
        first = client.post("/api/assistant/sessions").json()["id"]
        second = client.post("/api/assistant/sessions").json()["id"]
        path = f"/api/assistant/sessions/{first}"
        client.post(f"{path}/messages", json={"text": "问题1"})
        client.post(f"{path}/messages", json={"text": "问题2"})
        assert tuple(m for m in model.inputs[1] if m.role != "system" and not m.content.startswith('{"page_context":')) == (
            UserMessage("问题1"), AssistantMessage("回答1"), UserMessage("问题2"))
        snapshot = client.get(path).json()
        assert snapshot["last_run_status"] == "completed"
        assert snapshot["is_running"] is False
        assert len(snapshot["entries"]) == 4
        assert "临时文字" not in str(snapshot)
        snapshot["entries"].clear()
        assert len(client.get(path).json()["entries"]) == 4
        client.post(f"/api/assistant/sessions/{second}/messages", json={"text": "独立问题"})
        assert model.inputs[2][-1] == UserMessage("独立问题")
        assert len(model.inputs[2]) == 3
        assert client.get("/api/assistant/sessions/unknown").status_code == 404
        assert client.post(f"{path}/messages", json={"text": "问题", "history": []}).status_code == 422
        assert len(client.get(path).json()["entries"]) == 4
    # 应用重启后旧 ID 失效；重新启动同一应用对象也创建独立存储。
    with TestClient(app, client=("127.0.0.1", 1000)) as client:
        assert client.get(path).status_code == 404


def test_failure_retains_user_without_partial_answer_and_allows_next_run():
    app = create_app()
    model = RecordingModel()
    model.fail = True
    app.dependency_overrides[get_model] = lambda: model
    with TestClient(app, client=("127.0.0.1", 1000)) as client:
        sid = client.post("/api/assistant/sessions").json()["id"]
        path = f"/api/assistant/sessions/{sid}"
        response = client.post(f"{path}/messages", json={"text": "问题1"})
        assert "run_failed" in response.text
        assert "run_completed" not in response.text
        snapshot = client.get(path).json()
        assert snapshot == {
            "id": sid, "entries": [{"type": "user", "text": "问题1", "page_context": None,
                                    "created_at": snapshot["entries"][0]["created_at"]}],
            "is_running": False, "last_run_status": "failed",
        }
        model.fail = False
        client.post(f"{path}/messages", json={"text": "请继续回答"})
        assert tuple(m for m in model.inputs[1] if m.role != "system" and not m.content.startswith('{"page_context":')) == (UserMessage("问题1"), UserMessage("请继续回答"))


def test_busy_session_rejects_concurrent_input_but_other_session_runs():
    async def run():
        entered, release = asyncio.Event(), asyncio.Event()
        class WaitingModel:
            async def stream(self, messages, *, tools=()):
                if messages[-1].content == "等待":
                    entered.set()
                    await release.wait()
                yield ModelEvent("message_completed", "回答")
        app = create_app()
        app.dependency_overrides[get_model] = WaitingModel
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost") as client:
                first = (await client.post("/api/assistant/sessions")).json()["id"]
                second = (await client.post("/api/assistant/sessions")).json()["id"]
                path = f"/api/assistant/sessions/{first}"
                task = asyncio.create_task(client.post(f"{path}/messages", json={"text": "等待"}))
                try:
                    await asyncio.wait_for(entered.wait(), 2)
                    assert (await client.get(path)).json()["is_running"] is True
                    assert (await client.post(f"{path}/messages", json={"text": "不应入历史"})).status_code == 409
                    other = await client.post(f"/api/assistant/sessions/{second}/messages", json={"text": "立即回答"})
                    assert "run_completed" in other.text
                finally:
                    release.set()
                    await task
                assert len((await client.get(path)).json()["entries"]) == 2
                assert (await client.get(path)).json()["is_running"] is False
    asyncio.run(run())


@pytest.mark.parametrize("before_stream", [False, True])
def test_http_disconnect_releases_session(before_stream):
    async def run():
        disconnected = asyncio.Event()
        closed = []
        class WaitingModel:
            async def stream(self, messages, *, tools=()):
                try:
                    yield ModelEvent("text_delta", "部分回答")
                    await asyncio.Event().wait()
                finally:
                    closed.append(True)
        app = create_app()
        app.dependency_overrides[get_model] = WaitingModel
        async with app.router.lifespan_context(app):
            session = app.state.assistant_sessions.create()
            path = f"/api/assistant/sessions/{session.id}/messages"
            scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.0"},
                     "http_version": "1.1", "method": "POST", "scheme": "http", "path": path,
                     "raw_path": path.encode(), "query_string": b"", "root_path": "",
                     "headers": [(b"content-type", b"application/json")],
                     "client": ("127.0.0.1", 1000), "server": ("localhost", 8000)}
            received = False
            async def receive():
                nonlocal received
                if not received:
                    received = True
                    return {"type": "http.request", "body": json.dumps({"text": "问题"}).encode(), "more_body": False}
                await disconnected.wait()
                return {"type": "http.disconnect"}
            async def send(message):
                if before_stream and message["type"] == "http.response.start":
                    raise OSError("客户端已断连")
                if message["type"] == "http.response.body" and b"text_delta" in message.get("body", b""):
                    disconnected.set()
            if before_stream:
                # 某些 Starlette 版本用 ExceptionGroup 包装发送错误。
                with pytest.raises((OSError, ExceptionGroup)):
                    await asyncio.wait_for(app(scope, receive, send), 2)
            else:
                await asyncio.wait_for(app(scope, receive, send), 2)
                assert closed == [True]
            assert session.snapshot()["is_running"] is False
            assert session.snapshot()["last_run_status"] == "cancelled"
            entry = session.snapshot()["entries"][0]
            assert entry == {"type": "user", "text": "问题", "page_context": None, "created_at": entry["created_at"]}
            async with session.run("继续", RecordingModel()) as stream:
                async for event in stream:
                    pass
            assert session.snapshot()["last_run_status"] == "completed"
    asyncio.run(run())
