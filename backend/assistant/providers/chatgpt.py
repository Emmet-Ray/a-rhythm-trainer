"""ChatGPT 订阅接入：授权、模型目录、模型创建与 Responses 协议适配。"""
import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import httpx
import jwt
from openai import AsyncOpenAI
from pydantic_ai.providers.openai import OpenAIProvider
from assistant.model import CompleteResponsesModel, ConnectionError, AuthorizationRequired, image_input_support

ISSUER = 'https://auth.openai.com'
RESOURCE = 'https://api.openai.com/v1'
TOKEN_URL = ISSUER + '/api/accounts/oauth/token'
SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'


def token_request(values):
    try:
        response = httpx.post(TOKEN_URL, data={**values, 'resource': RESOURCE}, timeout=30)
        if response.status_code == 401 or (response.status_code == 400 and response.json().get('error') == 'invalid_grant'):
            raise AuthorizationRequired('ChatGPT 授权已失效，请重新授权')
        response.raise_for_status()
        token = response.json()
        if not token.get('access_token') or not token.get('refresh_token'):
            raise ValueError('missing token')
        if 'chatgpt.tokens.use.direct' not in token.get('scope', '').split():
            raise ValueError('missing scope')
        return {**token, 'expires_at': time.time() + float(token['expires_in'])}
    except AuthorizationRequired:
        raise
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
        raise ConnectionError('ChatGPT 授权不可用，请检查网络或重新授权') from error


def begin_authorization(config, host, origin):
    """生成授权地址和待验证信息，持久化由连接模块负责。"""
    verifier = secrets.token_urlsafe(32)
    pending = {'state': secrets.token_urlsafe(32), 'nonce': secrets.token_urlsafe(32),
               'verifier': verifier, 'expires_at': time.time() + 600, 'origin': origin,
               'redirect_uri': origin.replace('://localhost', '://127.0.0.1') + '/auth/callback',
               'client_id': config.get('client_id'), 'subject': config.get('subject')}
    params = {'client_id': pending['client_id'] or 'dynamic_agent_client', 'ext_agent_host_id': host,
              'response_type': 'code', 'redirect_uri': pending['redirect_uri'], 'scope': SCOPE,
              'resource': RESOURCE, 'state': pending['state'], 'nonce': pending['nonce'],
              'code_challenge_method': 'S256',
              'code_challenge': base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()}
    if pending['client_id']:
        if config.get('id_token'):
            params['id_token_hint'] = config['id_token']
    else:
        params['agent_name_hint'] = 'Rhythm Trainer'
    return ISSUER + '/api/accounts/authorize?' + urlencode(params), pending


def validate_callback(pending, query):
    if not pending or pending['expires_at'] < time.time() or not secrets.compare_digest(query.get('state', ''), pending['state']):
        raise ConnectionError('授权已过期或无效，请返回设置重新授权')


def finish_authorization(pending, query):
    """兑换并验证一份已校验、已消费的回调，返回完整凭证。"""
    client = query.get('client_id') or pending['client_id']
    if (not client or client == 'dynamic_agent_client' or not query.get('code')
            or (pending['client_id'] and client != pending['client_id'])):
        raise ConnectionError('授权返回信息无效，请重新授权')
    token = token_request({'grant_type': 'authorization_code', 'client_id': client,
                           'code': query['code'], 'code_verifier': pending['verifier'],
                           'redirect_uri': pending['redirect_uri']})
    try:
        key = jwt.PyJWKClient(ISSUER + '/.well-known/jwks.json').get_signing_key_from_jwt(token['id_token']).key
        claims = jwt.decode(token['id_token'], key, algorithms=['RS256'], audience=client, issuer=ISSUER,
                            options={'require': ['exp', 'sub', 'aud', 'iss', 'nonce']})
        if claims['nonce'] != pending['nonce'] or (pending['subject'] and claims['sub'] != pending['subject']):
            raise ValueError('identity mismatch')
    except (jwt.PyJWTError, ValueError, KeyError) as error:
        raise ConnectionError('无法确认 ChatGPT 授权身份，请重新授权') from error
    return {**token, 'client_id': client, 'subject': claims['sub'], 'email': claims.get('email', ''), 'needs_authorization': False}


