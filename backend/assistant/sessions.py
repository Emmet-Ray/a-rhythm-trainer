"""进程内聊天会话。历史由后端持有；不涉及登录会话、HTTP 或磁盘存储。

运行使用不可变消息快照，完整回答在向外通知前写入历史。失败或取消保留
已接受的用户消息，不记录部分回答。同一会话的占用覆盖整个响应生命周期。
"""

from collections.abc import AsyncIterator
from contextlib import aclosing, asynccontextmanager
from uuid import uuid4

from assistant.model import Message, ModelError, ModelEvent, TextModel
from assistant.context import AssistantEntry, PageContext, SessionEntry, UserEntry, build_model_messages


class SessionBusy(Exception):
    pass


class ChatSession:
    def __init__(self):
        self.id = uuid4().hex
        self._entries: list[SessionEntry] = []
        self._running = False
        self._last_run_status: str | None = None

    def snapshot(self) -> dict:
        """返回独立的显示数据；调用方不能通过修改快照改写会话。"""
        return {
            "id": self.id,
            "entries": [
                {"type": "user", "text": entry.text, "created_at": entry.created_at.isoformat(),
                 "page_context": entry.page_context.model_dump() if entry.page_context is not None else None}
                if isinstance(entry, UserEntry) else {
                    "type": "assistant", "text": entry.text, "created_at": entry.created_at.isoformat(),
                }
                for entry in self._entries
            ],
            "is_running": self._running,
            "last_run_status": self._last_run_status,
        }

    @asynccontextmanager
    async def run(
        self, text: str, model: TextModel, page_context: PageContext | None = None,
    ) -> AsyncIterator[AsyncIterator[ModelEvent]]:
        # 检查与占用之间没有 await：单进程事件循环中不会插入另一次提交。
        if self._running:
            raise SessionBusy("当前会话正在运行，请等待完成或停止后再发送。")
        entry = UserEntry(text, page_context)
        self._running = True
        self._last_run_status = "running"
        self._entries.append(entry)
        try:
            messages = build_model_messages(self._entries)
            async with aclosing(self._respond(messages, model)) as stream:
                yield stream
        finally:
            # 包括响应尚未开始消费就断连的情况。完整回答一旦提交，不回滚。
            if self._last_run_status == "running":
                self._last_run_status = "cancelled"
            self._running = False

    async def _respond(self, messages: tuple[Message, ...], model: TextModel) -> AsyncIterator[ModelEvent]:
        try:
            async with aclosing(model.stream(messages)) as stream:
                async for event in stream:
                    if event.type == "message_completed":
                        if not event.text.strip():
                            raise ModelError("模型未返回完整的文字回答，请重试。")
                        self._entries.append(AssistantEntry(event.text))
                        self._last_run_status = "completed"
                        yield event
                        return
                    yield event
            raise ModelError("模型连接提前结束，请重试。")
        except Exception:
            self._last_run_status = "failed"
            raise


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
