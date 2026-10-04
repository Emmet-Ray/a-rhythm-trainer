"""模型 → 工具 → 模型的顺序循环；维护本次上下文并通知完整消息。"""

import json
from collections.abc import Callable, Sequence
from contextlib import aclosing

from copy import deepcopy

from agent.messages import AssistantMessage, GeneratedMessage, Message, ToolResultMessage
from agent.events import AgentEvent, MessageEnd, TextDelta, RunCompleted
from agent.model import ModelError, TextModel
from agent.tools import ToolExecutor, ToolResult


async def run_agent(
    messages: Sequence[Message], model: TextModel, tools: ToolExecutor, *,
    emit: Callable[[AgentEvent], None], max_tool_calls: int = 8,
) -> None:
    """所有事件通过 emit 通知调用方；本函数只推进运行，不提供第二条输出路径。

    中断或异常时补齐尚未完成的工具结果，避免下一次请求携带悬空调用。
    已完成的结果不回滚；对结果未知的副作用不自动重试。
    """
    context = list(deepcopy(messages))

    def record(message: GeneratedMessage):
        context.append(message)
        emit(MessageEnd(deepcopy(message)))

    used = 0
    text_parts = []
    while True:
        async with aclosing(model.stream(tuple(deepcopy(context)), tools=tools.definitions())) as stream:
            async for event in stream:
                if event.type == "text_delta":
                    emit(TextDelta(event.text))
                    continue
                if not event.text.strip() and not event.tool_calls:
                    raise ModelError("模型未返回完整的文字回答，请重试。")
                known_ids = {call.id for item in context if isinstance(item, AssistantMessage) for call in item.tool_calls}
                ids = [call.id for call in event.tool_calls]
                if any(not call.id or not call.name or call.id in known_ids for call in event.tool_calls) or len(ids) != len(set(ids)):
                    raise ModelError("模型返回了重复或无效的工具调用标识。")
                break
            else:
                raise ModelError("模型连接提前结束，请重试。")
        record(AssistantMessage(event.text, event.tool_calls, event.provider_metadata))
        text_parts.append(event.text)
        if not event.tool_calls:
            emit(RunCompleted("".join(text_parts)))
            return

        calls = event.tool_calls
        completed = 0
        active = False
        limit_hit = False
        try:
            for call in calls:
                active = False
                if used >= max_tool_calls:
                    result = ToolResult("本次工具调用次数已达上限，未执行。", is_error=True)
                    limit_hit = True
                else:
                    used += 1
                    try:
                        arguments = json.loads(call.arguments)
                    except (ValueError, TypeError):
                        result = ToolResult("工具参数不是有效 JSON，请修正。", is_error=True)
                    else:
                        active = True
                        result = await tools.execute(call.id, call.name, arguments)
                record(ToolResultMessage(result.content, tool_call_id=call.id, tool_name=call.name,
                               details=result.details, is_error=result.is_error))
                completed += 1
                active = False
        finally:
            for index, call in enumerate(calls[completed:]):
                message = ("工具执行中断或异常，结果未确认；不要假定成功，不要自动重复执行。"
                           if index == 0 and active else "运行已中断，此工具未执行。")
                record(ToolResultMessage(message, tool_call_id=call.id, tool_name=call.name, is_error=True))
        if limit_hit:
            raise ModelError("本次工具调用次数已达上限，请调整要求后继续。")
