"""服务端会话归属、运行互斥和已完成结果保留；Agent 循环及 UI 流协议交给 SDK。"""
import asyncio
from contextlib import aclosing, asynccontextmanager
from copy import deepcopy
from datetime import UTC, datetime
from uuid import uuid4
from pathlib import Path
from threading import RLock
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
from typing import Literal
from assistant.journal import SessionJournal, SessionStorageError

from pydantic_ai import Agent, capture_run_messages
from pydantic_ai.messages import FunctionToolResultEvent, ModelMessagesTypeAdapter
from pydantic_ai.messages import ModelRequest, ModelResponse, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from pydantic_ai.ui.vercel_ai.request_types import SubmitMessage
from pydantic_ai.usage import UsageLimits

from assistant.context import PageContext, assistant_instructions, build_agent_messages
from assistant.model import public_model_error
from assistant.model import ModelSelection, supports_images, ConnectionError
from assistant.messages import MessageImage, Turn, SavedTurn
from assistant.tools import create_tools


class SessionBusy(Exception):
    pass


class CardState(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    bpm: int = Field(default=60, ge=40, le=240)
    answer_viewed: bool = False


class ChatSession:
    def __init__(self, journal: SessionJournal | None = None, owner: str = ""):
        self.journal = journal
        self.owner = owner
        self.created_at = datetime.now(UTC).isoformat()
        self.updated_at = self.created_at
        self.title = "新对话"
        self.model_selection: ModelSelection | None = None
        self.card_states: dict[str, dict] = {}
        self._save_lock = RLock()
        self.deleted = False
        self.id = uuid4().hex
        self.turns: list[Turn] = []
        self.is_running = False
        self._pending_images = False
        self.last_run_status = None

    def snapshot(self) -> dict:
        return {"id": self.id, "messages": [message for turn in self.turns for message in turn.ui_messages()],
                "is_running": self.is_running, "last_run_status": self.last_run_status,
                "title": self.title, "created_at": self.created_at, "updated_at": self.updated_at,
                "card_states": deepcopy(self.card_states),
                "model_selection": self.model_selection.model_dump() if self.model_selection else None}

    def save(self, record: dict):
        with self._save_lock:
            if self.deleted:
                raise SessionStorageError("对话已删除，请开始新对话。")
            timestamp = datetime.now(UTC).isoformat()
            if self.journal:
                self.journal.append(self.owner, self.id, {**record, "timestamp": timestamp})
            self.updated_at = timestamp

    def select_model(self, selection: ModelSelection):
        """持久化后续请求的模型；运行中的回答持有自己的模型实例。"""
        with self._save_lock:
            if (self._pending_images or any(turn.images for turn in self.turns)) and not supports_images(selection):
                raise ConnectionError("此对话包含图片，请选择支持图片的模型")
            if self.model_selection != selection:
                self.save({"type": "model_selection", "selection": selection.model_dump()})
                self.model_selection = selection

    async def checkpoint(self, turn: Turn):
        try:
            await asyncio.to_thread(self.save, {
                "type": "checkpoint", "user_id": turn.user_id, "status": self.last_run_status,
                "messages": ModelMessagesTypeAdapter.dump_python(turn.messages, mode="json"),
            })
        except SessionStorageError:
            self.last_run_status = "failed"
            raise

    def update_card(self, exercise_id: str, state: CardState):
        with self._save_lock:
            # 只接受本会话工具实际生成的练习；曝光状态不可逆。
            found = any(part.get("output", {}).get("generated_exercise", {}).get("id") == exercise_id
                        for message in self.snapshot()["messages"] for part in message["parts"]
                        if isinstance(part.get("output"), dict))
            if not found:
                raise KeyError(exercise_id)
            value = state.model_dump()
            value["answer_viewed"] |= self.card_states.get(exercise_id, {}).get("answer_viewed", False)
            if self.card_states.get(exercise_id) != value:
                self.save({"type": "card_state", "exercise_id": exercise_id, "state": value})
                self.card_states[exercise_id] = value
            return value

    @asynccontextmanager
    async def run(self, text: str, model: Model, page_context: PageContext | None = None, *, message_id: str, expected_selection: ModelSelection | None = None, images: list[MessageImage] | None = None):
        if self.is_running:
            raise SessionBusy("当前会话正在运行，请等待完成或停止后再发送。")
        if any(turn.user_id == message_id for turn in self.turns):
            raise SessionBusy("这条消息已被接受，请同步会话，不要重复发送。")
        if (images or any(previous.images for previous in self.turns)) and not supports_images(expected_selection or self.model_selection):
            raise ConnectionError("请选择支持图片的模型")
        turn = Turn(message_id, text, page_context.model_copy(deep=True) if page_context else None, images=list(images or []))
        history = [message for previous in self.turns for message in [previous.user_message(), *previous.messages]]
        history.append(turn.user_message())
        agent = Agent(model, instructions=assistant_instructions(), tools=create_tools(), retries=2,
                      model_settings={"parallel_tool_calls": False,
                                      "openai_store": False, "openai_send_reasoning_ids": True})
        adapter = VercelAIAdapter(agent, run_input=SubmitMessage(id=self.id, messages=[]), sdk_version=7,
                                 server_message_id=turn.assistant_id)

        with self._save_lock:
            if self.deleted:
                raise SessionStorageError("对话已删除，请开始新对话。")
            if self.is_running:
                raise SessionBusy("当前会话正在运行，请等待完成")
            if expected_selection is not None and self.model_selection != expected_selection:
                raise SessionBusy("模型选择已更新，请同步对话后重新发送")
            self.is_running = True
            self._pending_images = bool(images)
        interrupted = False
        write = asyncio.create_task(asyncio.to_thread(self.save, {"type": "turn_started", "turn": {
                "user_id": turn.user_id, "text": text, "images": [image.model_dump() for image in turn.images],
                "page_context": page_context.model_dump() if page_context else None,
                "assistant_id": turn.assistant_id, "created_at": turn.created_at,
            }}))
        try:
            try:
                await asyncio.shield(write)
            except asyncio.CancelledError:
                # 写盘线程不能取消：等待接受结果，避免磁盘与内存出现不同的轮次。
                await write
                interrupted = True
        except BaseException:
            self._pending_images = False
            self.is_running = False
            raise
        if not self.turns:
            self.title = text.strip().replace("\n", " ")[:60] or "图片对话"
        self.turns.append(turn)
        self._pending_images = False
        self.last_run_status = "running"
        if interrupted:
            self.last_run_status = "cancelled"
            try:
                await self.checkpoint(turn)
            finally:
                self.is_running = False
            raise asyncio.CancelledError

        completed_tools = {}

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
                                    completed_tools[event.part.part_kind, event.tool_call_id] = deepcopy(event.part)
                                    retain(captured)
                                    await self.checkpoint(turn)
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
                    await self.checkpoint(turn)

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
            # 工具结果事件早于 SDK 把结果追加到历史。先补齐已完成结果，保证
            # 卡片发给浏览器之前已经落盘；SDK 历史追上后按调用 ID 去重。
            recorded = {(part.part_kind, getattr(part, "tool_call_id", None))
                        for message in turn.messages for part in message.parts}
            missing = [part for key, part in completed_tools.items() if key not in recorded]
            if missing:
                turn.messages.append(ModelRequest(parts=deepcopy(missing), run_id=turn.assistant_id))

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
                try:
                    await self.checkpoint(turn)
                finally:
                    self.is_running = False
            self.is_running = False


class SessionStore:
    """单进程会话存储；活跃会话共享运行锁，JSONL 是重启后的恢复依据。

    directory=None 仅用于独立单元测试。生产必须提供持久化目录。
    """
    def __init__(self, directory: Path | None = None):
        self.journal = SessionJournal(directory) if directory else None
        self._sessions: dict[tuple[str, str], ChatSession] = {}
        self._lock = RLock()

    def close(self):
        if self.journal:
            self.journal.close()

    def create(self, owner: str = "", selection: ModelSelection | None = None) -> ChatSession:
        with self._lock:
            session = ChatSession(self.journal, owner)
            session.model_selection = selection
            if self.journal:
                self.journal.append(owner, session.id, {"type": "session", "version": 1,
                    "id": session.id, "owner": owner, "created_at": session.created_at,
                    "model_selection": selection.model_dump() if selection else None}, create=True)
            self._sessions[owner, session.id] = session
            return session

    def get(self, session_id: str, owner: str = "") -> ChatSession:
        with self._lock:
            key = owner, session_id
            if key in self._sessions:
                return self._sessions[key]
            if not self.journal:
                raise KeyError(session_id)
            records = self.journal.read(owner, session_id)
            try:
                header, *entries = records
                if header["type"] != "session" or header["version"] != 1 or header["id"] != session_id or header["owner"] != owner:
                    raise ValueError()
                session = ChatSession(self.journal, owner)
                if header.get("model_selection"):
                    session.model_selection = ModelSelection.model_validate(header["model_selection"])
                session.id = session_id
                session.created_at = session.updated_at = header["created_at"]
                for entry in entries:
                    session.updated_at = entry["timestamp"]
                    match entry["type"]:
                        case "turn_started":
                            saved = SavedTurn.model_validate(entry["turn"])
                            if any(turn.user_id == saved.user_id for turn in session.turns):
                                raise ValueError()
                            turn = Turn(**saved.model_dump(exclude={"page_context", "images"}), page_context=saved.page_context, images=saved.images)
                            if not session.turns:
                                session.title = (turn.text.strip().replace("\n", " ")[:60] or "图片对话")
                            session.turns.append(turn)
                            session.last_run_status = "running"
                        case "checkpoint":
                            if not session.turns or session.turns[-1].user_id != entry["user_id"]:
                                raise ValueError()
                            session.turns[-1].messages = ModelMessagesTypeAdapter.validate_python(entry["messages"])
                            session.last_run_status = TypeAdapter(Literal["running", "completed", "failed", "cancelled"]).validate_python(entry["status"])
                        case "model_selection":
                            session.model_selection = ModelSelection.model_validate(entry["selection"])
                        case "card_state":
                            session.card_states[entry["exercise_id"]] = CardState.model_validate(entry["state"]).model_dump()
                        case _:
                            raise ValueError()
                if session.model_selection is None:
                    # Older journals lack an explicit choice; recover the last actual model,
                    # never the global default which may since have changed.
                    previous = next((message for turn in reversed(session.turns) for message in reversed(turn.messages)
                                     if isinstance(message, ModelResponse) and message.model_name), None)
                    if previous and (previous.model_name.startswith("deepseek") or previous.provider_name in ("deepseek", "openai")):
                        provider = "deepseek" if previous.model_name.startswith("deepseek") or previous.provider_name == "deepseek" else "chatgpt"
                        session.model_selection = ModelSelection(provider=provider, model=previous.model_name)
                if session.last_run_status == "running":
                    session.last_run_status = "cancelled"
                    session.save({"type": "checkpoint", "user_id": session.turns[-1].user_id,
                        "status": "cancelled", "messages": ModelMessagesTypeAdapter.dump_python(session.turns[-1].messages, mode="json")})
            except (KeyError, ValueError, TypeError, ValidationError):
                raise SessionStorageError("对话格式不受支持或记录损坏，原文件已保留。") from None
            self._sessions[key] = session
            return session

    def list(self, owner: str, *, offset: int = 0, limit: int = 30) -> dict:
        with self._lock:
            ids = self.journal.ids(owner) if self.journal else [sid for who, sid in self._sessions if who == owner]
            summaries = []
            for sid in ids:
                try:
                    session = self.get(sid, owner)
                    if not session.turns:
                        continue
                    summaries.append({"id": sid, "title": session.title, "updated_at": session.updated_at,
                        "is_running": session.is_running, "unreadable": False})
                except SessionStorageError:
                    summaries.append({"id": sid, "title": "无法读取的对话", "updated_at": "", "is_running": False, "unreadable": True})
            summaries.sort(key=lambda item: item["updated_at"], reverse=True)
            return {"sessions": summaries[offset:offset + limit], "total": len(summaries)}

    def delete(self, session_id: str, owner: str):
        with self._lock:
            current = self._sessions.get((owner, session_id))
            with current._save_lock if current else RLock():
                if current and current.is_running:
                    raise SessionBusy("请等待本轮结束后删除对话。")
                if self.journal:
                    self.journal.delete(owner, session_id)
                elif current is None:
                    raise KeyError(session_id)
                if current:
                    current.deleted = True
                self._sessions.pop((owner, session_id), None)
