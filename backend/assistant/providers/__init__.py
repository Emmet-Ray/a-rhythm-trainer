"""已支持的模型服务接入。

每个模块提供 list_models(credential) 和 create_model(name, credential)
目录统一为 id/name 列表，模型直接使用 Pydantic AI 的接口
接入模块不持久化凭证、不持有会话，认证扩展按服务需要提供
"""
from . import chatgpt, deepseek

PROVIDERS = {'deepseek': deepseek, 'chatgpt': chatgpt}
