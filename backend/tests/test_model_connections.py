"""连接保存、OAuth 生命周期和凭证隔离；全部使用临时目录和模拟供应商。"""
import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from assistant.connections import ModelConnections
from assistant.providers.chatgpt import SubscriptionTransport
from assistant.model import ModelSelection, ConnectionError
from main import create_app


@pytest.fixture
def connections(tmp_path, monkeypatch):
    return ModelConnections(tmp_path / 'connections.json')


def catalog_response(url, **kwargs):
    assert kwargs['headers']['Authorization'] == 'Bearer secret-key'
    return httpx.Response(200, json={'data': [{'id': 'deepseek-flash'}]}, request=httpx.Request('GET', url))


def test_key_save_restart_remove_and_validation(connections, monkeypatch):
    monkeypatch.setattr(httpx, 'get', catalog_response)
    result = connections.configure_deepseek('secret-key')
    assert result['deepseek']['configured']
    assert 'secret-key' not in json.dumps(result)
    connections.remember_selection(ModelSelection(provider='deepseek', model='deepseek-flash'))
    assert ModelConnections(connections.path).status()['status'] == 'ready'
    assert connections.path.stat().st_mode & 0o777 == 0o600
    with pytest.raises(ConnectionError):
        connections.validate_selection(ModelSelection(provider='deepseek', model='nonexistent'))
    assert connections.public()['deepseek']['model'] == 'deepseek-flash'
    with connections.edit() as state:
        state['deepseek']['key'] = ''
    monkeypatch.setenv('AI_API_KEY', 'environment-key')
    assert not connections.public()['deepseek']['configured']


def signed_token(monkeypatch, pending, subject='account', client='oaiapp_test', nonce=None):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    encoded = jwt.encode({'iss': 'https://auth.openai.com', 'sub': subject, 'aud': client,
                          'exp': time.time() + 3600, 'nonce': nonce or pending['nonce'], 'email': 'test@example.com'}, private, algorithm='RS256')
    monkeypatch.setattr(jwt.PyJWKClient, 'get_signing_key_from_jwt', lambda *_: type('Key', (), {'key': private.public_key()})())
    token = {'access_token': 'access-secret', 'refresh_token': 'refresh-secret', 'id_token': encoded,
             'expires_in': 3600, 'scope': 'chatgpt.tokens.use.direct'}
    def exchange(url, data, **kwargs):
        assert data['client_id'] == client
        assert data['code_verifier'] == pending['verifier']
        assert data['redirect_uri'] == pending['redirect_uri']
        return httpx.Response(200, json=token, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', exchange)


def test_oauth_restart_state_replay_and_reauthorization(connections, monkeypatch):
    url = connections.begin_authorization('http://localhost:5173')
    query = parse_qs(urlsplit(url).query)
    assert query['redirect_uri'] == ['http://127.0.0.1:5173/auth/callback']
    assert query['code_challenge_method'] == ['S256']
    with connections.edit() as state:
        pending = dict(state['pending']); host = state['host_id']
    signed_token(monkeypatch, pending)
    with pytest.raises(ConnectionError):
        connections.finish_authorization({'state': 'wrong'})
    # State and PKCE survive a backend restart.
    restarted = ModelConnections(connections.path)
    assert restarted.finish_authorization({'state': pending['state'], 'code': 'code', 'client_id': 'oaiapp_test'}) == ('http://localhost:5173', True)
    with pytest.raises(ConnectionError):
        restarted.finish_authorization({'state': pending['state'], 'code': 'code', 'client_id': 'oaiapp_test'})
    public = restarted.public()
    assert public['chatgpt']['configured'] and public['provider'] == 'deepseek'
    assert 'access-secret' not in json.dumps(public) and 'refresh-secret' not in json.dumps(public)
    query = parse_qs(urlsplit(restarted.begin_authorization('http://127.0.0.1:8080')).query)
    assert query['client_id'] == ['oaiapp_test'] and query['ext_agent_host_id'] == [host]
    assert 'agent_name_hint' not in query and 'id_token_hint' in query


@pytest.mark.parametrize('failure', ['nonce', 'identity', 'client', 'expired', 'denied'])
def test_oauth_rejects_invalid_results_without_replacing_active_connection(connections, monkeypatch, failure):
    with connections.edit() as state:
        state['chatgpt'].update(client_id='oaiapp_test', subject='account', access_token='existing')
    connections.begin_authorization('http://127.0.0.1:8080')
    with connections.edit() as state:
        if failure == 'expired': state['pending']['expires_at'] = 0
        pending = dict(state['pending'])
    signed_token(monkeypatch, pending, subject='wrong' if failure == 'identity' else 'account', nonce='wrong' if failure == 'nonce' else None)
    query = {'state': pending['state'], 'code': 'code', 'client_id': 'wrong' if failure == 'client' else 'oaiapp_test'}
    if failure == 'denied':
        query['error'] = 'access_denied'
        assert connections.finish_authorization(query)[1] is False
    else:
        with pytest.raises(ConnectionError): connections.finish_authorization(query)
    with connections.edit() as state: assert state['chatgpt']['access_token'] == 'existing'


def test_refresh_serialized_and_saved_even_if_following_action_fails(connections, monkeypatch):
    calls = []
    def refresh(url, data, **kwargs):
        calls.append(data)
        assert data['refresh_token'] == 'old' and 'scope' not in data
        return httpx.Response(200, json={'access_token': 'new-access', 'refresh_token': 'new-refresh', 'expires_in': 3600,
                                        'scope': 'chatgpt.tokens.use.direct'}, request=httpx.Request('POST', url))
    monkeypatch.setattr(httpx, 'post', refresh)
    with connections.edit() as state:
        state['chatgpt'].update(client_id='client', access_token='expired', refresh_token='old', expires_at=0)
    def read():
        with connections.remote_operation('chatgpt'): return ModelConnections(connections.path).refreshed_chatgpt()['access_token']
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(lambda _: read(), range(2))) == ['new-access', 'new-access']
    assert len(calls) == 1
    with connections.edit() as state:
        state['chatgpt'].update(expires_at=0, refresh_token='old')
    monkeypatch.setattr(httpx, 'get', lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError('offline')))
    with pytest.raises(ConnectionError):
        connections.refresh_catalog('chatgpt')
    with connections.edit() as state: assert state['chatgpt']['refresh_token'] == 'new-refresh'


