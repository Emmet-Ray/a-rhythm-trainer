"""登录的 HTTP 边界：参数、Cookie、来源检查及安全错误响应。

只支持同源前端（开发时通过 Vite 代理），不开放凭证 CORS。所有 POST 必须携带
允许的 Origin，包括登录前的发送/核验；缺失或 null 均拒绝。这不替代反滥用限流。
"""

import os
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth import Auth, InvalidVerificationCode, LoginRequestBlocked, LoginRequestUnavailable
from db.sessions import get_login_session, revoke_login_session
from sms_auth import SmsServiceError


SESSION_LIFETIME = timedelta(days=7)


@dataclass(frozen=True)
class AuthHttpSettings:
    allowed_origins: tuple[str, ...]
    secure_cookie: bool = True

    def __post_init__(self):
        if not self.allowed_origins or type(self.secure_cookie) is not bool:
            raise ValueError("请配置登录来源和 Cookie 安全选项。")
        for origin in self.allowed_origins:
            url = urlsplit(origin)
            if (
                url.scheme not in ("http", "https") or not url.hostname
                or url.username is not None or url.password is not None
                or url.path or url.query or url.fragment
                or origin != f"{url.scheme}://{url.netloc}"
                or "*" in origin
            ):
                raise ValueError("登录来源必须是完整的 http(s) origin，不含路径或通配符。")
            try:
                url.port
            except ValueError:
                raise ValueError("登录来源端口无效。") from None
            if self.secure_cookie and url.scheme != "https":
                raise ValueError("安全 Cookie 必须配置 HTTPS 来源。")
            if not self.secure_cookie and url.hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError("关闭安全 Cookie 仅允许本机开发来源。")

    @property
    def cookie_name(self) -> str:
        # 线上 __Host- 前缀要求 Secure、Path=/、无 Domain，阻止子域覆盖凭证。
        return "__Host-rhythm_session" if self.secure_cookie else "rhythm_session"

    @classmethod
    def from_env(cls):
        """未开启时返回 None，健康检查不要求数据库及短信凭证。"""
        enabled = os.environ.get("AUTH_ENABLED", "false")
        if enabled not in ("true", "false"):
            raise ValueError("AUTH_ENABLED 必须为 true 或 false。")
        if enabled == "false":
            return None
        secure = os.environ.get("AUTH_COOKIE_SECURE", "true")
        if secure not in ("true", "false"):
            raise ValueError("AUTH_COOKIE_SECURE 必须为 true 或 false。")
        return cls(
            tuple(value.strip() for value in os.environ.get("AUTH_ALLOWED_ORIGINS", "").split(",") if value.strip()),
            secure == "true",
        )


@dataclass(frozen=True)
class AuthRuntime:
    engine: Engine
    auth: Auth
    settings: AuthHttpSettings


def get_auth_runtime(request: Request) -> AuthRuntime:
    runtime = getattr(request.app.state, "auth_runtime", None)
    if runtime is None:
        raise HTTPException(503, "登录功能尚未开启。")
    return runtime


Runtime = Annotated[AuthRuntime, Depends(get_auth_runtime)]


class AuthRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request):
            # 包住参数解析，既能在读请求体前检查来源，也避免默认 422 回显验证码。
            try:
                runtime = get_auth_runtime(request)
                if request.method == "POST":
                    origins = request.headers.getlist("origin")
                    if len(origins) != 1 or origins[0] not in runtime.settings.allowed_origins:
                        raise HTTPException(403, "请求来源不受允许。")
                response = await handler(request)
            except RequestValidationError:
                response = JSONResponse({"detail": "请求参数格式错误。"}, status_code=422)
            except HTTPException as error:
                response = JSONResponse({"detail": error.detail}, status_code=error.status_code)
            except LoginRequestBlocked:
                response = JSONResponse({"detail": "暂时不能重新发送验证码，请稍后再试。"}, status_code=429)
            except (InvalidVerificationCode, LoginRequestUnavailable):
                response = JSONResponse({"detail": "验证码错误或请求不可用，请重试或重新申请。"}, status_code=400)
            except (SmsServiceError, SQLAlchemyError):
                response = JSONResponse({"detail": "登录服务暂不可用，请稍后再试。"}, status_code=503)
            response.headers["Cache-Control"] = "no-store"
            return response

        return handle


router = APIRouter(prefix="/api/auth", tags=["auth"], route_class=AuthRoute)


class SendCodeBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    phone_number: str = Field(min_length=11, max_length=11, pattern=r"^1[3-9][0-9]{9}$", repr=False)


class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    request_id: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$", repr=False)
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$", repr=False)


class SmsRequestResponse(BaseModel):
    request_id: str


class CurrentUser(BaseModel):
    id: int


@router.post("/sms-code", response_model=SmsRequestResponse)
async def send_code(body: SendCodeBody, runtime: Runtime):
    return SmsRequestResponse(request_id=await runtime.auth.request_code(body.phone_number))


@router.post("/login", response_model=CurrentUser)
async def login(body: LoginBody, response: Response, runtime: Runtime):
    result = await runtime.auth.login(body.request_id, body.code)
    response.set_cookie(
        runtime.settings.cookie_name, result.token,
        max_age=int(SESSION_LIFETIME.total_seconds()), expires=result.expires_at,
        path="/", secure=runtime.settings.secure_cookie, httponly=True, samesite="lax",
    )
    # 原始凭证不出现在 JSON 中；数据库提交成功后才设置 Cookie。
    return CurrentUser(id=result.user_id)


@router.get("/me", response_model=CurrentUser)
def me(request: Request, runtime: Runtime):
    # 同步路由在线程池执行，数据库锁等待不阻塞事件循环。
    with Session(runtime.engine) as session:
        login_session = get_login_session(session, request.cookies.get(runtime.settings.cookie_name))
        if login_session is None:
            raise HTTPException(401, "尚未登录或登录已过期。")
        return CurrentUser(id=login_session.user_id)


@router.post("/logout", status_code=204)
def logout(request: Request, runtime: Runtime):
    with Session(runtime.engine) as session, session.begin():
        revoke_login_session(session, request.cookies.get(runtime.settings.cookie_name))
    response = Response(status_code=204)
    response.delete_cookie(
        runtime.settings.cookie_name, path="/", secure=runtime.settings.secure_cookie,
        httponly=True, samesite="lax",
    )
    return response
