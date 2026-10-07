from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
import os
from fastapi.responses import JSONResponse
from assistant.journal import SessionStorageError

from fastapi import FastAPI

from api.dependencies import AppResources
from settings import HttpSettings
from api.assistant import router as assistant_router
from assistant.sessions import SessionStore
from api.custom_exercises import router as custom_exercise_router
from db.database import create_database_engine


def create_app(*, resources: AppResources | None = None) -> FastAPI:
    """测试可注入独立运行时；生产资源在启动时创建、关闭时释放，启动时自动升级实例数据库。"""
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        engine = None
        app.state.assistant_sessions = SessionStore(Path(os.getenv("AI_SESSIONS_DIR", "data/assistant-sessions")))
        try:
            active_resources = resources
            if active_resources is None:
                from db.initialize import initialize_database
                engine = create_database_engine()
                initialize_database(engine)
                active_resources = AppResources(engine, HttpSettings.from_env())
            app.state.resources = active_resources
            yield
        finally:
            app.state.assistant_sessions.close()
            app.state.assistant_sessions = None
            app.state.resources = None
            if engine is not None:
                engine.dispose()

    app = FastAPI(title="Rhythm Trainer API", lifespan=lifespan)
    @app.exception_handler(SessionStorageError)
    async def storage_error(_request, error):
        return JSONResponse({"detail": str(error)}, status_code=503, headers={"Cache-Control": "no-store"})

    app.include_router(assistant_router)
    app.include_router(custom_exercise_router)
    from api.local_data import router as local_data_router
    app.include_router(local_data_router)
    app.add_api_route("/api/health", health, methods=["GET"])
    return app


async def health() -> dict[str, str]:
    """仅检查 API 是否可响应，不代表数据库或外部服务可用。"""
    return {"status": "ok"}


app = create_app()
