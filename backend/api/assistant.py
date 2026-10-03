"""本机多轮会话接口，接收每次请求的页面快照；尚不提供工具执行。"""

import json
from contextlib import aclosing
from collections.abc import AsyncIterator
from ipaddress import ip_address
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from assistant.model import ModelError, ModelEvent, ModelSettings, TextModel, create_model
from assistant.sessions import ChatSession, SessionBusy, SessionStore
from assistant.context import PageContext


def require_local_request(request: Request) -> None:
    # 第一阶段没有账号级配额，入口仅供本机开发，不接入公开部署。
    try:
        local = request.client is not None and ip_address(request.client.host).is_loopback
    except ValueError:
        local = False
    origins = request.headers.getlist("origin")
    if origins:
        try:
            origin = urlsplit(origins[0])
            origin_allowed = (
                len(origins) == 1
                and origin.scheme in ("http", "https")
                and origin.hostname in ("localhost", "127.0.0.1", "::1")
                and origin.port in (5173, 8000)
                and not origin.username and not origin.password
                and not origin.path and not origin.query and not origin.fragment
            )
        except ValueError:
            origin_allowed = False
    else:
        origin_allowed = True  # 允许本机 curl；浏览器请求校验 Origin。
    if not local or not origin_allowed:
        raise HTTPException(403, "助手目前仅供本机使用。")


def get_model() -> TextModel:
    try:
        return create_model(ModelSettings.from_env())
    except ValueError as error:
        raise HTTPException(503, str(error)) from error


class ChatInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=4000)
    page_context: PageContext | None = Field(
        default=None, description="本次页面快照；省略或 null 表示未知，不沿用上次快照。",
    )


router = APIRouter(prefix="/api/assistant", tags=["assistant"], dependencies=[Depends(require_local_request)])


def get_store(request: Request) -> SessionStore:
    return request.app.state.assistant_sessions


def get_session(session_id: str, store: Annotated[SessionStore, Depends(get_store)]) -> ChatSession:
    try:
        return store.get(session_id)
    except KeyError:
        raise HTTPException(404, "会话不存在或已因后端重启失效，请创建新会话。") from None


@router.post("/sessions", status_code=201)
async def create_session(store: Annotated[SessionStore, Depends(get_store)]):
    return JSONResponse(store.create().snapshot(), status_code=201, headers={"Cache-Control": "no-store"})


@router.get("/sessions/{session_id}")
async def read_session(session: Annotated[ChatSession, Depends(get_session)]):
    return JSONResponse(session.snapshot(), headers={"Cache-Control": "no-store"})


async def get_run(
    body: ChatInput,
    session: Annotated[ChatSession, Depends(get_session)],
    model: Annotated[TextModel, Depends(get_model)],
) -> AsyncIterator[AsyncIterator[ModelEvent]]:
    # request 作用域的 yield 依赖在整个响应结束后退出，包括断连/发送异常。
    try:
        async with session.run(body.text, model, body.page_context) as stream:
            yield stream
    except SessionBusy as error:
        raise HTTPException(409, str(error)) from error


def encode_event(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/sessions/{session_id}/messages")
async def chat(stream: Annotated[AsyncIterator[ModelEvent], Depends(get_run, scope="request")]):
    async def events():
        try:
            async with aclosing(stream) as events_stream:
                async for event in events_stream:
                    yield encode_event({"type": event.type, "text": event.text})
                    if event.type == "message_completed":
                        break
                else:
                    raise ModelError("模型连接提前结束，请重试。")
            yield encode_event({"type": "run_completed"})
        except ModelError as error:
            yield encode_event({"type": "run_failed", "message": str(error)})
        except Exception:
            yield encode_event({"type": "run_failed", "message": "助手运行失败，请重试。"})

    # StreamingResponse 在断连时取消生成器；CancelledError 不转成失败事件。
    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
