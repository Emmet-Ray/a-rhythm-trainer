from contextlib import asynccontextmanager

from fastapi import FastAPI

from auth import Auth
from auth_routes import AuthHttpSettings, AuthRuntime, SESSION_LIFETIME, router
from db.database import create_database_engine
from sms_auth import SmsAuth, SmsSettings


def create_app(*, auth_runtime: AuthRuntime | None = None) -> FastAPI:
    """测试可注入独立运行时；生产资源在启动时创建、关闭时释放，不自动建表。"""
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = None
        try:
            runtime = auth_runtime
            if runtime is None:
                settings = AuthHttpSettings.from_env()
                if settings is not None:
                    sms = SmsAuth(SmsSettings.from_env())
                    engine = create_database_engine()
                    runtime = AuthRuntime(engine, Auth(engine, sms, session_lifetime=SESSION_LIFETIME), settings)
            app.state.auth_runtime = runtime
            yield
        finally:
            app.state.auth_runtime = None
            if engine is not None:
                engine.dispose()

    app = FastAPI(title="Rhythm Trainer API", lifespan=lifespan)
    app.include_router(router)
    app.add_api_route("/api/health", health, methods=["GET"])
    return app


async def health() -> dict[str, str]:
    """仅检查 API 是否可响应，不代表数据库或外部服务可用。"""
    return {"status": "ok"}


app = create_app()
