"""标准工具链的历史、恢复和模型协议回归。"""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from api.assistant import get_model
from agent.messages import UserMessage, AssistantMessage, ToolCall
from agent.loop import run_agent

from agent.model import ModelError, ModelEvent
from assistant.sessions import ChatSession
from agent.tools import AgentTool, ToolExecutor, ToolResult
from assistant.tools import create_tools
from main import create_app


def collect_events(entries, events):
    def emit(event):
        events.append(event)
        if event.type == "message_end":
            entries.append(event.message)
    return emit


def call(id="c1", count=4):
    return ToolCall(id, "propose_rhythm_exercise", json.dumps({
        "title": "练习", "description": "稳定四拍", "exercise": {
            "timeSignature": {"beats": 4, "beatType": 4},
            "measures": [{"elements": [{"kind": "note", "noteValue": "quarter"}] * count}],
        },
    }))


class ScriptedModel:
    def __init__(self, *turns):
        self.turns = list(turns)
        self.inputs = []

    async def stream(self, messages, *, tools=()):
        self.inputs.append(messages)
        turn = self.turns.pop(0)
        if isinstance(turn, Exception):
            raise turn
        yield turn


def test_http_history_contains_calls_results_and_next_turn_context():
    model = ScriptedModel(ModelEvent("message_completed", "", (call(),)),
                          ModelEvent("message_completed", "已生成。"), ModelEvent("message_completed", "可以调整。"))
    app = create_app()
    app.dependency_overrides[get_model] = lambda: model
    with TestClient(app, client=("127.0.0.1", 1000)) as client:
        sid = client.post("/api/assistant/sessions").json()["id"]
        path = f"/api/assistant/sessions/{sid}"
        response = client.post(path + "/messages", json={"text": "生成练习", "page_context": {
            "page": "editor", "description": "编辑器", "state": {"count": 2}}})
        assert response.text.count('"type": "message_completed"') == 1
        assert "run_completed" in response.text
        snapshot = client.get(path).json()
        assert "generated_exercises" not in snapshot
        entries = snapshot["entries"]
        assert [e["type"] for e in entries] == ["user", "assistant", "tool_result", "assistant"]
        assert entries[1]["tool_calls"][0]["id"] == entries[2]["tool_call_id"] == "c1"
        assert entries[2]["details"]["generated_exercise"]["exercise"]["measures"]
        next_input = model.inputs[1]
        assert [m.role for m in next_input[-2:]] == ["assistant", "tool"]
        assert next_input[-1].content == entries[2]["content"]
        assert json.loads(next_input[1].content)["page_context"]["scope"] == "current"
        assert "generated_exercise" not in next_input[-1].content
        client.post(path + "/messages", json={"text": "把刚才的改简单些"})
        assert any(m.tool_calls for m in model.inputs[2] if isinstance(m, AssistantMessage))
        assert any(m.role == "tool" and m.tool_call_id == "c1" for m in model.inputs[2])
        assert json.loads(model.inputs[2][1].content)["page_context"]["scope"] == "historical"
        entries[2]["details"].clear()
        assert client.get(path).json()["entries"][2]["details"]


@pytest.mark.parametrize("bad", [call(count=3), ToolCall("c1", "missing", "{}"), ToolCall("c1", "propose_rhythm_exercise", "{broken")])
def test_error_result_is_sent_to_model_for_correction(bad):
    model = ScriptedModel(ModelEvent("message_completed", "", (bad,)),
                          ModelEvent("message_completed", "", (call("c2"),)), ModelEvent("message_completed", "已修正"))
    entries = [UserMessage("生成")]
    async def run():
        events = []
        await run_agent(entries, model, ToolExecutor(create_tools()), emit=collect_events(entries, events))
        return events
    events = asyncio.run(run())
    results = [e for e in entries if e.role == "tool"]
    assert [e.is_error for e in results] == [True, False]
    assert model.inputs[1][-1].content == results[0].content
    assert events[-1].text == "已修正"


def test_tool_limit_stops_execution_and_pairs_every_call():
    model = ScriptedModel(ModelEvent("message_completed", "", (call(), call("c2"))))
    entries = [UserMessage("生成")]
    async def run():
        with pytest.raises(ModelError, match="上限"):
            await run_agent(entries, model, ToolExecutor(create_tools()), max_tool_calls=1,
                            emit=collect_events(entries, []))
    asyncio.run(run())
    results = [e for e in entries if e.role == "tool"]
    assert len(results) == 2
    assert [r.is_error for r in results] == [False, True]


def test_cancelled_tool_batch_remains_replayable():
    class Args(BaseModel):
        pass
    async def scenario():
        started = asyncio.Event()
        async def wait(call_id, parameters):
            started.set()
            await asyncio.Event().wait()
        tools = ToolExecutor([AgentTool("wait", "等待", Args, wait)])
        entries = [UserMessage("等待")]
        model = ScriptedModel(ModelEvent("message_completed", "", (
            ToolCall("c1", "wait", "{}"), ToolCall("c2", "wait", "{}"))))
        async def consume():
            await run_agent(entries, model, tools, emit=collect_events(entries, []))
        task = asyncio.create_task(consume())
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        results = [e for e in entries if e.role == "tool"]
        assert [e.tool_call_id for e in results] == ["c1", "c2"]
        assert "未确认" in results[0].content
        assert "未执行" in results[1].content
        assert all(e.is_error for e in results)
        assert entries[-1].role == "tool"
    asyncio.run(scenario())


def test_successful_tool_result_survives_later_model_failure():
    model = ScriptedModel(ModelEvent("message_completed", "", (call(),)), ModelError("后续请求失败"))
    session = ChatSession()
    async def run():
        with pytest.raises(ModelError):
            async with session.run("生成", model) as stream:
                async for _ in stream:
                    pass
    asyncio.run(run())
    snapshot = session.snapshot()
    assert snapshot["last_run_status"] == "failed"
    assert snapshot["entries"][-1]["type"] == "tool_result"
    assert snapshot["entries"][-1]["details"]["generated_exercise"]


def test_tool_result_streams_before_followup_model_finishes():
    async def scenario():
        release = asyncio.Event()

        class PausedModel:
            calls = 0

            async def stream(self, messages, *, tools=()):
                self.calls += 1
                if self.calls == 1:
                    yield ModelEvent("text_delta", "先生成。")
                    yield ModelEvent("message_completed", "先生成。", (call(),))
                else:
                    await release.wait()
                    yield ModelEvent("text_delta", "建议慢练。")
                    yield ModelEvent("message_completed", "建议慢练。")

        session = ChatSession()
        async with session.run("出题", PausedModel()) as stream:
            received = []
            while True:
                event = await asyncio.wait_for(anext(stream), 1)
                received.append(event)
                if event.type == "entry_added" and event.entry["type"] == "tool_result":
                    break
            assert not release.is_set()
            assert session.agent.is_running
            card = received[-1]
            assert card.entry == session.snapshot()["entries"][card.index]
            assert card.entry["details"]["generated_exercise"]["exercise"]["measures"]
            release.set()
            received.extend([event async for event in stream])
        entries = [event.entry for event in received if event.type == "entry_added"]
        assert entries == session.snapshot()["entries"]
        assert [event.index for event in received if event.type == "entry_added"] == list(range(4))
        assert received[-1].type == "message_completed"

    asyncio.run(scenario())
