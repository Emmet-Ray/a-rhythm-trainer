"""Agent 对外事件；消息完成与整次运行完成是不同的事件。"""

from dataclasses import dataclass, field
from typing import Literal

from agent.messages import GeneratedMessage


@dataclass(frozen=True)
class TextDelta:
    text: str
    type: Literal["text_delta"] = field(default="text_delta", init=False)


@dataclass(frozen=True)
class MessageEnd:
    message: GeneratedMessage
    type: Literal["message_end"] = field(default="message_end", init=False)


@dataclass(frozen=True)
class RunCompleted:
    text: str
    type: Literal["run_completed"] = field(default="run_completed", init=False)


RunEvent = TextDelta | MessageEnd | RunCompleted
AgentEvent = RunEvent
