"""向路由注入后端对象，而非接收前端参数：

- DatabaseEngine：数据库引擎，用于创建 Session，不是事务。
- LoginService：Auth 实例，负责发送验证码和登录。
- HttpSettings：来源白名单与 Cookie 配置。
- AuthenticatedUser：通过 Cookie 查询得到的 CurrentUser(id)，无有效会话则返回 401。

前三者复用 main.py 创建的资源；当前用户按请求查询。
路由通过 Annotated + Depends 按需获取；业务事务和数据归属检查仍由调用方负责。
"""

from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from domain.auth import Auth
from db.sessions import get_login_session
from settings import AuthHttpSettings


@dataclass(frozen=True)
class AppResources:
    """仅供应用启动、测试装配和本模块访问；不作为业务路由的依赖参数。"""
    engine: Engine
    auth: Auth
    settings: AuthHttpSettings


def _resources(request: Request) -> AppResources:
    resources = getattr(request.app.state, "resources", None)
    if resources is None:
        raise HTTPException(503, "登录功能尚未开启。")
    return resources


def get_database_engine(request: Request) -> Engine:
    return _resources(request).engine


def get_login_service(request: Request) -> Auth:
    return _resources(request).auth


def get_http_settings(request: Request) -> AuthHttpSettings:
    return _resources(request).settings


DatabaseEngine = Annotated[Engine, Depends(get_database_engine)]
LoginService = Annotated[Auth, Depends(get_login_service)]
HttpSettings = Annotated[AuthHttpSettings, Depends(get_http_settings)]


class CurrentUser(BaseModel):
    id: int


def get_current_user(request: Request, engine: DatabaseEngine, settings: HttpSettings) -> CurrentUser:
    """从会话取得用户，不接受客户端 user_id；查询结束就关闭独立 Session。

    同步依赖在线程池执行。只描述本次检查时的身份，不能撤回已开始的请求；
    后续业务仍需用用户 ID 限定数据范围，不共享这里的读事务进行写操作。
    """
    with Session(engine) as session:
        login_session = get_login_session(session, request.cookies.get(settings.cookie_name))
        if login_session is None:
            raise HTTPException(401, "尚未登录或登录已过期。")
        return CurrentUser(id=login_session.user_id)


AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]


class AuthDisabled(BaseModel):
    auth_enabled: Literal[False] = False


def get_session_status(request: Request) -> CurrentUser | AuthDisabled:
    """仅身份查询允许返回功能关闭；缺失运行时或数据库故障仍按错误处理。"""
    if getattr(request.app.state, "auth_enabled", None) is False:
        return AuthDisabled()
    return get_current_user(request, get_database_engine(request), get_http_settings(request))


SessionStatus = Annotated[CurrentUser | AuthDisabled, Depends(get_session_status)]
