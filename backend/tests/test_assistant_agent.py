"""Agent 可独立于会话使用，订阅者观察已提交状态。"""
import asyncio

import pytest

from agent.messages import UserMessage
from agent.agent import Agent, AgentBusy
from agent.messages import ToolCall
from agent.model import ModelEvent
from agent.tools import ToolExecutor


class ReplyModel:
    async def stream(self, messages, *, tools=()):
        yield ModelEvent("text_delta", "你好")
        yield ModelEvent("message_completed", "你好")


def test_agent_state_events_isolation_and_repeated_runs():
    async def scenario():
        agent = Agent(ToolExecutor([]))
        events = []
        def observe(event):
            if event.type == "message_end":
                assert agent.messages[-1] == event.message
            elif event.type == "run_completed":
                assert agent.last_run_status == "completed"
            events.append(event)
        unsubscribe = agent.subscribe(observe)
        history = [UserMessage("问题")]
        async with agent.run(ReplyModel(), messages=history) as stream:
            with pytest.raises(AgentBusy):
                async with agent.run(ReplyModel()):
                    pass
            assert len([e async for e in stream]) == 3
            assert agent.is_running
        assert not agent.is_running
        assert agent.last_run_status == "completed"
        assert len(history) == 1
        assert [e.type for e in events] == ["text_delta", "message_end", "run_completed"]
        assert len(agent.messages) == 2
        unsubscribe()
        async with agent.run(ReplyModel(), messages=[*agent.messages, UserMessage("继续")]) as stream:
            async for _ in stream:
                pass
        assert len(agent.messages) == 4
        assert len(events) == 3
    asyncio.run(scenario())


def test_stop_cancels_model_and_agent_can_run_again():
    async def scenario():
        started = asyncio.Event()
        closed = asyncio.Event()
        class WaitingModel:
            async def stream(self, messages, *, tools=()):
                try:
                    started.set()
                    await asyncio.Event().wait()
                    yield ModelEvent("message_completed", "unreachable")
                finally:
                    closed.set()
        agent = Agent(ToolExecutor([]))
        async def consume():
            async with agent.run(WaitingModel(), messages=[UserMessage("等待")]) as stream:
                async for _ in stream:
                    pass
        task = asyncio.create_task(consume())
        await started.wait()
        agent.stop()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert closed.is_set()
        assert agent.last_run_status == "cancelled"
        assert not agent.is_running
        async with agent.run(ReplyModel()) as stream:
            async for _ in stream:
                pass
        assert agent.last_run_status == "completed"
    asyncio.run(scenario())


def test_unconsumed_run_releases_occupancy_without_emitting_messages():
    async def scenario():
        agent = Agent(ToolExecutor([]))
        events = []
        agent.subscribe(events.append)
        async with agent.run(ReplyModel(), messages=[UserMessage("hi")]):
            assert agent.is_running
        assert not events
        assert not agent.is_running
        assert agent.last_run_status == "cancelled"
    asyncio.run(scenario())


def test_cancelled_tool_results_reach_subscribers_and_state():
    from pydantic import BaseModel
    from agent.tools import AgentTool

    class Args(BaseModel):
        pass

    async def scenario():
        started = asyncio.Event()
        async def wait(call_id, args):
            started.set()
            await asyncio.Event().wait()
        class CallingModel:
            async def stream(self, messages, *, tools=()):
                yield ModelEvent("message_completed", "", (ToolCall("c1", "wait", "{}"),))
        agent = Agent(ToolExecutor([AgentTool("wait", "wait", Args, wait)]))
        recorded = []
        agent.subscribe(lambda event: recorded.append(event.message) if event.type == "message_end" else None)
        async def consume():
            async with agent.run(CallingModel(), messages=[UserMessage("wait")]) as stream:
                async for _ in stream:
                    pass
        task = asyncio.create_task(consume())
        await started.wait()
        agent.stop()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert [m.role for m in recorded] == ["assistant", "tool"]
        assert recorded[-1].tool_call_id == "c1"
        assert recorded[-1].is_error
        assert agent.messages[-1] == recorded[-1]
    asyncio.run(scenario())


def test_closing_display_stream_waits_for_model_cleanup():
    async def scenario():
        closed = asyncio.Event()
        class WaitingModel:
            async def stream(self, messages, *, tools=()):
                try:
                    yield ModelEvent("text_delta", "片段")
                    await asyncio.Event().wait()
                finally:
                    await asyncio.sleep(0)
                    closed.set()
        agent = Agent(ToolExecutor([]))
        events = []
        agent.subscribe(events.append)
        async with agent.run(WaitingModel(), messages=[UserMessage("hi")]) as stream:
            assert (await anext(stream)).text == "片段"
        assert closed.is_set()
        assert not agent.is_running
        assert agent.last_run_status == "cancelled"
        assert [event.type for event in events] == ["text_delta"]
    asyncio.run(scenario())


def test_model_failure_reaches_display_consumer_after_queued_text():
    from agent.model import ModelError

    async def scenario():
        class FailingModel:
            async def stream(self, messages, *, tools=()):
                yield ModelEvent("text_delta", "片段")
                raise ModelError("模型失败")
        agent = Agent(ToolExecutor([]))
        events = []
        agent.subscribe(events.append)
        async with agent.run(FailingModel(), messages=[UserMessage("hi")]) as stream:
            assert (await anext(stream)).text == "片段"
            with pytest.raises(ModelError, match="模型失败"):
                await anext(stream)
        assert [event.type for event in events] == ["text_delta"]
        assert agent.last_run_status == "failed"
        assert not agent.is_running
    asyncio.run(scenario())
