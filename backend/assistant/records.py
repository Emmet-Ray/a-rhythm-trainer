"""会话记录及其对外快照；记录时间属于会话，提供方元数据不暴露给界面。"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from agent.messages import ProviderMetadata, ToolCall
from agent.tools import ToolResult

if TYPE_CHECKING:
    from assistant.context import PageContext


@dataclass(frozen=True)
class UserEntry:
    text: str
    page_context: PageContext | None
    # 后端接受这次输入的时间，不是浏览器采集快照的时间。
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC), init=False)

    def __post_init__(self):
        # frozen 只保护字段绑定；嵌套页面数据必须复制，不能与提交方共享。
        if self.page_context is not None:
            object.__setattr__(self, "page_context", self.page_context.model_copy(deep=True))


@dataclass(frozen=True)
class AssistantEntry:
    text: str
    tool_calls: tuple[ToolCall, ...] = ()
    provider_metadata: ProviderMetadata | None = None
    # 完整回答写入会话时生成，流式片段不会创建记录。
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC), init=False)

    def __post_init__(self):
        object.__setattr__(self, "provider_metadata", deepcopy(self.provider_metadata))


@dataclass(frozen=True)
class ToolResultEntry:
    tool_call_id: str
    tool_name: str
    result: ToolResult
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC), init=False)

    def __post_init__(self):
        object.__setattr__(self, "result", deepcopy(self.result))


SessionEntry = UserEntry | AssistantEntry | ToolResultEntry


def entry_snapshot(entry: SessionEntry) -> dict:
    common = {"created_at": entry.created_at.isoformat()}
    if isinstance(entry, UserEntry):
        return {**common, "type": "user", "text": entry.text,
                "page_context": entry.page_context.model_dump() if entry.page_context else None}
    if isinstance(entry, AssistantEntry):
        return {**common, "type": "assistant", "text": entry.text,
                **({"tool_calls": [asdict(call) for call in entry.tool_calls]} if entry.tool_calls else {})}
    return {**common, "type": "tool_result", "tool_call_id": entry.tool_call_id,
            "tool_name": entry.tool_name, "content": entry.result.content,
            "details": deepcopy(entry.result.details), "is_error": entry.result.is_error}
