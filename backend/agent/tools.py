"""独立于模型厂商与会话的工具定义和执行入口。"""

from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

Parameters = TypeVar("Parameters", bound=BaseModel)


@dataclass(frozen=True)
class ToolResult:
    """content 交给模型；details 保留给界面或程序，不自动加入模型上下文。"""

    content: str
    details: dict = field(default_factory=dict)
    is_error: bool = False


@dataclass(frozen=True)
class AgentTool(Generic[Parameters]):
    """工具的声明与实现；execute 接收调用 ID 和已校验参数。

    外部依赖在创建工具时注入。异步执行支持网络 I/O，取消通过 asyncio 任务传播。
    """

    name: str
    description: str
    parameters: type[Parameters]
    execute: Callable[[str, Parameters], Awaitable[ToolResult]]


class ToolExecutor:
    """为一次运行配置可用工具，统一查找和校验，不了解具体业务或会话结构。

    未知工具和参数错误作为失败结果交回模型；程序异常及取消向调用方传播。
    不自动重试，不假定带副作用的工具可以重复执行。
    """

    def __init__(self, tools: Iterable[AgentTool[Any]]):
        self._tools: dict[str, AgentTool[Any]] = {}
        for tool in tools:
            if not tool.name or tool.name in self._tools:
                raise ValueError(f"工具名为空或重复：{tool.name!r}")
            self._tools[tool.name] = tool

    def definitions(self) -> list[dict]:
        """厂商无关的工具声明；模型适配器负责转换成所需的 API 格式。"""
        return [{"name": tool.name, "description": tool.description,
                 "parameters": tool.parameters.model_json_schema()} for tool in self._tools.values()]

    async def execute(self, call_id: str, name: str, arguments: object) -> ToolResult:
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult("请求的工具不存在。", is_error=True)
        try:
            parameters = tool.parameters.model_validate(arguments)
        except ValidationError as error:
            issues = error.errors(include_input=False, include_context=False, include_url=False)
            message = "; ".join(
                f"{'.'.join(map(str, issue['loc'])) or 'arguments'}: {issue['msg']}" for issue in issues
            )
            return ToolResult(message, is_error=True)
        return await tool.execute(call_id, parameters)
