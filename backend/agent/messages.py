"""运行与模型适配共享的消息协议；各角色只携带自己的字段。"""

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: str  # 原始 JSON；解析失败需要作为工具结果反馈给模型。


@dataclass(frozen=True)
class ProviderMetadata:
    """提供方续接所需的私有数据。只有匹配 provider 的适配器解释 payload。"""

    provider: str
    payload: dict


@dataclass(frozen=True)
class SystemMessage:
    content: str
    role: Literal["system"] = field(default="system", init=False)


@dataclass(frozen=True)
class UserMessage:
    content: str
    role: Literal["user"] = field(default="user", init=False)


@dataclass(frozen=True)
class AssistantMessage:
    content: str
    tool_calls: tuple[ToolCall, ...] = ()
    provider_metadata: ProviderMetadata | None = None
    role: Literal["assistant"] = field(default="assistant", init=False)


@dataclass(frozen=True)
class ToolResultMessage:
    content: str
    tool_call_id: str
    tool_name: str
    details: dict = field(default_factory=dict)
    is_error: bool = False
    role: Literal["tool"] = field(default="tool", init=False)


Message = SystemMessage | UserMessage | AssistantMessage | ToolResultMessage
GeneratedMessage = AssistantMessage | ToolResultMessage
