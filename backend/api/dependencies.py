"""单用户实例资源；数据库与登录无关。"""
from dataclasses import dataclass
from typing import Annotated
from fastapi import Depends, Request
from sqlalchemy import Engine
from settings import HttpSettings

@dataclass(frozen=True)
class AppResources:
    engine: Engine
    settings: HttpSettings

def get_database_engine(request: Request) -> Engine:
    return request.app.state.resources.engine

def get_http_settings(request: Request) -> HttpSettings:
    return request.app.state.resources.settings

DatabaseEngine = Annotated[Engine, Depends(get_database_engine)]
