"""进程内聊天会话。历史由后端持有；不涉及登录会话、HTTP 或磁盘存储。

运行使用不可变消息快照，完整回答在向外通知前写入历史。失败或取消保留
已接受的用户消息，不记录部分回答。同一会话的占用覆盖整个响应生命周期。
"""

from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import aclosing, asynccontextmanager
from dataclasses import dataclass, field
from typing import Literal
from uuid import uuid4

from agent.agent import Agent, AgentBusy
from agent.events import AgentEvent, RunEvent
from agent.tools import ToolExecutor, ToolResult
from assistant.tools import create_tools
from agent.model import TextModel
from assistant.context import PageContext, build_agent_messages
from assistant.records import AssistantEntry, ToolResultEntry, SessionEntry, UserEntry, entry_snapshot

# 保持 HTTP 层既有异常接口，运行互斥由 Agent 统一负责。
SessionBusy = AgentBusy


@dataclass(frozen=True)
class SessionEvent:
    """面向界面的文字增量或本轮回答完成事件。"""

    type: Literal["text_delta", "message_completed"]
    text: str


@dataclass(frozen=True)
class EntryAdded:
    """已提交记录及其稳定会话索引；流与会话查询共用同一种快照。"""

    entry: dict
    index: int
    type: Literal["entry_added"] = field(default="entry_added", init=False)


class ChatSession:
    def __init__(self):
        self.id = uuid4().hex
        self._entries: list[SessionEntry] = []
        self.agent = Agent(ToolExecutor(create_tools()))
        self.agent.subscribe(self._record_message)

    def snapshot(self) -> dict:
        """返回独立的显示数据；调用方不能通过修改快照改写会话。"""
        return {
            "id": self.id,
            "entries": [entry_snapshot(entry) for entry in self._entries],
            "is_running": self.agent.is_running,
            "last_run_status": self.agent.last_run_status,
        }

    @asynccontextmanager
    async def run(
        self, text: str, model: TextModel, page_context: PageContext | None = None,
    ) -> AsyncGenerator[AsyncIterator[SessionEvent | EntryAdded], None]:
        entry = UserEntry(text, page_context)
        messages = build_agent_messages([*self._entries, entry])
        async with self.agent.run(model, messages=messages) as stream:
            # 成功取得运行占用后才接受输入；投影不会重发旧消息事件。
            self._entries.append(entry)
            async with aclosing(self._display_events(stream)) as display:
                yield display

    async def _display_events(self, stream: AsyncIterator[RunEvent]) -> AsyncGenerator[SessionEvent | EntryAdded, None]:
        cursor = len(self._entries) - 1
        yield EntryAdded(entry_snapshot(self._entries[cursor]), cursor)
        cursor += 1
        async for event in stream:
            if event.type == "message_end":
                # 每个消息事件对应一条已提交记录；不要读取可能已领先的最新记录。
                yield EntryAdded(entry_snapshot(self._entries[cursor]), cursor)
                cursor += 1
            else:
                yield SessionEvent("message_completed" if event.type == "run_completed" else "text_delta", event.text)

    def _record_message(self, event: AgentEvent):
        if event.type != "message_end":
            return
        message = event.message
        if message.role == "assistant":
            self._entries.append(AssistantEntry(message.content, message.tool_calls, message.provider_metadata))
        elif message.role == "tool":
            self._entries.append(ToolResultEntry(
                message.tool_call_id, message.tool_name,
                ToolResult(message.content, message.details, message.is_error),
            ))


class SessionStore:
    """每个应用实例独立；仅支持单 worker，重启后会话失效。"""

    def __init__(self):
        self._sessions: dict[str, ChatSession] = {}

    def create(self) -> ChatSession:
        session = ChatSession()
        self._sessions[session.id] = session
        return session

    def get(self, session_id: str) -> ChatSession:
        return self._sessions[session_id]
