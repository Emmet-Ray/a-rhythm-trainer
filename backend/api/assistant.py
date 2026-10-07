"""多轮会话接口，接收每次请求的页面快照；运行工具循环并返回最终回答。"""

from collections.abc import AsyncIterator
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from pydantic_ai.models import Model
from assistant.sessions import ChatSession, SessionBusy, SessionStore, CardState
from assistant.context import PageContext
from assistant.model import ModelSelection
from starlette.concurrency import run_in_threadpool


def require_assistant_origin(request: Request) -> None:
    """校验浏览器来源；允许反向代理连接，不信任客户端提交的转发头。"""
    origins = request.headers.getlist("origin")
    if not origins:
        # 非浏览器客户端可以无 Origin；来源校验不是身份认证。
        if request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403, "不允许的助手请求来源。")
        return
    allowed = request.app.state.resources.settings.allowed_origins
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
        raise HTTPException(403, "不允许的助手请求来源，请检查 ALLOWED_ORIGINS。")


class ChatInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=4000)
    message_id: str = Field(min_length=1, max_length=100)
    page_context: PageContext | None = Field(
        default=None, description="本次页面快照；省略或 null 表示未知，不沿用上次快照。",
    )


router = APIRouter(prefix="/api/assistant", tags=["assistant"], dependencies=[Depends(require_assistant_origin)])


@router.get("/status")
async def assistant_status(request: Request):
    try:
        value = await run_in_threadpool(request.app.state.model_connections.status)
    except ValueError as error:
        value = {"status": "invalid", "message": str(error)}
    return JSONResponse(value, headers={"Cache-Control": "no-store"})


def get_store(request: Request) -> SessionStore:
    return request.app.state.assistant_sessions


def get_owner() -> str:
    from assistant.journal import INSTANCE_OWNER
    return INSTANCE_OWNER


Owner = Annotated[str, Depends(get_owner)]
Store = Annotated[SessionStore, Depends(get_store)]


async def get_session(session_id: str, store: Store, owner: Owner) -> ChatSession:
    try:
        return await run_in_threadpool(store.get, session_id, owner)
    except KeyError:
        raise HTTPException(404, "会话不存在或不属于当前身份。") from None


async def get_selection(session: Annotated[ChatSession, Depends(get_session)]) -> ModelSelection | None:
    # FastAPI shares this immutable snapshot across dependencies of one request
    return session.model_selection


Selection = Annotated[ModelSelection | None, Depends(get_selection)]


async def get_model(request: Request, selection: Selection) -> AsyncIterator[Model]:
    from assistant.model import ConnectionError
    try:
        async with request.app.state.model_connections.open_model(selection) as model:
            yield model
    except ConnectionError as error:
        raise HTTPException(503, str(error)) from error


@router.post("/sessions", status_code=201)
def create_session(store: Store, owner: Owner, response: Response, request: Request, body: ModelSelection | None = None):
    response.headers["Cache-Control"] = "no-store"
    connections = request.app.state.model_connections
    if body is not None:
        connections.validate_selection(body)
    return store.create(owner, body if body is not None else connections.recent()).snapshot()


@router.get("/sessions")
def list_sessions(store: Store, owner: Owner, response: Response,
                  offset: int = Query(default=0, ge=0), limit: int = Query(default=30, ge=1, le=100)):
    response.headers["Cache-Control"] = "no-store"
    return store.list(owner, offset=offset, limit=limit)


@router.get("/sessions/{session_id}")
async def read_session(session: Annotated[ChatSession, Depends(get_session)]):
    return JSONResponse(session.snapshot(), headers={"Cache-Control": "no-store"})


@router.put("/sessions/{session_id}/model")
def select_model(body: ModelSelection, request: Request, session: Annotated[ChatSession, Depends(get_session)]):
    connections = request.app.state.model_connections
    connections.validate_selection(body)
    try:
        session.select_model(body)
    except SessionBusy as error:
        raise HTTPException(409, str(error)) from error
    remembered = connections.remember_selection(body)
    return JSONResponse({**session.snapshot(), "selection_notice": "" if remembered else
                         "当前对话已切换模型，但未能保存新对话的默认选择"}, headers={"Cache-Control": "no-store"})


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, store: Store, owner: Owner):
    try:
        store.delete(session_id, owner)
    except KeyError:
        raise HTTPException(404, "会话不存在。") from None
    except SessionBusy as error:
        raise HTTPException(409, str(error)) from None
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.put("/sessions/{session_id}/cards/{exercise_id}")
async def save_card(exercise_id: str, state: CardState, session: Annotated[ChatSession, Depends(get_session)]):
    try:
        result = await run_in_threadpool(session.update_card, exercise_id, state)
    except KeyError:
        raise HTTPException(404, "当前对话中没有这份练习。") from None
    return JSONResponse(result, headers={"Cache-Control": "no-store"})


async def get_run(
    body: ChatInput,
    session: Annotated[ChatSession, Depends(get_session)],
    model: Annotated[Model, Depends(get_model)],
    selection: Selection,
) -> AsyncIterator[StreamingResponse]:
    try:
        async with session.run(body.text, model, body.page_context, message_id=body.message_id,
                               expected_selection=selection) as response:
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Accel-Buffering"] = "no"
            yield response
    except SessionBusy as error:
        raise HTTPException(409, str(error)) from error


@router.post("/sessions/{session_id}/messages")
async def chat(response: Annotated[StreamingResponse, Depends(get_run, scope="request")]):
    return response
