"""模拟调用生成练习工具，验证结果与会话归属，不访问模型服务。"""

import asyncio
import json

import pytest

from agent.tools import ToolExecutor
from assistant.tools import create_tools


def invoke(arguments):
    return asyncio.run(ToolExecutor(create_tools()).execute("call-1", "propose_rhythm_exercise", arguments))


def arguments():
    return {"title": "稳定四拍", "description": "全音符练习", "exercise": {
        "timeSignature": {"beats": 4, "beatType": 4},
        "measures": [{"elements": [{"kind": "note", "noteValue": "whole"}]}],
    }}


def test_tool_returns_result_without_session_storage():
    result = invoke(arguments())
    saved = result.details["generated_exercise"]
    assert not result.is_error
    assert json.loads(result.content) == {"exercise_id": saved["id"], "title": "稳定四拍", "mode": "tapping"}
    assert saved["exercise"] == arguments()["exercise"]


def test_invalid_rhythm_returns_error_and_can_be_corrected():
    bad = arguments()
    bad["exercise"]["measures"][0]["elements"][0]["noteValue"] = "quarter"
    result = invoke(bad)
    assert result.is_error
    assert "第 1 小节" in result.content
    assert result.details == {}
    assert not invoke(arguments()).is_error


def test_invalid_metadata_does_not_echo_input():
    result = invoke({**arguments(), "title": ["PRIVATE_INPUT"]})
    assert result.is_error
    assert "PRIVATE_INPUT" not in result.content


def test_programming_error_propagates(monkeypatch):
    def broken(_):
        raise RuntimeError("unexpected failure")
    monkeypatch.setattr("assistant.tools.propose_rhythm_exercise.GeneratedExercise", broken)
    with pytest.raises(RuntimeError):
        invoke(arguments())