def test_disconnect_clears_tokens_but_retains_registration(connections, monkeypatch):
    with connections.edit() as state:
        state['chatgpt'].update(client_id='client', subject='account', access_token='access', refresh_token='refresh', id_token='id')
    monkeypatch.setattr(httpx, 'get', lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError('offline')))
    assert connections.disconnect() is False
    with connections.edit() as state:
        assert state['chatgpt']['client_id'] == 'client'
        assert not {'access_token','refresh_token','id_token'}.intersection(state['chatgpt'])


def test_settings_api_rejects_foreign_origin_and_does_not_return_secrets(monkeypatch):
    monkeypatch.setattr(httpx, 'get', catalog_response)
    with TestClient(create_app()) as client:
        response = client.put('/api/model-connections/deepseek/key', json={'key': 'secret-key'}, headers={'Origin': 'https://evil.example'})
        assert response.status_code == 403
        response = client.put('/api/model-connections/deepseek/key', json={'key': 'secret-key'})
        assert response.status_code == 200 and 'secret-key' not in response.text
        assert response.headers['cache-control'] == 'no-store'
        assert client.post('/api/model-connections/chatgpt/authorize', headers={'Origin':'http://localhost:8080'}).status_code == 200
        assert client.get('/auth/callback?state=invalid&code=secret-code').status_code == 400
        assert client.delete('/api/model-connections/deepseek/key').json()['deepseek']['configured'] is False


def test_subscription_transport_normalizes_history_and_parameters():
    async def run():
        async def handler(request):
            body = json.loads(request.content)
            assert body['stream'] and body['store'] is False and 'max_output_tokens' not in body
            assert body['input'][0]['role'] == 'developer'
            assert body['input'][1]['namespace'] == 'rhythm_trainer'
            assert body['tools'][0]['type'] == 'namespace'
            assert body['tool_choice']['namespace'] == 'rhythm_trainer'
            return httpx.Response(200, json={})
        async with httpx.AsyncClient(transport=SubscriptionTransport(httpx.MockTransport(handler))) as client:
            await client.post('https://api.openai.com/v1/responses', json={'max_output_tokens': 100, 'input': [
                {'role':'system','content':'instruction'}, {'type':'function_call','name':'propose_rhythm_exercise'}],
                'tools':[{'type':'function','name':'propose_rhythm_exercise'}], 'tool_choice':{'type':'function','name':'propose_rhythm_exercise'}})
    asyncio.run(run())