def disconnect(config):
    """尽力撤销远端令牌，本地移除不依赖远端可用性。"""
    if config.get('refresh_token'):
        try:
            discovery = httpx.get(ISSUER + '/.well-known/openid-configuration', timeout=15)
            discovery.raise_for_status()
            endpoint = discovery.json()['revocation_endpoint']
            if not endpoint.startswith(ISSUER + '/'):
                raise ValueError('unexpected issuer')
            response = httpx.post(endpoint, data={'token': config['refresh_token'], 'token_type_hint': 'refresh_token',
                                                  'client_id': config['client_id']}, timeout=15)
            response.raise_for_status()
        except (httpx.HTTPError, ValueError, KeyError):
            return False
    return True


# The subscription endpoint differs from the ordinary API. Keep these differences
# at the transport boundary so the agent, history and tool schema stay shared.
UNSUPPORTED = {'max_output_tokens', 'max_tool_calls', 'temperature', 'top_p', 'top_logprobs', 'metadata',
               'background', 'conversation', 'moderation', 'multi_agent', 'prompt', 'prompt_cache_retention',
               'safety_identifier', 'truncation', 'user', 'previous_response_id'}


class SubscriptionTransport(httpx.AsyncBaseTransport):
    def __init__(self, inner=None):
        self.inner = inner or httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request):
        if request.method == 'POST' and request.url.path == '/v1/responses':
            body = json.loads(await request.aread())
            for key in UNSUPPORTED:
                body.pop(key, None)
            body.update(store=False, stream=True)
            functions = [t for t in body.get('tools', []) if t['type'] == 'function']
            if functions:
                body['tools'] = [t for t in body['tools'] if t['type'] != 'function'] + [
                    {'type': 'namespace', 'name': 'rhythm_trainer', 'description': 'Rhythm exercise tools', 'tools': functions}]
            for item in body.get('input', []):
                if item.get('role') == 'system':
                    item['role'] = 'developer'
                if item.get('type') == 'function_call':
                    item['namespace'] = 'rhythm_trainer'
            choice = body.get('tool_choice')
            if isinstance(choice, dict) and choice.get('type') == 'function':
                choice['namespace'] = 'rhythm_trainer'
            headers = dict(request.headers)
            headers.pop('content-length', None)
            request = httpx.Request(request.method, request.url, headers=headers,
                                   content=json.dumps(body).encode(), extensions=request.extensions)
        return await self.inner.handle_async_request(request)

    async def aclose(self):
        await self.inner.aclose()


def create_model(name: str, credential: str) -> CompleteResponsesModel:
    """用已准备好的凭证创建模型，客户端生命周期由连接模块负责。"""
    client = AsyncOpenAI(api_key=credential, base_url=RESOURCE, max_retries=0, timeout=30,
                         http_client=httpx.AsyncClient(transport=SubscriptionTransport()))
    return CompleteResponsesModel(name, provider=OpenAIProvider(openai_client=client))


def list_models(credential: str) -> list[dict]:
    """返回订阅账号可展示的模型，不将远端响应或凭证暴露给调用方。"""
    if not credential:
        raise ConnectionError('请先授权 ChatGPT')
    try:
        response = httpx.get(RESOURCE + '/models', headers={'Authorization': f'Bearer {credential}'}, timeout=30)
        if response.status_code == 401:
            raise AuthorizationRequired('ChatGPT 授权已失效，请重新授权')
        response.raise_for_status()
        models = [{'id': item['slug'], 'name': item['display_name'], 'supports_images': image_input_support(item.get('input_modalities'))}
                  for item in response.json()['models'] if item.get('visibility') == 'list']
        if not models:
            raise ConnectionError('当前连接没有可用模型')
        return models
    except ConnectionError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise ConnectionError('无法获取模型列表，请检查授权状态和网络后重试') from error


def refresh_credentials(config):
    """凭证即将到期时返回新令牌组，否则返回 None；不修改传入快照。"""
    if not config.get('access_token'):
        raise ConnectionError('请在设置 → 模型服务中授权 ChatGPT')
    if config.get('expires_at', 0) >= time.time() + 60:
        return None
    return token_request({'grant_type': 'refresh_token', 'client_id': config['client_id'],
                          'refresh_token': config['refresh_token']})
