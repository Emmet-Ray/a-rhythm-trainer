"""一次模型请求的边界；不依赖 HTTP 路由，不管理会话或执行业务工具。

适配器产生文字增量，最后产生一个完整回答；失败时抛出 ModelError。
调用方取消或停止消费时必须关闭迭代器，以释放上游连接。
"""

import asyncio
import os
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Literal, Protocol

from openai import AsyncOpenAI, OpenAIError


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
        if provider != "deepseek" or not model or not api_key:
            raise ValueError("请配置受支持的 AI_PROVIDER、AI_MODEL 和 AI_API_KEY。")
        return cls(provider, model, api_key)


@dataclass(frozen=True)
class ModelEvent:
    type: Literal["text_delta", "message_completed"]
    text: str


@dataclass(frozen=True)
class Message:
    role: Literal["system", "user", "assistant"]
    content: str


class ModelError(Exception):
    """可对用户展示的固定错误，不包含上游响应或认证信息。"""


class TextModel(Protocol):
    def stream(self, messages: Sequence[Message]) -> AsyncIterator[ModelEvent]: ...


class DeepSeekModel:
    def __init__(self, settings: ModelSettings):
        self.settings = settings

    async def stream(self, messages: Sequence[Message]) -> AsyncIterator[ModelEvent]:
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
                        input=[{"role": message.role, "content": message.content} for message in messages],
                        max_output_tokens=2048,
                        stream=True,
                    )
                    async with response:
                        async for event in response:
                            if event.type == "response.output_text.delta":
                                yield ModelEvent("text_delta", event.delta)
                            elif event.type == "response.completed":
                                final = event.response
                                if final.status != "completed" or not final.output_text.strip():
                                    raise ModelError("模型未返回完整的文字回答，请重试。")
                                if any(item.type not in ("message", "reasoning") for item in final.output):
                                    raise ModelError("模型返回了当前尚不支持的内容。")
                                yield ModelEvent("message_completed", final.output_text)
                                return
                            elif event.type in ("response.failed", "response.incomplete", "error"):
                                raise ModelError("模型回答未完成，请重试。")
                    raise ModelError("模型连接提前结束，请重试。")
        except TimeoutError as error:
            raise ModelError("模型响应超时，请重试。") from error
        except OpenAIError as error:
            raise ModelError("模型服务请求失败，请稍后重试。") from error


def create_model(settings: ModelSettings) -> TextModel:
    """选择适配器；新增提供方时扩展此处，路由不需要理解厂商协议。"""
    if settings.provider == "deepseek":
        return DeepSeekModel(settings)
    raise ValueError("不支持的模型提供方。")