def test_switching_services_keeps_tool_history_without_foreign_reasoning(monkeypatch):
    from assistant.model import CompleteResponsesModel
    from pydantic_ai.providers.deepseek import DeepSeekProvider
    from assistant.sessions import ChatSession
    from openai import AsyncOpenAI
    from pydantic_ai.providers.openai import OpenAIProvider
    from test_assistant_model import upstream
    args = {'title':'练习','description':'四拍','exercise':{'timeSignature':{'beats':4,'beatType':4},
            'measures':[{'elements':[{'kind':'note','noteValue':'whole'}]}]}}
    def answer(text):
        return {'id':'msg','type':'message','status':'completed','role':'assistant','content':[{'type':'output_text','text':text,'annotations':[]}]}
    async def scenario():
        calls = []
        def handler(request):
            body = json.loads(request.content); calls.append(body)
            if len(calls) == 1:
                return upstream([{'id':'rs','type':'reasoning','summary':[], 'content':[{'type':'reasoning_text','text':'private planning'}]},
                    {'id':'fc','type':'function_call','call_id':'call','name':'propose_rhythm_exercise','arguments':json.dumps(args),'status':'completed'}])
            if len(calls) >= 3:
                if len(calls) == 3: assert not any(i.get('type') == 'reasoning' for i in body['input'])
                assert any(i.get('type') == 'function_call_output' for i in body['input'])
                prior = next(i for i in body['input'] if i.get('type') == 'function_call')
                if len(calls) == 3: assert prior['namespace'] == 'rhythm_trainer'
                if len(calls) == 4: assert 'namespace' not in prior
            return upstream([answer('4/4拍')], 'r'+str(len(calls)))
        deep_client = AsyncOpenAI(api_key='test', base_url='https://api.deepseek.com', http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        openai_client = AsyncOpenAI(api_key='test', http_client=httpx.AsyncClient(transport=SubscriptionTransport(httpx.MockTransport(handler))))
        deep = CompleteResponsesModel('deepseek-flash', provider=DeepSeekProvider(openai_client=deep_client))
        chat = CompleteResponsesModel('gpt-test', provider=OpenAIProvider(openai_client=openai_client))
        session = ChatSession()
        try:
            for i, model in enumerate([deep, chat, deep]):
                async with session.run('出题' if i == 0 else '什么拍号',model,message_id=str(i)) as response:
                    _ = [chunk async for chunk in response.body_iterator]
                assert session.last_run_status == 'completed'
        finally:
            await deep_client.close(); await openai_client.close()
    asyncio.run(scenario())


def test_catalog_cache_survives_network_failure_and_selection_needs_no_request(connections, monkeypatch):
    monkeypatch.setattr(httpx, 'get', catalog_response)
    connections.configure_deepseek('secret-key')
    def offline(*args, **kwargs):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(httpx, 'get', offline)
    connections.refresh_catalog('deepseek', force=False)
    with pytest.raises(ConnectionError):
        connections.refresh_catalog('deepseek')
    connections.remember_selection(ModelSelection(provider='deepseek', model='deepseek-flash'))
    assert connections.public()['deepseek']['configured']
    assert connections.public()['deepseek']['models'][0]['id'] == 'deepseek-flash'


def test_session_model_is_independent_persistent_and_removed_service_does_not_fallback(monkeypatch):
    from assistant.sessions import SessionStore
    monkeypatch.setattr(httpx, 'get', catalog_response)
    with TestClient(create_app()) as client:
        connections = client.app.state.model_connections
        connections.configure_deepseek('secret-key')
        with connections.edit() as state:
            state['chatgpt'].update(access_token='test', expires_at=time.time() + 3600,
                                   models=[{'id': 'gpt-test', 'name': 'GPT Test', 'supports_images': None}])
        deep = {'provider': 'deepseek', 'model': 'deepseek-flash'}
        chat = {'provider': 'chatgpt', 'model': 'gpt-test'}
        first = client.post('/api/assistant/sessions').json()['id']
        assert client.put(f'/api/assistant/sessions/{first}/model', json=deep).json()['model_selection'] == deep
        second = client.post('/api/assistant/sessions').json()
        assert second['model_selection'] == deep
        assert client.put(f'/api/assistant/sessions/{second["id"]}/model', json=chat).status_code == 200
        assert client.get(f'/api/assistant/sessions/{first}').json()['model_selection'] == deep
        assert client.post('/api/assistant/sessions').json()['model_selection'] == chat
        store = client.app.state.assistant_sessions
        session = next(value for value in store._sessions.values() if value.id == first)
        session.is_running = True
        assert client.put(f'/api/assistant/sessions/{first}/model', json=chat).status_code == 200
        assert session.model_selection.model_dump() == chat
        assert session.is_running
        session.select_model(ModelSelection(**deep))
        session.is_running = False
        directory = store.journal.directory
        store.close()
        restored = SessionStore(directory)
        try:
            assert restored.get(first, session.owner).snapshot()['model_selection'] == deep
        finally:
            restored.close()
        connections.remove_deepseek_key()
        assert connections.status()['status'] == 'ready'  # ChatGPT remains connected
        with pytest.raises(ConnectionError, match='已移除'):
            connections.model(ModelSelection(**deep))
        assert session.model_selection.model_dump() == deep


def test_changed_selection_during_model_resolution_is_rejected_without_a_turn():
    from assistant.sessions import ChatSession, SessionBusy
    from pydantic_ai.models.test import TestModel
    async def run():
        session = ChatSession()
        first = ModelSelection(provider='deepseek', model='deepseek-flash')
        session.select_model(first)
        session.select_model(ModelSelection(provider='chatgpt', model='gpt-test'))
        with pytest.raises(SessionBusy, match='模型选择已更新'):
            async with session.run('问题', TestModel(), message_id='test', expected_selection=first):
                pytest.fail('must not start')
        assert not session.turns and not session.is_running
    asyncio.run(run())


def test_network_failure_is_not_reported_as_revoked_authorization(connections, monkeypatch):
    monkeypatch.setattr(httpx, 'get', catalog_response)
    connections.configure_deepseek('secret-key')
    monkeypatch.setattr(httpx, 'get', lambda url, **kwargs: httpx.Response(503, request=httpx.Request('GET', url)))
    with pytest.raises(ConnectionError): connections.refresh_catalog('deepseek')
    assert not connections.public()['deepseek']['needs_authorization']
    monkeypatch.setattr(httpx, 'get', lambda url, **kwargs: httpx.Response(401, request=httpx.Request('GET', url)))
    with pytest.raises(ConnectionError): connections.refresh_catalog('deepseek')
    assert connections.public()['deepseek']['needs_authorization']
    monkeypatch.setattr(httpx, 'get', catalog_response)
    assert not connections.configure_deepseek('secret-key')['deepseek']['needs_authorization']


def test_refresh_rejection_requires_authorization_but_network_error_does_not(connections, monkeypatch):
    with connections.edit() as state:
        state['chatgpt'].update(access_token='expired', refresh_token='test-only', client_id='client', expires_at=0)
    monkeypatch.setattr(httpx, 'post', lambda url, **kwargs: httpx.Response(503, request=httpx.Request('POST', url)))
    with pytest.raises(ConnectionError): connections.refresh_catalog('chatgpt')
    assert not connections.public()['chatgpt']['needs_authorization']
    monkeypatch.setattr(httpx, 'post', lambda url, **kwargs: httpx.Response(400, json={'error': 'invalid_grant'}, request=httpx.Request('POST', url)))
    with pytest.raises(ConnectionError): connections.refresh_catalog('chatgpt')
    assert connections.public()['chatgpt']['needs_authorization']


def test_new_conversation_can_pin_the_displayed_default(monkeypatch):
    monkeypatch.setattr(httpx, 'get', catalog_response)
    with TestClient(create_app()) as client:
        connections = client.app.state.model_connections
        connections.configure_deepseek('secret-key')
        with connections.edit() as state:
            state['provider'] = 'chatgpt'
            state['chatgpt'].update(model='gpt-test', access_token='test', models=[{'id': 'gpt-test', 'name': 'GPT Test', 'supports_images': None}])
        # Another tab changed the default after this tab displayed DeepSeek.
        choice = {'provider': 'deepseek', 'model': 'deepseek-flash'}
        assert client.post('/api/assistant/sessions', json=choice).json()['model_selection'] == choice
        assert client.post('/api/assistant/sessions').json()['model_selection']['provider'] == 'chatgpt'


def test_model_change_during_response_keeps_active_model_and_persists_next_choice():
    from assistant.sessions import ChatSession
    from pydantic_ai.models.test import TestModel
    from pydantic_ai.messages import ModelResponse

    async def run():
        session = ChatSession()
        deep = ModelSelection(provider='deepseek', model='deepseek-flash')
        gpt = ModelSelection(provider='chatgpt', model='gpt-test')
        session.select_model(deep)
        async with session.run('问题', TestModel(call_tools=[], custom_output_text='原模型回答', model_name='first-model'), message_id='first', expected_selection=deep) as response:
            assert session.is_running
            session.select_model(gpt)
            async for _ in response.body_iterator:
                pass
        responses = [m for m in session.turns[0].messages if isinstance(m, ModelResponse)]
        assert responses[-1].model_name == 'first-model'
        assert session.model_selection == gpt
        async with session.run('下一个问题', TestModel(call_tools=[], custom_output_text='新模型回答', model_name='second-model'), message_id='second', expected_selection=gpt) as response:
            async for _ in response.body_iterator:
                pass
        responses = [m for m in session.turns[1].messages if isinstance(m, ModelResponse)]
        assert responses[-1].model_name == 'second-model'
    asyncio.run(run())


def test_legacy_environment_cannot_configure_a_new_connection(connections, monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'unsupported')
    monkeypatch.setenv('AI_MODEL', 'legacy-model')
    monkeypatch.setenv('AI_API_KEY', 'legacy-secret')
    assert connections.status()['status'] == 'unconfigured'
    assert connections.recent() is None
    assert not connections.path.exists()


@pytest.mark.parametrize('operation', ['catalog', 'configure', 'refresh', 'authorize'])
def test_slow_remote_results_do_not_block_reads_or_restore_removed_credentials(connections, monkeypatch, operation):
    from threading import Event
    entered, release = Event(), Event()
    monkeypatch.setattr(httpx, 'get', catalog_response)
    connections.configure_deepseek('secret-key')
    if operation == 'authorize':
        connections.begin_authorization('http://127.0.0.1:5173')
        with connections.edit() as state: pending = dict(state['pending'])
        signed_token(monkeypatch, pending)
    if operation in ('refresh', 'authorize'):
        with connections.edit() as state:
            state['chatgpt'].update(access_token='expired', refresh_token='old', client_id='client', expires_at=0)
        original = httpx.post
        def remote(url, **kwargs):
            entered.set()
            assert release.wait(5)
            if operation == 'authorize': return original(url, **kwargs)
            return httpx.Response(200, json={'access_token': 'late', 'refresh_token': 'rotated',
                                           'expires_in': 3600, 'scope': 'chatgpt.tokens.use.direct'}, request=httpx.Request('POST', url))
        monkeypatch.setattr(httpx, 'post', remote)
        # Revocation failure is separate from the stalled token request
        monkeypatch.setattr(httpx, 'get', lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError('offline')))
        action = (lambda: connections.finish_authorization({'state': pending['state'], 'code': 'test', 'client_id': 'oaiapp_test'})) if operation == 'authorize' else (lambda: connections.refresh_catalog('chatgpt'))
        remove = connections.disconnect
        provider = 'chatgpt'
    else:
        def remote(url, **kwargs):
            entered.set()
            assert release.wait(5)
            return catalog_response(url, **kwargs)
        monkeypatch.setattr(httpx, 'get', remote)
        action = (lambda: connections.configure_deepseek('secret-key')) if operation == 'configure' else (lambda: connections.refresh_catalog('deepseek'))
        remove, provider = connections.remove_deepseek_key, 'deepseek'
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending_result = pool.submit(action)
        try:
            assert entered.wait(2)
            assert pool.submit(connections.public).result(timeout=1)[provider]['configured']
            pool.submit(remove).result(timeout=1)
            assert not connections.public()[provider]['configured']
        finally:
            release.set()
        with pytest.raises(ConnectionError): pending_result.result(timeout=2)
    assert not ModelConnections(connections.path).public()[provider]['configured']


