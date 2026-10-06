"""多轮会话接口，接收每次请求的页面快照；运行工具循环并返回最终回答。"""

import json
from dataclasses import asdict
from contextlib import aclosing
from collections.abc import AsyncIterator
import os
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from agent.model import ModelError, ModelSettings, TextModel, create_model
from assistant.sessions import EntryAdded, SessionEvent, ChatSession, SessionBusy, SessionStore
from assistant.context import PageContext


def require_assistant_origin(request: Request) -> None:
    """校验浏览器来源；允许反向代理连接，不信任客户端提交的转发头。"""
    origins = request.headers.getlist("origin")
    if not origins:
        # 非浏览器客户端可以无 Origin；来源校验不是身份认证。
        if request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "不允许的助手请求来源。")
        return
    allowed = {value.strip() for value in os.getenv(
        "AI_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080",
    ).split(",") if value.strip()}
    try:
        origin = urlsplit(origins[0])
        valid = (len(origins) == 1 and origin.scheme in ("http", "https")
                 and origin.hostname and origin.username is None and origin.password is None
                 and not origin.path and not origin.query and not origin.fragment
                 and origins[0] == f"{origin.scheme}://{origin.netloc}"
                 and "*" not in origins[0])
        origin.port  # 检查端口格式。
    except ValueError:
        valid = False
    if not valid or origins[0] not in allowed:
        raise HTTPException(403, "不允许的助手请求来源，请检查 AI_ALLOWED_ORIGINS。")


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


router = APIRouter(prefix="/api/assistant", tags=["assistant"], dependencies=[Depends(require_assistant_origin)])


@router.get("/status")
async def assistant_status():
    # 只检查配置，不创建模型客户端、不消耗额度、不返回任何凭证。
    try:
        ModelSettings.from_env()
        status, message = "ready", ""
    except ValueError as error:
        status = "unconfigured" if not os.getenv("AI_API_KEY", "").strip() else "invalid"
        message = str(error)
    return JSONResponse({"status": status, "message": message}, headers={"Cache-Control": "no-store"})


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
) -> AsyncIterator[AsyncIterator[SessionEvent | EntryAdded]]:
    # request 作用域的 yield 依赖在整个响应结束后退出，包括断连/发送异常。
    try:
        async with session.run(body.text, model, body.page_context) as stream:
            yield stream
    except SessionBusy as error:
        raise HTTPException(409, str(error)) from error


def encode_event(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


@router.post("/sessions/{session_id}/messages")
async def chat(stream: Annotated[AsyncIterator[SessionEvent | EntryAdded], Depends(get_run, scope="request")]):
    async def events():
        try:
            async with aclosing(stream) as events_stream:
                async for event in events_stream:
                    yield encode_event(asdict(event))
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
