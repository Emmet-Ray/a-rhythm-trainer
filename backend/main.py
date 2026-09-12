from contextlib import asynccontextmanager

from fastapi import FastAPI

from domain.auth import Auth
from api.dependencies import AppResources
from settings import AuthHttpSettings, SESSION_LIFETIME
from api.auth import router as auth_router
from api.custom_exercises import router as custom_exercise_router
from db.database import create_database_engine
from integrations.sms import SmsAuth, SmsSettings


def create_app(*, resources: AppResources | None = None) -> FastAPI:
    """测试可注入独立运行时；生产资源在启动时创建、关闭时释放，不自动建表。"""
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = None
        try:
            active_resources = resources
            if active_resources is None:
                settings = AuthHttpSettings.from_env()
                if settings is not None:
                    sms = SmsAuth(SmsSettings.from_env())
                    engine = create_database_engine()
                    active_resources = AppResources(engine, Auth(engine, sms, session_lifetime=SESSION_LIFETIME), settings)
            app.state.resources = active_resources
            yield
        finally:
            app.state.resources = None
            if engine is not None:
                engine.dispose()

    app = FastAPI(title="Rhythm Trainer API", lifespan=lifespan)
    app.include_router(auth_router)
    app.include_router(custom_exercise_router)
    app.add_api_route("/api/health", health, methods=["GET"])
    return app


async def health() -> dict[str, str]:
    """仅检查 API 是否可响应，不代表数据库或外部服务可用。"""
    return {"status": "ok"}


app = create_app()