def test_late_catalog_cannot_mark_replacement_key_invalid(connections, monkeypatch):
    from threading import Event
    entered, release = Event(), Event()
    monkeypatch.setattr(httpx, 'get', catalog_response)
    connections.configure_deepseek('secret-key')
    def remote(url, **kwargs):
        if kwargs['headers']['Authorization'] == 'Bearer secret-key':
            entered.set()
            assert release.wait(5)
            return httpx.Response(401, request=httpx.Request('GET', url))
        return httpx.Response(200, json={'data': [{'id': 'replacement-model'}]}, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx, 'get', remote)
    with ThreadPoolExecutor(max_workers=2) as pool:
        old = pool.submit(connections.refresh_catalog, 'deepseek')
        try:
            assert entered.wait(2)
            pool.submit(connections.configure_deepseek, 'replacement-key').result(timeout=1)
        finally:
            release.set()
        with pytest.raises(ConnectionError): old.result(timeout=2)
    current = connections.public()['deepseek']
    assert current['configured'] and not current['needs_authorization']
    assert current['models'][0]['id'] == 'replacement-model'


def test_default_save_failure_keeps_successful_session_selection(monkeypatch):
    from contextlib import contextmanager
    monkeypatch.setattr(httpx, 'get', catalog_response)
    with TestClient(create_app()) as client:
        connections = client.app.state.model_connections
        connections.configure_deepseek('secret-key')
        sid = client.post('/api/assistant/sessions').json()['id']
        original = connections.edit
        calls = 0
        @contextmanager
        def storage_failure():
            nonlocal calls
            calls += 1
            if calls > 1: raise ConnectionError('read-only filesystem')
            with original() as state: yield state
        monkeypatch.setattr(connections, 'edit', storage_failure)
        choice = {'provider': 'deepseek', 'model': 'deepseek-flash'}
        response = client.put(f'/api/assistant/sessions/{sid}/model', json=choice)
        assert response.status_code == 200
        assert response.json()['model_selection'] == choice
        assert '默认选择' in response.json()['selection_notice']
        assert client.get(f'/api/assistant/sessions/{sid}').json()['model_selection'] == choice


