"""本地 API 的来源检查、错误转换与缓存策略。"""

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError

from api.dependencies import get_http_settings


class LocalApiRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request):
            # 包住参数解析，在读取请求体前检查来源；默认 422 可能回显敏感输入。
            try:
                if request.method not in ("GET", "HEAD", "OPTIONS"):
                    settings = get_http_settings(request)
                    origins = request.headers.getlist("origin")
                    if len(origins) != 1 or origins[0] not in settings.allowed_origins:
                        raise HTTPException(403, "请求来源不受允许。")
                response = await handler(request)
            except RequestValidationError:
                response = JSONResponse({"detail": "请求参数格式错误。"}, status_code=422)
            except HTTPException as error:
                response = JSONResponse({"detail": error.detail}, status_code=error.status_code, headers=error.headers)
            except SQLAlchemyError:
                response = JSONResponse({"detail": "数据服务暂不可用，请稍后再试。"}, status_code=503)
            response.headers["Cache-Control"] = "no-store"
            return response

        return handle
