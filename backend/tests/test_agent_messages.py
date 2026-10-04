"""消息边界：角色字段、提供方私有数据及通用包的独立性。"""

import subprocess
import sys
from pathlib import Path

import pytest

from agent.messages import AssistantMessage, ProviderMetadata, ToolCall, ToolResultMessage, UserMessage
from agent.model import responses_input


def test_role_specific_fields_and_required_tool_identity():
    with pytest.raises(TypeError):
        UserMessage("hi", tool_call_id="c1")
    with pytest.raises(TypeError):
        ToolResultMessage("result")
    assert ToolResultMessage("result", "c1", "search").role == "tool"


def test_provider_metadata_is_only_replayed_by_its_owner():
    call = ToolCall("c1", "search", '{"q":"rhythm"}')
    message = AssistantMessage("", (call,), ProviderMetadata("another-provider", {"private": "opaque"}))
    assert responses_input([message]) == [
        {"type": "function_call", "call_id": "c1", "name": "search", "arguments": call.arguments},
    ]
    result = ToolResultMessage("summary", "c1", "search", details={"ui_only": True})
    assert responses_input([result]) == [
        {"type": "function_call_output", "call_id": "c1", "output": "summary"},
    ]


def test_generic_agent_imports_without_loading_assistant_or_domain():
    result = subprocess.run(
        [sys.executable, "-c", "import agent.agent, sys; "
         "assert not any(n == 'assistant' or n.startswith('assistant.') "
         "or n == 'domain' or n.startswith('domain.') for n in sys.modules)"],
        cwd=Path(__file__).parents[1], capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