def test_selection_dependency_pins_model_before_credentials_are_resolved(monkeypatch):
    from contextlib import asynccontextmanager
    from pydantic_ai.models.test import TestModel
    monkeypatch.setattr(httpx, 'get', catalog_response)
    with TestClient(create_app()) as client:
        connections = client.app.state.model_connections
        connections.configure_deepseek('secret-key')
        choice = {'provider': 'deepseek', 'model': 'deepseek-flash'}
        sid = client.post('/api/assistant/sessions', json=choice).json()['id']
        store = client.app.state.assistant_sessions
        session = next(s for s in store._sessions.values() if s.id == sid)
        closed = []
        @asynccontextmanager
        async def resolve(selection):
            assert selection == ModelSelection(**choice)
            session.select_model(ModelSelection(provider='chatgpt', model='changed-in-other-tab'))
            try: yield TestModel()
            finally: closed.append(True)
        monkeypatch.setattr(connections, 'open_model', resolve)
        response = client.post(f'/api/assistant/sessions/{sid}/messages', json={'text': '问题', 'message_id': 'test'})
        assert response.status_code == 409
        assert closed and not session.turns


def test_cancelled_model_construction_still_closes_client(connections, monkeypatch):
    from threading import Event
    from types import SimpleNamespace
    entered, release = Event(), Event()
    async def scenario():
        closed = asyncio.Event()
        async def close(): closed.set()
        def create(_selection):
            entered.set()
            assert release.wait(5)
            return SimpleNamespace(client=SimpleNamespace(close=close))
        monkeypatch.setattr(connections, 'model', create)
        async def request():
            async with connections.open_model(None): pytest.fail('cancelled request must not enter')
        task = asyncio.create_task(request())
        try:
            assert await asyncio.to_thread(entered.wait, 2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError): await task
        finally:
            release.set()
        await asyncio.wait_for(closed.wait(), 2)
    asyncio.run(scenario())


