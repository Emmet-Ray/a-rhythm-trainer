"""模型选择与错误契约、Responses 流完整性和跨服务历史处理。"""
from contextlib import asynccontextmanager
from dataclasses import replace
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from openai import OpenAIError
from pydantic_ai.exceptions import ModelHTTPError, UsageLimitExceeded, UnexpectedModelBehavior
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.messages import ModelResponse, ThinkingPart


class ConnectionError(ValueError):
    """可直接呈现给用户的错误，不包含供应商响应。"""


class AuthorizationRequired(ConnectionError):
    """供应商明确拒绝凭证；网络故障不属于授权失效。"""


ProviderName = Literal['deepseek', 'chatgpt']


class ModelSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    provider: ProviderName
    model: str = Field(min_length=1, max_length=200)


class CompleteResponsesModel(OpenAIResponsesModel):
    """工具执行前要求供应商确认完成；SDK 默认可接受意外 EOF 后的部分输出。"""

    @asynccontextmanager
    async def request_stream(self, messages, model_settings, model_request_parameters, run_context=None):
        portable = []
        for message in messages:
            if isinstance(message, ModelResponse):
                # Earlier DeepSeek sessions used the generic OpenAI provider label.
                if message.provider_name == "openai" and (message.model_name or "").startswith("deepseek"):
                    message = replace(message, provider_name="deepseek", parts=[
                        replace(part, provider_name="deepseek") if part.provider_name == "openai" else part
                        for part in message.parts])
                if message.provider_name != self.system:
                    message = replace(message, parts=[part for part in message.parts if not isinstance(part, ThinkingPart)])
            portable.append(message)
        async with super().request_stream(portable, model_settings, model_request_parameters, run_context) as stream:
            yield stream
            if stream.get().state != "complete" or stream.get().finish_reason not in ("stop", "tool_call"):
                raise UnexpectedModelBehavior("模型连接提前结束或回答未完成，请重试。")


def public_model_error(error: Exception) -> str:
    """只展示固定说明，不把供应商响应、请求体和认证信息发送给浏览器。"""
    status = getattr(error, "status_code", None)
    if isinstance(error, (ModelHTTPError, OpenAIError)):
        return {401: "模型凭证无效，请在设置 → 模型服务中更新 API Key 或重新授权",
                402: "模型额度不足，请检查当前服务的额度",
                429: "模型请求受限，请稍后重试或检查当前服务的额度"}.get(status, "模型服务请求失败，请稍后重试。")
    if isinstance(error, TimeoutError):
        return "助手运行超时，请稍后继续。"
    if isinstance(error, UsageLimitExceeded):
        return "本次工具调用或模型请求次数已达上限，请调整要求后继续。"
    return "助手运行失败，请重试。"
