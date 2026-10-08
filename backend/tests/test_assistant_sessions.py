"""SDK 与应用边界：服务端历史、工具卡片、取消与失败恢复。"""
import asyncio
import json
from contextlib import aclosing

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.models.function import FunctionModel, DeltaToolCall
from pydantic_ai.models.test import TestModel as SDKTestModel
from pydantic_ai.messages import ToolReturnPart

from api.assistant import get_model
from assistant.sessions import ChatSession, SessionBusy
from assistant.context import PageContext
from main import create_app

ARGS = {"title": "练习", "mode": "dictation", "description": "入门", "exercise": {
    "timeSignature": {"beats": 4, "beatType": 4},
    "measures": [{"elements": [{"kind": "note", "noteValue": "whole"}]}]}}


def tool_results(messages):
    return [p for m in messages for p in m.parts if isinstance(p, ToolReturnPart)]


async def consume(session, model, message_id="u1"):
    async with session.run("问题", model, message_id=message_id) as response:
        return [chunk async for chunk in response.body_iterator]


def test_http_uses_sdk_stream_and_server_owned_history():
    app = create_app()
    app.dependency_overrides[get_model] = lambda: SDKTestModel(call_tools=[], custom_output_text="回答")
    with TestClient(app) as client:
        sid = client.post('/api/assistant/sessions').json()['id']
        path = f'/api/assistant/sessions/{sid}'
        response = client.post(path+'/messages', json={"text": "你好", "message_id": "u1"})
        assert response.headers['x-vercel-ai-ui-message-stream'] == 'v1'
        assert response.headers['cache-control'] == 'no-store'
        assert '"type":"text-delta"' in response.text
        assert 'data: [DONE]' in response.text
        saved = client.get(path).json()
        assert saved['last_run_status'] == 'completed'
        assert [m['role'] for m in saved['messages']] == ['user', 'assistant']
        assert saved['messages'][0]['id'] == 'u1'
        assert saved['messages'][1]['id'] in response.text
        assert client.post(path+'/messages', json={"text": "你好", "message_id": "u1"}).status_code == 409
        assert client.post(path+'/messages', json={"text": "问题", "message_id": "u2", "messages": []}).status_code == 422
        assert len(client.get(path).json()['messages']) == 2
        other = client.post('/api/assistant/sessions').json()
        assert other['messages'] == []


@pytest.mark.parametrize('ending', ['complete', 'fail', 'cancel'])
def test_generated_result_is_available_before_followup_and_survives_interruption(ending):
    async def scenario():
        release, waiting = asyncio.Event(), asyncio.Event()
        closed = []
        async def model(messages, info):
            try:
                if not tool_results(messages):
                    yield {0: DeltaToolCall(name='propose_rhythm_exercise', json_args=json.dumps(ARGS), tool_call_id='call1')}
                else:
                    waiting.set()
                    await release.wait()
                    if ending == 'fail': raise RuntimeError('PRIVATE_PROVIDER_DETAILS')
                    yield '练习建议'
            finally:
                closed.append(True)
        session = ChatSession()
        events = []
        available = asyncio.Event()
        async def run():
            async with session.run('出题', FunctionModel(stream_function=model), message_id='u1') as response:
                async with aclosing(response.body_iterator) as stream:
                    async for chunk in stream:
                        events.append(chunk)
                        if 'tool-output-available' in chunk: available.set()
        task = asyncio.create_task(run())
        await asyncio.wait_for(available.wait(), 2)
        await asyncio.wait_for(waiting.wait(), 2)
        assert session.is_running
        with pytest.raises(SessionBusy):
            async with session.run('第二轮', SDKTestModel(), message_id='u2'): pass
        if ending == 'cancel':
            task.cancel()
            with pytest.raises(asyncio.CancelledError): await task
        else:
            release.set()
            await task
        saved = session.snapshot()
        assert not saved['is_running']
        assert saved['last_run_status'] == {'complete':'completed','fail':'failed','cancel':'cancelled'}[ending]
        result = next(p for p in saved['messages'][1]['parts'] if p.get('state') == 'output-available')
        assert result['output']['generated_exercise']['mode'] == 'dictation'
        assert result['toolCallId'] == 'call1'
        assert 'PRIVATE_PROVIDER_DETAILS' not in ''.join(events)
        assert len(closed) == 2
        # 中断后可继续，历史中的工具结果仍由 SDK 管理。
        await consume(session, SDKTestModel(call_tools=[],custom_output_text='继续'), 'u2')
        assert len(session.turns) == 2
        assert session.snapshot()['messages'][-1]['parts'][-1]['text'] == '继续'
    asyncio.run(scenario())


def test_invalid_tool_arguments_are_corrected_by_sdk():
    async def scenario():
        attempts = []
        async def model(messages, info):
            attempts.append(messages)
            if len(attempts) <= 2:
                args = dict(ARGS, title=[] if len(attempts) == 1 else '修正练习')
                yield {0: DeltaToolCall(name='propose_rhythm_exercise', json_args=json.dumps(args),tool_call_id=f'c{len(attempts)}')}
            else: yield '完成'
        session = ChatSession()
        chunks = await consume(session, FunctionModel(stream_function=model))
        assert session.last_run_status == 'completed'
        assert len(attempts) == 3
        assert sum('tool-output-available' in c for c in chunks) == 1
    asyncio.run(scenario())


def test_cancel_before_consumption_preserves_accepted_input_and_copy():
    async def scenario():
        s=ChatSession()
        context=PageContext(page='editor',description='编辑器',state={'count':2})
        async with s.run('问题',SDKTestModel(),context,message_id='u1'):
            context.state['count']=99
        assert s.last_run_status == 'cancelled'
        assert s.snapshot()['messages'][0]['metadata']['page_context']['state']['count']==2
        assert not s.is_running
    asyncio.run(scenario())


def test_completion_confirmation_is_persisted_and_old_cleanup_cannot_unlock_next_run():
    async def scenario():
        session = ChatSession()
        model = SDKTestModel(call_tools=[], custom_output_text="回答")
        first = session.run("第一条", model, message_id="u1")
        response = await first.__aenter__()
        chunks = [chunk async for chunk in response.body_iterator]
        stream = "".join(chunks)
        assert stream.index('data-turn-accepted') < stream.index('text-delta')
        assert stream.index('data-turn-completed') < stream.index('"type":"finish"')
        assert session.last_run_status == "completed"
        assert not session.is_running
        assert session.snapshot()["messages"][1]["parts"][-1]["text"] == "回答"
        async with session.run("第二条", model, message_id="u2") as second:
            assert session.is_running
            await first.__aexit__(None, None, None)
            assert session.is_running
            _ = [chunk async for chunk in second.body_iterator]
        assert not session.is_running
    asyncio.run(scenario())
