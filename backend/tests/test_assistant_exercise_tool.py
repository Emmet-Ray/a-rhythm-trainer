"""模拟调用生成练习工具，验证结果与会话归属，不访问模型服务。"""

import asyncio
import json

import pytest

from pydantic_ai import ModelRetry
from assistant.tools import create_tools


def invoke(arguments):
    return asyncio.run(create_tools()[0].function(**arguments))


def arguments():
    return {"title": "稳定四拍", "description": "全音符练习", "exercise": {
        "timeSignature": {"beats": 4, "beatType": 4},
        "measures": [{"elements": [{"kind": "note", "noteValue": "whole"}]}],
    }}


def test_tool_returns_result_without_session_storage():
    result = invoke(arguments())
    saved = result["generated_exercise"]
    assert saved["title"] == "稳定四拍"
    assert saved["exercise"] == arguments()["exercise"]


def test_invalid_rhythm_returns_error_and_can_be_corrected():
    bad = arguments()
    bad["exercise"]["measures"][0]["elements"][0]["noteValue"] = "quarter"
    with pytest.raises(ModelRetry, match="第 1 小节"):
        invoke(bad)
    assert invoke(arguments())["generated_exercise"]


def test_invalid_metadata_does_not_echo_input():
    with pytest.raises(ModelRetry) as error:
        invoke({**arguments(), "title": ["PRIVATE_INPUT"]})
    assert "PRIVATE_INPUT" not in str(error.value)


def test_programming_error_propagates(monkeypatch):
    def broken(_):
        raise RuntimeError("unexpected failure")
    monkeypatch.setattr("assistant.tools.propose_rhythm_exercise.GeneratedExercise", broken)
    with pytest.raises(RuntimeError):
        invoke(arguments())
