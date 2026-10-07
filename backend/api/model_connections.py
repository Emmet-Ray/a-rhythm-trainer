"""模型设置接口；浏览器只拿到状态和目录，凭证不回传。"""
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, SecretStr

from api.assistant import require_assistant_origin
from assistant.model import ConnectionError, ProviderName

router = APIRouter(prefix='/api/model-connections', dependencies=[Depends(require_assistant_origin)])
callback_router = APIRouter()


class ApiKey(BaseModel):
    key: SecretStr


def service(request):
    return request.app.state.model_connections


def reply(value):
    return JSONResponse(value, headers={'Cache-Control': 'no-store'})


@router.get('')
def read_connections(request: Request):
    return reply(service(request).public())


@router.put('/deepseek/key')
def configure_key(body: ApiKey, request: Request):
    key = body.key.get_secret_value().strip()
    if not key or len(key) > 4096:
        raise ConnectionError('请输入有效的 API Key')
    return reply(service(request).configure_deepseek(key))


@router.delete('/deepseek/key')
def remove_key(request: Request):
    return reply(service(request).remove_deepseek_key())


@router.post('/{provider}/models')
def list_models(provider: ProviderName, request: Request, force: bool = True):
    return reply(service(request).refresh_catalog(provider, force=force))


@router.post('/chatgpt/authorize')
def authorize(request: Request):
    origin = request.headers.get('origin', str(request.base_url).rstrip('/'))
    parsed = urlsplit(origin)
    if (origin not in request.app.state.resources.settings.allowed_origins or parsed.scheme != 'http'
            or parsed.hostname not in ('localhost', '127.0.0.1')):
        raise ConnectionError('请在本机通过 http://127.0.0.1 或 http://localhost 打开网站后授权')
    return reply({'url': service(request).begin_authorization(origin)})


@router.delete('/chatgpt/authorization')
def sign_out(request: Request):
    confirmed = service(request).disconnect()
    return reply({'connections': service(request).public(), 'message': '已移除 ChatGPT 授权' if confirmed
                 else '已清除本地凭证，未能确认远端撤销，可在 ChatGPT 设置中断开应用'})


@callback_router.get('/auth/callback')
def callback(request: Request):
    query = dict(request.query_params)
    # Uvicorn logs the scope at response time. Never log the authorization code.
    request.scope['query_string'] = b''
    try:
        origin, success = service(request).finish_authorization(query)
    except ConnectionError as error:
        return HTMLResponse('<!doctype html><meta charset="utf-8"><title>授权未完成</title><h1>授权未完成</h1><p>'
                            + str(error) + '</p><a href="/settings?category=models">返回模型服务设置</a>',
                            status_code=400, headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})
    return RedirectResponse(origin + '/settings?category=models&authorization=' + ('success' if success else 'cancelled'),
                            status_code=303, headers={'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'})
