"""一次模型请求的边界；不依赖 HTTP 路由，不管理会话或执行业务工具。

适配器产生文字增量，最后产生一条完整模型消息（文字和／或工具调用）；失败时抛出 ModelError。
调用方取消或停止消费时必须关闭迭代器，以释放上游连接。
"""

import asyncio
import os
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from copy import deepcopy
from typing import Literal, Protocol

from agent.messages import AssistantMessage, Message, ProviderMetadata, ToolCall

from openai import AsyncOpenAI, OpenAIError, AuthenticationError, RateLimitError, APIStatusError, APITimeoutError, APIConnectionError


@dataclass(frozen=True)
class ModelEvent:
    """单次模型请求的增量或完整输出；不代表 Agent 整次运行结束。"""

    type: Literal["text_delta", "message_completed"]
    text: str
    tool_calls: tuple[ToolCall, ...] = ()
    provider_metadata: ProviderMetadata | None = None


@dataclass(frozen=True)
class ModelSettings:
    provider: str
    model: str
    api_key: str = field(repr=False)

    @classmethod
    def from_env(cls) -> "ModelSettings":
        provider = os.getenv("AI_PROVIDER", "deepseek").strip()
        model = os.getenv("AI_MODEL", "deepseek-flash").strip()
        api_key = os.getenv("AI_API_KEY", "").strip()
        if not api_key:
            raise ValueError("助手尚未配置 API Key。请在部署环境中设置 AI_API_KEY，并重启后端服务。")
        if provider != "deepseek" or not model:
            raise ValueError("请配置受支持的 AI_PROVIDER、AI_MODEL 和 AI_API_KEY。")
        return cls(provider, model, api_key)


class ModelError(Exception):
    """可对用户展示的固定错误，不包含上游响应或认证信息。"""


class TextModel(Protocol):
    def stream(self, messages: Sequence[Message], *, tools: Sequence[dict] = ()) -> AsyncIterator[ModelEvent]: ...


class DeepSeekModel:
    def __init__(self, settings: ModelSettings):
        self.settings = settings

    async def stream(self, messages: Sequence[Message], *, tools: Sequence[dict] = ()) -> AsyncIterator[ModelEvent]:
        try:
            # 每次请求拥有连接，取消/异常/正常返回均通过上下文管理器关闭。
            async with AsyncOpenAI(
                api_key=self.settings.api_key,
                base_url="https://api.deepseek.com",
                max_retries=0,
                timeout=30.0,
            ) as client:
                async with asyncio.timeout(120):
                    response = await client.responses.create(
                        model=self.settings.model,
                        input=responses_input(messages),
                        **({"tools": [{"type": "function", **tool, "strict": False} for tool in tools]} if tools else {}),
                        max_output_tokens=2048,
                        stream=True,
                    )
                    async with response:
                        async for event in response:
                            if event.type == "response.output_text.delta":
                                yield ModelEvent("text_delta", event.delta)
                            elif event.type == "response.completed":
                                final = event.response
                                if final.status != "completed":
                                    raise ModelError("模型未返回完整的文字回答，请重试。")
                                if any(item.type not in ("message", "reasoning", "function_call") for item in final.output):
                                    raise ModelError("模型返回了当前尚不支持的内容。")
                                calls = tuple(ToolCall(item.call_id, item.name, item.arguments)
                                              for item in final.output if item.type == "function_call")
                                if not final.output_text.strip() and not calls:
                                    raise ModelError("模型未返回完整的文字回答，请重试。")
                                if any(not call.id or not call.name for call in calls) or len({c.id for c in calls}) != len(calls):
                                    raise ModelError("模型返回了无效的工具调用标识。")
                                items = tuple(item.model_dump(exclude_none=True) for item in final.output) if calls else ()
                                yield ModelEvent("message_completed", final.output_text, calls, ProviderMetadata("deepseek", {"response_items": items}) if calls else None)
                                return
                            elif event.type in ("response.failed", "response.incomplete", "error"):
                                raise ModelError("模型回答未完成，请重试。")
                    raise ModelError("模型连接提前结束，请重试。")
        except TimeoutError as error:
            raise ModelError("模型响应超时，请重试。") from error
        except AuthenticationError as error:
            raise ModelError("模型 API Key 无效，请检查后端 AI_API_KEY 配置。") from error
        except RateLimitError as error:
            raise ModelError("模型请求受限，请稍后重试或检查模型账户额度。") from error
        except APITimeoutError as error:
            raise ModelError("模型响应超时，请重试。") from error
        except APIConnectionError as error:
            raise ModelError("无法连接模型服务，请稍后重试。") from error
        except APIStatusError as error:
            if error.status_code == 402:
                raise ModelError("模型账户额度不足，请检查模型账户余额。") from error
            raise ModelError("模型服务请求失败，请检查模型配置或稍后重试。") from error
        except OpenAIError as error:
            raise ModelError("模型服务请求失败，请稍后重试。") from error


def create_model(settings: ModelSettings) -> TextModel:
    """选择适配器；新增提供方时扩展此处，路由不需要理解厂商协议。"""
    if settings.provider == "deepseek":
        return DeepSeekModel(settings)
    raise ValueError("不支持的模型提供方。")


def responses_input(messages: Sequence[Message]) -> list[dict]:
    """把统一消息转换为 Responses items，工具结果通过 call_id 与调用关联。"""
    items = []
    for message in messages:
        if message.role == "tool":
            items.append({"type": "function_call_output", "call_id": message.tool_call_id, "output": message.content})
        elif (isinstance(message, AssistantMessage) and message.provider_metadata is not None
              and message.provider_metadata.provider == "deepseek"):
            items.extend(deepcopy(message.provider_metadata.payload["response_items"]))
        else:
            calls = message.tool_calls if isinstance(message, AssistantMessage) else ()
            if message.content or not calls:
                items.append({"role": message.role, "content": message.content})
            items.extend({"type": "function_call", "call_id": call.id, "name": call.name,
                          "arguments": call.arguments} for call in calls)
    return items
