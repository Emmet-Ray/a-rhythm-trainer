"""JSONL 持久化的真实文件与 HTTP 边界，不调用付费模型。"""
import asyncio
import json
from contextlib import aclosing

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.models.function import FunctionModel, DeltaToolCall
from pydantic_ai.models.test import TestModel as SDKTestModel
from pydantic_ai.messages import ToolReturnPart, UserPromptPart

from api.assistant import get_model
from assistant.context import PageContext
from assistant.journal import SessionStorageError
from assistant.sessions import SessionStore, CardState
from main import create_app

OWNER = 'a' * 64
ARGS = {"title": "入门听写", "mode": "dictation", "description": "入门", "exercise": {
    "timeSignature": {"beats": 4, "beatType": 4},
    "measures": [{"elements": [{"kind": "note", "noteValue": "whole"}]}]}}

async def generate(messages, info):
    if any(isinstance(p, ToolReturnPart) for m in messages for p in m.parts):
        yield '跟着节拍练习。'
    else:
        yield {0: DeltaToolCall(name='propose_rhythm_exercise', json_args=json.dumps(ARGS), tool_call_id='call1')}

async def consume(session, model, message_id='u1'):
    context = PageContext(page='home', description='首页', state={'practice_focus': {'exerciseId': 'old'}})
    async with session.run('出一道听写题', model, context, message_id=message_id) as response:
        return [chunk async for chunk in response.body_iterator]


def test_restart_restores_sdk_history_cards_context_and_continues(tmp_path):
    store = SessionStore(tmp_path)
    session = store.create(OWNER)
    asyncio.run(consume(session, FunctionModel(stream_function=generate)))
    snapshot = session.snapshot()
    card = next(p['output']['generated_exercise'] for m in snapshot['messages'] for p in m['parts'] if p.get('state') == 'output-available')
    session.update_card(card['id'], CardState(bpm=85, answer_viewed=True))
    # 其他标签页不能把已曝光题目重新标记成未看答案。
    assert session.update_card(card['id'], CardState(bpm=90, answer_viewed=False))['answer_viewed']
    expected = session.snapshot()
    store.close()
    restored = SessionStore(tmp_path)
    try:
        loaded = restored.get(session.id, OWNER)
        assert loaded.snapshot() == expected
        assert restored.list(OWNER)['sessions'][0]['title'] == '出一道听写题'
        async def continuation(messages, info):
            assert any(isinstance(p, ToolReturnPart) for m in messages for p in m.parts)
            assert any(isinstance(p, UserPromptPart) and isinstance(p.content, str) and 'practice_focus' in p.content for m in messages for p in m.parts)
            yield '继续练习'
        asyncio.run(consume(loaded, FunctionModel(stream_function=continuation), 'u2'))
        assert len(loaded.turns) == 2
        assert loaded.snapshot()['messages'][-1]['parts'][-1]['text'] == '继续练习'
    finally:
        restored.close()


def test_partial_tail_recovery_does_not_discard_complete_corrupt_lines(tmp_path):
    store = SessionStore(tmp_path)
    session = store.create(OWNER)
    asyncio.run(consume(session, SDKTestModel(call_tools=[], custom_output_text='回答')))
    path = store.journal.path(OWNER, session.id)
    expected = session.snapshot()
    store.close()
    with path.open('ab') as file:
        file.write(b'{"type":"check')
    reopened = SessionStore(tmp_path)
    assert reopened.get(session.id, OWNER).snapshot() == expected
    assert path.read_bytes().endswith(b'\n')
    reopened.close()
    with path.open('ab') as file:
        file.write(b'{broken}\n')
    damaged = path.read_bytes()
    reopened = SessionStore(tmp_path)
    try:
        with pytest.raises(SessionStorageError):
            reopened.get(session.id, OWNER)
        assert path.read_bytes() == damaged
        assert reopened.list(OWNER)['sessions'][0]['unreadable']
        reopened.delete(session.id, OWNER)
        assert not path.exists()
    finally:
        reopened.close()


