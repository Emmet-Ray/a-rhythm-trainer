"""登录业务的 HTTP 接口与业务错误转换；公共来源/响应规则见 api/http_policy。"""

from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from domain.auth import InvalidVerificationCode, LoginRequestBlocked, LoginRequestUnavailable
from db.sessions import revoke_login_session
from api.dependencies import AuthDisabled, CurrentUser, DatabaseEngine, HttpSettings, LoginService, SessionStatus
from api.http_policy import SessionApiRoute
from settings import SESSION_LIFETIME
from integrations.sms import SmsServiceError


@contextmanager
def _login_errors():
    """只转换登录业务错误，不处理参数、数据库错误或事务。"""
    try:
        yield
    except LoginRequestBlocked:
        raise HTTPException(429, "暂时不能重新发送验证码，请稍后再试。") from None
    except (InvalidVerificationCode, LoginRequestUnavailable):
        raise HTTPException(400, "验证码错误或请求不可用，请重试或重新申请。") from None
    except SmsServiceError:
        raise HTTPException(503, "登录服务暂不可用，请稍后再试。") from None


router = APIRouter(prefix="/api/auth", tags=["auth"], route_class=SessionApiRoute)


class SendCodeBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    phone_number: str = Field(min_length=11, max_length=11, pattern=r"^1[3-9][0-9]{9}$", repr=False)


class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    request_id: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$", repr=False)
    code: str = Field(min_length=6, max_length=6, pattern=r"^[0-9]{6}$", repr=False)


class SmsRequestResponse(BaseModel):
    request_id: str


@router.post("/sms-code", response_model=SmsRequestResponse)
async def send_code(body: SendCodeBody, auth: LoginService):
    with _login_errors():
        return SmsRequestResponse(request_id=await auth.request_code(body.phone_number))


@router.post("/login", response_model=CurrentUser)
async def login(body: LoginBody, response: Response, auth: LoginService, settings: HttpSettings):
    with _login_errors():
        result = await auth.login(body.request_id, body.code)
    response.set_cookie(
        settings.cookie_name, result.token,
        max_age=int(SESSION_LIFETIME.total_seconds()), expires=result.expires_at,
        path="/", secure=settings.secure_cookie, httponly=True, samesite="lax",
    )
    # 原始凭证不出现在 JSON 中；数据库提交成功后才设置 Cookie。
    return CurrentUser(id=result.user_id)


@router.get("/me", response_model=CurrentUser | AuthDisabled)
def me(user: SessionStatus):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, engine: DatabaseEngine, settings: HttpSettings):
    with Session(engine) as session, session.begin():
        revoke_login_session(session, request.cookies.get(settings.cookie_name))
    response = Response(status_code=204)
    response.delete_cookie(
        settings.cookie_name, path="/", secure=settings.secure_cookie,
        httponly=True, samesite="lax",
    )
    return response
