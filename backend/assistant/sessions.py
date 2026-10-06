"""服务端会话归属、运行互斥和已完成结果保留；Agent 循环及 UI 流协议交给 SDK。"""
import asyncio
from contextlib import aclosing, asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from pydantic_ai import Agent, capture_run_messages
from pydantic_ai.messages import FunctionToolResultEvent
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from pydantic_ai.ui.vercel_ai.request_types import SubmitMessage
from pydantic_ai.usage import UsageLimits

from assistant.context import PageContext, assistant_instructions, build_agent_messages
from assistant.model import public_model_error
from assistant.tools import create_tools


class SessionBusy(Exception):
    pass


@dataclass
class Turn:
    user_id: str
    text: str
    page_context: PageContext | None
    assistant_id: str = field(default_factory=lambda: uuid4().hex)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    messages: list[ModelMessage] = field(default_factory=list)

    def user_message(self) -> ModelRequest:
        return ModelRequest(parts=[UserPromptPart(self.text)], metadata={
            "page_context": self.page_context.model_dump() if self.page_context else None,
        })

    def ui_messages(self) -> list[dict]:
        user = {"id": self.user_id, "role": "user", "parts": [{"type": "text", "text": self.text}],
                "metadata": {"created_at": self.created_at,
                             "page_context": self.page_context.model_dump() if self.page_context else None}}
        # SDK 按模型步骤导出；浏览器按一轮回复呈现。合并 parts 保留 text/tool/step 的顺序和稳定 id。
        messages = VercelAIAdapter.dump_messages(self.messages, sdk_version=7)
        parts = []
        for message in messages:
            if message.role == "assistant":
                parts.extend([{"type": "step-start"}, *[
                    part.model_dump(mode="json", by_alias=True, exclude_none=True) for part in message.parts if part.type != "reasoning"
                ]])
        return [user, *([{"id": self.assistant_id, "role": "assistant", "parts": parts,
                         "metadata": {"created_at": self.created_at}}] if parts else [])]


class ChatSession:
    def __init__(self):
        self.id = uuid4().hex
        self.turns: list[Turn] = []
        self.is_running = False
        self.last_run_status = None

    def snapshot(self) -> dict:
        return {"id": self.id, "messages": [message for turn in self.turns for message in turn.ui_messages()],
                "is_running": self.is_running, "last_run_status": self.last_run_status}

    @asynccontextmanager
    async def run(self, text: str, model: Model, page_context: PageContext | None = None, *, message_id: str):
        if self.is_running:
            raise SessionBusy("当前会话正在运行，请等待完成或停止后再发送。")
        if any(turn.user_id == message_id for turn in self.turns):
            raise SessionBusy("这条消息已被接受，请同步会话，不要重复发送。")
        turn = Turn(message_id, text, page_context.model_copy(deep=True) if page_context else None)
        history = [message for previous in self.turns for message in [previous.user_message(), *previous.messages]]
        history.append(turn.user_message())
        agent = Agent(model, instructions=assistant_instructions(), tools=create_tools(), retries=2,
                      model_settings={"max_tokens": 2048, "parallel_tool_calls": False,
                                      "openai_store": False, "openai_send_reasoning_ids": True})
        adapter = VercelAIAdapter(agent, run_input=SubmitMessage(id=self.id, messages=[]), sdk_version=7,
                                 server_message_id=turn.assistant_id)

        self.turns.append(turn)
        self.is_running = True
        self.last_run_status = "running"

        async def native():
            with capture_run_messages() as captured:
                try:
                    async with asyncio.timeout(120):
                        async with aclosing(adapter.run_stream_native(
                            message_history=build_agent_messages(history), run_id=turn.assistant_id,
                            usage_limits=UsageLimits(request_limit=9, tool_calls_limit=8),
                        )) as events:
                            async for event in events:
                                # 已完成步骤即时保留，后续模型失败或断连也不会丢失工具结果。
                                if isinstance(event, FunctionToolResultEvent):
                                    retain(captured)
                                yield event
                    self.last_run_status = "completed"
                except asyncio.CancelledError:
                    self.last_run_status = "cancelled"
                    raise
                except Exception as error:
                    self.last_run_status = "failed"
                    raise RuntimeError(public_model_error(error)) from None
                finally:
                    retain(captured)

        def retain(captured):
            # SDK 会修复中断历史，消息数量可能变化；用 run_id 归属新步骤，不能按输入长度切片。
            # 用户输入由 Turn 保存；中断的模型消息不作为正式回复，已执行工具结果保留。
            turn.messages = deepcopy([
                message for message in captured
                if message.run_id == turn.assistant_id
                and not (isinstance(message, ModelRequest)
                         and any(isinstance(part, UserPromptPart) for part in message.parts))
                and (not isinstance(message, ModelResponse) or message.state == "complete")
            ])

        try:
            async with aclosing(adapter.transform_stream(native())) as stream:
                # 推理仅在模型历史中回传；浏览器只消费文字和业务工具结果。
                async def visible():
                    async for chunk in stream:
                        if not chunk.type.startswith("reasoning-"):
                            yield chunk
                yield adapter.streaming_response(visible())
        finally:
            if self.last_run_status == "running":
                self.last_run_status = "cancelled"
            self.is_running = False


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
