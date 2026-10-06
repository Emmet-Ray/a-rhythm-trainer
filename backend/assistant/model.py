"""部署配置与 DeepSeek Responses 接入；请求和流式事件解析由 Pydantic AI 负责。"""
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from openai import AsyncOpenAI, OpenAIError
from pydantic_ai.exceptions import ModelHTTPError, UsageLimitExceeded, UnexpectedModelBehavior
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider


@dataclass(frozen=True)
class ModelSettings:
    provider: str
    model: str
    api_key: str = field(repr=False)

    @classmethod
    def from_env(cls):
        provider = os.getenv("AI_PROVIDER", "deepseek").strip()
        model = os.getenv("AI_MODEL", "deepseek-flash").strip()
        key = os.getenv("AI_API_KEY", "").strip()
        if not key:
            raise ValueError("助手尚未配置 API Key。请在部署环境中设置 AI_API_KEY，并重启后端服务。")
        if provider != "deepseek" or not model:
            raise ValueError("请配置受支持的 AI_PROVIDER、AI_MODEL 和 AI_API_KEY。")
        return cls(provider, model, key)


class CompleteResponsesModel(OpenAIResponsesModel):
    """工具执行前要求供应商确认完成；SDK 默认可接受意外 EOF 后的部分输出。"""

    @asynccontextmanager
    async def request_stream(self, messages, model_settings, model_request_parameters, run_context=None):
        async with super().request_stream(messages, model_settings, model_request_parameters, run_context) as stream:
            yield stream
            if stream.get().state != "complete" or stream.get().finish_reason not in ("stop", "tool_call"):
                raise UnexpectedModelBehavior("模型连接提前结束或回答未完成，请重试。")


def create_model(settings: ModelSettings) -> OpenAIResponsesModel:
    client = AsyncOpenAI(api_key=settings.api_key, base_url="https://api.deepseek.com", max_retries=0, timeout=30)
    return CompleteResponsesModel(settings.model, provider=OpenAIProvider(openai_client=client))


def public_model_error(error: Exception) -> str:
    """只展示固定说明，不把供应商响应、请求体和认证信息发送给浏览器。"""
    status = getattr(error, "status_code", None)
    if isinstance(error, (ModelHTTPError, OpenAIError)):
        return {401: "模型 API Key 无效，请检查后端 AI_API_KEY 配置。",
                402: "模型账户额度不足，请检查模型账户余额。",
                429: "模型请求受限，请稍后重试或检查模型账户额度。"}.get(status, "模型服务请求失败，请稍后重试。")
    if isinstance(error, TimeoutError):
        return "助手运行超时，请稍后继续。"
    if isinstance(error, UsageLimitExceeded):
        return "本次工具调用或模型请求次数已达上限，请调整要求后继续。"
    return "助手运行失败，请重试。"