def test_default_storage_open_failure_is_nonfatal(connections, monkeypatch):
    def denied(*args, **kwargs): raise PermissionError('not writable')
    monkeypatch.setattr('assistant.connections.os.open', denied)
    assert not connections.remember_selection(ModelSelection(provider='deepseek', model='test'))


@pytest.mark.parametrize('provider,url,payload,expected', [
    ('deepseek', 'https://api.deepseek.com/models', {'data': [{'id': 'deep-test'}]},
     [{'id': 'deep-test', 'name': 'deep-test', 'supports_images': None}]),
    ('chatgpt', 'https://api.openai.com/v1/models', {'models': [
        {'slug': 'gpt-test', 'display_name': 'GPT Test', 'visibility': 'list'},
        {'slug': 'internal', 'display_name': 'Internal', 'visibility': 'hidden'},
    ]}, [{'id': 'gpt-test', 'name': 'GPT Test', 'supports_images': None}]),
])
def test_provider_catalogs_expose_the_same_public_contract(monkeypatch, provider, url, payload, expected):
    from assistant.providers import PROVIDERS
    def get(actual_url, **kwargs):
        assert actual_url == url
        assert kwargs['headers']['Authorization'] == 'Bearer test-only-secret'
        return httpx.Response(200, json=payload, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx, 'get', get)
    assert PROVIDERS[provider].list_models('test-only-secret') == expected


