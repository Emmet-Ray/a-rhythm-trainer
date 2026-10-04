"""可独立使用的 Agent：消息状态、运行生命周期与同步事件订阅。"""

import asyncio
from collections.abc import AsyncGenerator, AsyncIterator, Callable, Sequence
from contextlib import aclosing, asynccontextmanager
from copy import deepcopy

from agent.loop import run_agent
from agent.messages import Message
from agent.events import AgentEvent, RunEvent
from agent.model import ModelError, TextModel
from agent.tools import ToolExecutor


class AgentBusy(Exception):
    pass


class Agent:
    def __init__(self, tools: ToolExecutor):
        self._tools = tools
        self._messages: list[Message] = []
        self._listeners: list[Callable[[AgentEvent], None]] = []
        self._task: asyncio.Task | None = None
        self._running = False
        self._last_run_status: str | None = None

    @property
    def messages(self) -> tuple[Message, ...]:
        return tuple(deepcopy(self._messages))

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def last_run_status(self) -> str | None:
        return self._last_run_status

    def subscribe(self, listener: Callable[[AgentEvent], None]) -> Callable[[], None]:
        """监听状态更新后的事件。监听器同步执行；异常使运行失败，不静默丢失记录。"""
        self._listeners.append(listener)
        def unsubscribe():
            if listener in self._listeners:
                self._listeners.remove(listener)
        return unsubscribe

    def _process_event(self, event: AgentEvent):
        """唯一的 loop 事件入口：先更新状态，再通知订阅者。"""
        if event.type == "message_end":
            self._messages.append(deepcopy(event.message))
        elif event.type == "run_completed":
            self._last_run_status = "completed"
        for listener in tuple(self._listeners):
            listener(deepcopy(event))

    def stop(self):
        """请求取消当前 loop 任务；调用方仍需等待运行上下文退出后再启动下一次。"""
        if self._task is not None:
            self._task.cancel()

    @asynccontextmanager
    async def run(
        self, model: TextModel, *, messages: Sequence[Message] | None = None,
    ) -> AsyncGenerator[AsyncIterator[RunEvent], None]:
        """占用 Agent 并运行。可提供完整上下文替换当前消息；替换不重发历史事件。

        未提供上下文则从已有消息继续。占用持续到调用方退出上下文，
        即使流尚未消费或最终事件已经产生，也不允许交叠运行。
        """
        if self._running:
            raise AgentBusy("当前会话正在运行，请等待完成或停止后再发送。")
        if messages is not None:
            self._messages = list(deepcopy(messages))
        self._running = True
        self._last_run_status = "running"
        try:
            async with aclosing(self._respond(model)) as stream:
                yield stream
        finally:
            if self._last_run_status == "running":
                self._last_run_status = "cancelled"
            self._running = False

    async def _respond(self, model: TextModel) -> AsyncGenerator[RunEvent, None]:
        # 回调产生事件，HTTP 拉取事件；队列只做这两种消费方式的适配。
        # 仅缓存显示事件，完整消息由同步订阅立即记录，不依赖前端继续读取。
        queue: asyncio.Queue[RunEvent | None] = asyncio.Queue()

        def forward(event: AgentEvent):
            if event.type != "message_end":
                queue.put_nowait(event)

        unsubscribe = self.subscribe(forward)
        task = asyncio.create_task(self._execute(model))
        self._task = task
        task.add_done_callback(lambda _: queue.put_nowait(None))
        try:
            while (event := await queue.get()) is not None:
                yield event
            # 结束信号只负责唤醒；异常和取消由任务本身传播。
            await task
        finally:
            if not task.done():
                task.cancel()
            try:
                # 收齐工具中断结果、关闭模型连接后才能释放运行占用。
                await asyncio.gather(task, return_exceptions=True)
            finally:
                unsubscribe()
                self._task = None

    async def _execute(self, model: TextModel) -> None:
        try:
            async with asyncio.timeout(120):
                await run_agent(self._messages, model, self._tools, emit=self._process_event)
        except TimeoutError as error:
            self._last_run_status = "failed"
            raise ModelError("助手运行超时，请稍后继续。") from error
        except Exception:
            self._last_run_status = "failed"
            raise
