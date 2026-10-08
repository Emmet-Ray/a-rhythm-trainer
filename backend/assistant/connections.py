"""本地模型连接：凭证与目录的持久化、并发控制和请求生命周期。"""
import asyncio
import copy
import fcntl
import json
import os
import tempfile
import time
from contextlib import contextmanager, asynccontextmanager
from uuid import uuid4
from pathlib import Path

from assistant.model import ConnectionError, AuthorizationRequired, ModelSelection
from assistant.providers import PROVIDERS, chatgpt, deepseek


class ModelConnections:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def edit(self):
        """仅锁住本地读改写，远端请求必须在此上下文之外执行。"""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(self.path.with_suffix('.lock'), os.O_CREAT | os.O_RDWR, 0o600)
            with os.fdopen(fd, 'a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                state = json.loads(self.path.read_text()) if self.path.exists() else {
                    'provider': 'deepseek',
                    'deepseek': {'key': '', 'model': '', 'models': []},
                    'chatgpt': {'model': '', 'models': []},
                }
                before = copy.deepcopy(state)
                yield state
                if state != before:
                    temp_fd, name = tempfile.mkstemp(dir=self.path.parent)
                    try:
                        with os.fdopen(temp_fd, 'w') as out:
                            json.dump(state, out)
                            out.flush()
                            os.fsync(out.fileno())
                        os.replace(name, self.path)
                    finally:
                        Path(name).unlink(missing_ok=True)
        except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
            raise ConnectionError('模型配置无法读取或保存，请检查数据目录') from error

    def public(self):
        with self.edit() as state:
            return {'provider': state['provider'], **{
                name: {'configured': bool(config.get('key') if name == 'deepseek' else config.get('access_token')),
                       'model': config.get('model', ''), 'models': [{**item, 'supports_images': item.get('supports_images')} for item in config.get('models', [])],
                       'catalog_updated_at': config.get('catalog_updated_at', 0),
                       'needs_authorization': bool(config.get('needs_authorization')),
                       **({'account': config.get('email', '')} if name == 'chatgpt' else {})}
                for name, config in ((name, state[name]) for name in ('deepseek', 'chatgpt'))}}

    def status(self):
        view = self.public()
        provider = view['provider']
        if provider not in PROVIDERS:
            return {'status': 'invalid', 'message': '请选择受支持的模型服务'}
        ready = any(view[name]['configured'] for name in ('deepseek', 'chatgpt'))
        return {'status': 'ready' if ready else 'unconfigured',
                'message': '' if ready else '请在设置 → 模型服务中配置连接'}

    def recent(self):
        """新对话继承最近的明确选择；断开服务后不自动改用另一个服务。"""
        view = self.public()
        provider = view['provider']
        name = view.get(provider, {}).get('model')
        return ModelSelection(provider=provider, model=name) if name and provider in PROVIDERS else None

    @contextmanager
    def remote_operation(self, provider):
        """串行化同一服务的目录读取与旋转令牌刷新，不阻塞本地状态读写。"""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(self.path.with_suffix(f'.{provider}.lock'), os.O_CREAT | os.O_RDWR, 0o600)
            lock = os.fdopen(fd, 'a')
        except OSError as error:
            raise ConnectionError('无法锁定模型连接，请检查数据目录') from error
        with lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def credentials(self, provider):
        with self.edit() as state:
            return copy.deepcopy(state[provider])

    def update_credentials(self, provider, previous, updates):
        """只提交仍属于原连接的结果，移除或替换连接会使在途请求失效。"""
        with self.edit() as state:
            current = state[provider]
            if current.get('generation') != previous.get('generation'):
                raise ConnectionError('模型连接已变更，请重试')
            current.update(updates)

    def refreshed_chatgpt(self):
        """调用方持有 ChatGPT 远端操作锁；刷新结果在后续请求之前落盘。"""
        config = self.credentials('chatgpt')
        try:
            token = chatgpt.refresh_credentials(config)
        except AuthorizationRequired:
            self.update_credentials('chatgpt', config, {'needs_authorization': True})
            raise
        if token is not None:
            self.update_credentials('chatgpt', config, {**token, 'needs_authorization': False})
            config.update(token, needs_authorization=False)
        return config

    def refresh_catalog(self, provider, *, force=True):
        with self.remote_operation(provider):
            config = self.credentials(provider)
            if force or not config.get('models') or any('supports_images' not in item for item in config['models']) or time.time() - config.get('catalog_updated_at', 0) >= 300:
                if provider == 'chatgpt':
                    config = self.refreshed_chatgpt()
                try:
                    credential = config.get('key', '') if provider == 'deepseek' else config.get('access_token', '')
                    models = PROVIDERS[provider].list_models(credential)
                except AuthorizationRequired:
                    self.update_credentials(provider, config, {'needs_authorization': True})
                    raise
                self.update_credentials(provider, config, {'models': models, 'catalog_updated_at': time.time(),
                                                           'needs_authorization': False})
        return self.public()

    def image_input_support(self, selection: ModelSelection | None) -> bool | None:
        """与公开目录使用同一份能力缓存；未知能力允许交由供应商判断。"""
        if selection is None:
            return None
        config = self.credentials(selection.provider)
        item = next((item for item in config.get('models', []) if item['id'] == selection.model), {})
        value = item.get('supports_images')
        return value if isinstance(value, bool) else None

    def validate_selection(self, selection):
        """选模型只检查已获取的目录；网络刷新失败不丢弃可用缓存。"""
        view = self.public()[selection.provider]
        if view['needs_authorization']:
            raise AuthorizationRequired('凭证已失效，请更新 API Key 或重新授权')
        if not view['configured']:
            raise ConnectionError('该模型服务已移除，请重新连接或选择其他模型')
        item = next((item for item in view['models'] if item['id'] == selection.model), None)
        if item is None:
            raise ConnectionError('该模型不在可用列表中，请刷新列表并重新选择')
        return item

    def remember_selection(self, selection):
        """尽力保存新对话的默认值，失败不影响已经保存的会话选择。"""
        try:
            with self.edit() as state:
                state[selection.provider]['model'] = selection.model
                state['provider'] = selection.provider
        except ConnectionError:
            return False
        return True

    def configure_deepseek(self, key):
        previous = self.credentials('deepseek')
        models = deepseek.list_models(key)
        self.update_credentials('deepseek', previous, {
            'key': key, 'models': models, 'catalog_updated_at': time.time(),
            'needs_authorization': False, 'generation': str(uuid4()),
        })
        return self.public()

    def remove_deepseek_key(self):
        with self.edit() as state:
            state['deepseek'].update(key='', models=[], needs_authorization=False, generation=str(uuid4()))
        return self.public()

    def begin_authorization(self, origin):
        with self.edit() as state:
            host = state.setdefault('host_id', 'urn:uuid:' + str(uuid4()))
            url, pending = chatgpt.begin_authorization(state['chatgpt'], host, origin)
            state['pending'] = pending
            state['authorization_id'] = pending['state']
        return url

    def finish_authorization(self, query):
        with self.edit() as state:
            pending = state.get('pending')
            chatgpt.validate_callback(pending, query)
            del state['pending']  # Consume once, including failed exchanges
        if query.get('error'):
            return pending['origin'], False
        config = chatgpt.finish_authorization(pending, query)
        with self.edit() as state:
            if state.get('authorization_id') != pending['state']:
                raise ConnectionError('授权已被取消或替换，请返回设置重试')
            state['chatgpt'].update(config, generation=str(uuid4()), models=[], catalog_updated_at=0)
        return pending['origin'], True

    def disconnect(self):
        with self.edit() as state:
            config = state['chatgpt']
            state.pop('pending', None)
            state.pop('authorization_id', None)
            state['chatgpt'] = {k: v for k, v in config.items() if k in ('client_id', 'subject', 'email', 'model')}
            state['chatgpt'].update(models=[], generation=str(uuid4()))
        return chatgpt.disconnect(config)

    def model(self, selection):
        if selection is None:
            raise ConnectionError('请在对话输入框中选择模型')
        self.validate_selection(selection)
        if selection.provider == 'chatgpt':
            with self.remote_operation('chatgpt'):
                config = self.refreshed_chatgpt()
            credential = config['access_token']
        else:
            credential = self.credentials(selection.provider).get('key')
            if not credential:
                raise ConnectionError('请在设置 → 模型服务中填写 API Key')
        return PROVIDERS[selection.provider].create_model(selection.model, credential)

    @asynccontextmanager
    async def open_model(self, selection):
        """模型和客户端只属于本次请求，流结束或失败时都释放连接。"""
        # Shield construction so cancellation cannot abandon an unowned client.
        task = asyncio.create_task(asyncio.to_thread(self.model, selection))
        try:
            model = await asyncio.shield(task)
        except asyncio.CancelledError:
            def close_created(done):
                if not done.cancelled() and done.exception() is None:
                    asyncio.create_task(done.result().client.close())
            task.add_done_callback(close_created)
            raise
        try:
            yield model
        finally:
            await model.client.close()