@pytest.mark.parametrize('provider', ['deepseek', 'chatgpt'])
@pytest.mark.parametrize('failure', ['401', '503', 'malformed', 'empty', 'network'])
def test_provider_catalog_failures_are_sanitized(monkeypatch, provider, failure):
    from assistant.providers import PROVIDERS
    from assistant.model import AuthorizationRequired
    def get(url, **kwargs):
        if failure == 'network': raise httpx.ConnectError('test-only-secret')
        payload = {'data': [], 'models': []} if failure == 'empty' else {'error': 'test-only-secret'}
        return httpx.Response(int(failure) if failure.isdigit() else 200, json=payload, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx, 'get', get)
    with pytest.raises(ConnectionError) as caught:
        PROVIDERS[provider].list_models('test-only-secret')
    assert 'test-only-secret' not in str(caught.value)
    assert isinstance(caught.value, AuthorizationRequired) == (failure == '401')


@pytest.mark.parametrize('provider,base_url', [
    ('deepseek', 'https://api.deepseek.com'), ('chatgpt', 'https://api.openai.com/v1/'),
])
def test_connection_opens_and_closes_each_provider_model(connections, provider, base_url):
    with connections.edit() as state:
        state[provider].update(key='test-only', access_token='test-only', expires_at=time.time() + 3600,
                               models=[{'id': 'test-model', 'name': 'Test'}])
    async def run():
        async with connections.open_model(ModelSelection(provider=provider, model='test-model')) as model:
            assert model.model_name == 'test-model'
            assert str(model.client.base_url) == base_url
            assert not model.client.is_closed()
        assert model.client.is_closed()
    asyncio.run(run())


@pytest.mark.parametrize('provider', ['chatgpt', 'deepseek'])
@pytest.mark.parametrize('modalities,expected', [(['text', 'image'], True), (['text'], False), (None, None), ([], None), ('image', None)])
def test_catalog_image_capability_refreshes_without_model_allowlist(tmp_path, monkeypatch, provider, modalities, expected):
    import time
    connections = ModelConnections(tmp_path / 'connections.json')
    selection = ModelSelection(provider=provider, model='gpt-6.1-sol' if provider == 'chatgpt' else 'new-model')
    with connections.edit() as state:
        state[provider].update(key='test', access_token='test', catalog_updated_at=time.time(),
                               models=[{'id': selection.model, 'name': 'Old cache'}])
    monkeypatch.setattr(connections, 'refreshed_chatgpt', lambda: connections.credentials('chatgpt'))
    calls = []
    def get(url, **kwargs):
        calls.append(url)
        item = {'id': selection.model, 'slug': selection.model, 'display_name': 'New', 'visibility': 'list', 'input_modalities': modalities}
        return httpx.Response(200, json={'data': [item], 'models': [item]}, request=httpx.Request('GET', url))
    monkeypatch.setattr(httpx, 'get', get)
    assert connections.image_input_support(selection) is None
    view = connections.refresh_catalog(provider, force=False)
    assert len(calls) == 1
    assert view[provider]['models'][0]['supports_images'] is expected
    assert connections.image_input_support(selection) is expected
    connections.refresh_catalog(provider, force=False)
    assert len(calls) == 1
    modalities = ['text'] if expected is True else ['text', 'image']
    connections.refresh_catalog(provider, force=True)
    assert connections.image_input_support(selection) is (expected is not True)
