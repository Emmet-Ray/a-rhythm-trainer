"""账号相关 API 的公共 HTTP 规则；不定义业务端点、不验证身份、不管理事务。

只支持同源前端（开发时通过 Vite 代理），不开放凭证 CORS。修改状态的请求必须
携带允许的 Origin，包括登录前的发送/核验；缺失或 null 均拒绝，不替代反滥用限流。
健康检查不使用此规则；需要身份的业务另行声明 AuthenticatedUser 依赖。
"""

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.exc import SQLAlchemyError

from api.dependencies import get_http_settings


class SessionApiRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def handle(request: Request):
            # 包住参数解析，在读取请求体前检查来源；默认 422 可能回显敏感输入。
            try:
                settings = get_http_settings(request)
                if request.method not in ("GET", "HEAD", "OPTIONS"):
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
