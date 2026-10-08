"""DeepSeek API 接入：模型目录与 Responses 客户端创建。"""
import httpx
from openai import AsyncOpenAI
from pydantic_ai.providers.deepseek import DeepSeekProvider

from assistant.model import CompleteResponsesModel, ConnectionError, AuthorizationRequired, image_input_support

API_URL = 'https://api.deepseek.com'


def create_model(name: str, credential: str) -> CompleteResponsesModel:
    """用已准备好的凭证创建模型，客户端生命周期由连接模块负责。"""
    client = AsyncOpenAI(api_key=credential, base_url=API_URL, max_retries=0, timeout=30)
    return CompleteResponsesModel(name, provider=DeepSeekProvider(openai_client=client))


def list_models(credential: str) -> list[dict]:
    """将服务目录转换为公共的 id/name 列表，不回传远端错误详情。"""
    if not credential:
        raise ConnectionError('请先填写 API Key')
    try:
        response = httpx.get(API_URL + '/models', headers={'Authorization': f'Bearer {credential}'}, timeout=30)
        if response.status_code == 401:
            raise AuthorizationRequired('DeepSeek 凭证已失效，请更新 API Key')
        response.raise_for_status()
        models = [{'id': item['id'], 'name': item['id'], 'supports_images': image_input_support(item.get('input_modalities'))} for item in response.json()['data']]
        if not models:
            raise ConnectionError('当前连接没有可用模型')
        return models
    except ConnectionError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
        raise ConnectionError('无法获取模型列表，请检查凭证和网络后重试') from error
