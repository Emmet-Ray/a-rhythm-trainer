"""通用工具执行器不依赖节奏业务、会话或模型厂商。"""

import asyncio

import pytest
from pydantic import BaseModel, ConfigDict

from agent.tools import AgentTool, ToolExecutor, ToolResult
from assistant.tools.propose_rhythm_exercise import create_propose_rhythm_exercise_tool


class SearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    query: str


def test_unrelated_async_tool_and_rhythm_tool_share_executor():
    calls = []
    async def search(call_id, args):
        await asyncio.sleep(0)
        calls.append((call_id, args.query))
        return ToolResult("搜索摘要", details={"links": ["example"]})
    executor = ToolExecutor([
        AgentTool("search", "搜索资料", SearchInput, search),
        create_propose_rhythm_exercise_tool(),
    ])
    definitions = executor.definitions()
    assert [item["name"] for item in definitions] == ["search", "propose_rhythm_exercise"]
    assert definitions[0]["parameters"]["required"] == ["query"]
    definitions[0]["parameters"].clear()
    assert executor.definitions()[0]["parameters"]["required"] == ["query"]
    result = asyncio.run(executor.execute("search-1", "search", {"query": "切分音"}))
    assert calls == [("search-1", "切分音")]
    assert result.content == "搜索摘要"
    assert result.details == {"links": ["example"]}
    assert not result.is_error


def test_unknown_tool_and_invalid_arguments_do_not_execute():
    async def forbidden(*args):
        pytest.fail("非法调用不应执行工具")
    executor = ToolExecutor([AgentTool("search", "搜索", SearchInput, forbidden)])
    for name, arguments in [("missing", {}), ("search", {"query": 123}), ("search", {})]:
        assert asyncio.run(executor.execute("id", name, arguments)).is_error


def test_duplicate_names_rejected():
    async def execute(*args):
        return ToolResult("ok")
    tool = AgentTool("search", "搜索", SearchInput, execute)
    with pytest.raises(ValueError, match="重复"):
        ToolExecutor([tool, tool])


def test_cancellation_propagates_into_async_tool():
    async def scenario():
        started = asyncio.Event()
        cleaned = []
        async def execute(call_id, args):
            try:
                started.set()
                await asyncio.Event().wait()
            finally:
                cleaned.append(True)
        executor = ToolExecutor([AgentTool("search", "搜索", SearchInput, execute)])
        task = asyncio.create_task(executor.execute("id", "search", {"query": "节奏"}))
        await started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cleaned == [True]
    asyncio.run(scenario())