def test_unfinished_checkpoint_recovers_tool_result_without_model_call(tmp_path):
    async def scenario():
        store = SessionStore(tmp_path)
        session = store.create(OWNER)
        waiting = asyncio.Event()
        async def model(messages, info):
            if any(isinstance(p, ToolReturnPart) for m in messages for p in m.parts):
                waiting.set()
                await asyncio.Event().wait()
            else:
                yield {0: DeltaToolCall(name='propose_rhythm_exercise', json_args=json.dumps(ARGS), tool_call_id='call1')}
        task = asyncio.create_task(consume(session, FunctionModel(stream_function=model)))
        await asyncio.wait_for(waiting.wait(), 5)
        path = store.journal.path(OWNER, session.id)
        # 截取当时已落盘的文件，模拟进程被强制退出，未执行 finally。
        checkpoint = path.read_bytes()
        assert b'tool-return' in checkpoint
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        store.close()
        path.write_bytes(checkpoint)
        reopened = SessionStore(tmp_path)
        try:
            loaded = reopened.get(session.id, OWNER)
            assert loaded.last_run_status == 'cancelled'
            assert not loaded.is_running
            assert any(p.get('state') == 'output-available' for m in loaded.snapshot()['messages'] for p in m['parts'])
            assert json.loads(path.read_text().splitlines()[-1])['status'] == 'cancelled'
        finally:
            reopened.close()
    asyncio.run(scenario())


def test_http_instance_restart_list_and_delete():
    def app():
        instance = create_app()
        instance.dependency_overrides[get_model] = lambda: SDKTestModel(call_tools=[], custom_output_text='回答')
        return instance
    with TestClient(app()) as client:
        first = client.post('/api/assistant/sessions')
        assert 'set-cookie' not in first.headers
        sid = first.json()['id']
        endpoint = f'/api/assistant/sessions/{sid}'
        client.post(endpoint + '/messages', json={'text': '第一条问题', 'message_id': 'u1'})
        saved = client.get(endpoint).json()
        assert client.get('/api/assistant/sessions').json()['total'] == 1
        client.cookies.clear()
        assert client.get(endpoint).status_code == 200
        assert client.get('/api/assistant/sessions').json()['total'] == 1
    with TestClient(app()) as client:
        assert client.get(endpoint).json() == saved
        assert client.post(endpoint + '/messages', json={'text': '再问', 'message_id': 'u1'}).status_code == 409
        assert client.put(endpoint + '/cards/unknown', json={'bpm': 60, 'answer_viewed': False}).status_code == 404
        assert client.delete(endpoint).status_code == 204
        assert client.get(endpoint).status_code == 404
        assert client.get('/api/assistant/sessions').json()['total'] == 0


def test_second_writer_is_rejected_and_lock_released(tmp_path):
    store = SessionStore(tmp_path)
    with pytest.raises(SessionStorageError):
        SessionStore(tmp_path)
    store.close()
    SessionStore(tmp_path).close()


def test_disk_failure_does_not_start_model(tmp_path, monkeypatch):
    async def scenario():
        store = SessionStore(tmp_path)
        session = store.create(OWNER)
        def fail(*args, **kwargs):
            raise SessionStorageError('对话保存失败')
        monkeypatch.setattr(store.journal, 'append', fail)
        try:
            with pytest.raises(SessionStorageError):
                await consume(session, SDKTestModel())
            assert not session.is_running
            assert not session.turns
        finally:
            store.close()
    asyncio.run(scenario())


def test_cancel_while_accepting_keeps_memory_and_disk_consistent(tmp_path, monkeypatch):
    from threading import Event
    async def scenario():
        store = SessionStore(tmp_path)
        session = store.create(OWNER)
        writing, release = Event(), Event()
        append = store.journal.append
        def delayed(owner, sid, record, **kwargs):
            if record['type'] == 'turn_started':
                writing.set()
                assert release.wait(5)
            append(owner, sid, record, **kwargs)
        monkeypatch.setattr(store.journal, 'append', delayed)
        task = asyncio.create_task(consume(session, SDKTestModel(call_tools=[])))
        assert await asyncio.to_thread(writing.wait, 5)
        task.cancel()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not session.is_running
        assert session.last_run_status == 'cancelled'
        expected = session.snapshot()
        store.close()
        reopened = SessionStore(tmp_path)
        try:
            assert reopened.get(session.id, OWNER).snapshot() == expected
        finally:
            reopened.close()
    asyncio.run(scenario())


def test_deleted_session_cannot_be_resurrected_by_pending_write(tmp_path):
    store = SessionStore(tmp_path)
    session = store.create(OWNER)
    store.delete(session.id, OWNER)
    try:
        with pytest.raises(SessionStorageError):
            session.save({'type': 'checkpoint'})
        assert not store.journal.path(OWNER, session.id).exists()
    finally:
        store.close()
