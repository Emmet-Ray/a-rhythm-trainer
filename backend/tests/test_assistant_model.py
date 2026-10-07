"""用真实 SDK 和模拟 DeepSeek Responses HTTP 验证兼容性；不访问供应商。"""
import asyncio
import json

import httpx
import pytest
from openai import AsyncOpenAI

from assistant.providers.deepseek import create_model
from assistant.sessions import ChatSession


def wire(event):
    return f'data: {json.dumps(event)}\n\n'.encode()


def response_events(output, *, response_id='r1'):
    base = {'id':response_id,'object':'response','created_at':1,'status':'in_progress',
            'model':'test-model','output':[],'parallel_tool_calls':False}
    yield {'type':'response.created','response':base}
    for i,item in enumerate(output):
        yield {'type':'response.output_item.added','output_index':i,'item':item}
        if item['type']=='reasoning':
            yield {'type':'response.reasoning_text.delta','item_id':item['id'],'output_index':i,'content_index':0,
                   'delta':item['content'][0]['text']}
        if item['type']=='message':
            text=item['content'][0]['text']
            yield {'type':'response.content_part.added','item_id':item['id'],'output_index':i,'content_index':0,
                   'part':{'type':'output_text','text':'','annotations':[]}}
            yield {'type':'response.output_text.delta','item_id':item['id'],'output_index':i,'content_index':0,'delta':text}
            yield {'type':'response.output_text.done','item_id':item['id'],'output_index':i,'content_index':0,'text':text}
        yield {'type':'response.output_item.done','output_index':i,'item':item}
    yield {'type':'response.completed','response':{**base,'status':'completed','output':output}}


def upstream(output, response_id='r1'):
    chunks=[wire({**e,'sequence_number':i}) for i,e in enumerate(response_events(output,response_id=response_id))]
    return httpx.Response(200,headers={'content-type':'text/event-stream'},content=b''.join(chunks))


def install(monkeypatch, handler):
    def client(**kwargs):
        return AsyncOpenAI(**kwargs,http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr('assistant.providers.deepseek.AsyncOpenAI',client)
    return create_model('test-model','secret-test')


async def consume(model):
    session=ChatSession()
    try:
        async with session.run('出题',model,message_id='u1') as response:
            chunks=[c async for c in response.body_iterator]
        return session, ''.join(chunks)
    finally:
        await model.client.close()


def test_responses_tool_round_trip(monkeypatch):
    requests=[]
    args={'title':'练习','description':'四拍','exercise':{'timeSignature':{'beats':4,'beatType':4},
          'measures':[{'elements':[{'kind':'note','noteValue':'whole'}]}]}}
    reasoning={'id':'rs_1','type':'reasoning','summary':[], 'content':[{'type':'reasoning_text','text':'规划节奏'}]}
    call={'id':'fc_1','type':'function_call','call_id':'call_1','name':'propose_rhythm_exercise',
          'arguments':json.dumps(args),'status':'completed'}
    answer={'id':'msg_1','type':'message','status':'completed','role':'assistant',
            'content':[{'type':'output_text','text':'慢速练习','annotations':[]}]}
    def handler(request):
        assert request.url.host=='api.deepseek.com' and request.url.path=='/responses'
        body=json.loads(request.content); requests.append(body)
        assert body['model']=='test-model' and body['stream'] is True
        assert body['tools'][0]['name']=='propose_rhythm_exercise'
        assert body['tools'][0]['strict'] is False
        if len(requests)==1: return upstream([reasoning,call])
        returns=[p for p in body['input'] if p.get('type')=='function_call_output']
        assert returns[-1]['call_id']=='call_1'
        assert json.loads(returns[-1]['output'])['generated_exercise']['title']=='练习'
        assert any(p.get('type')=='reasoning' and p.get('id')=='rs_1'
                   and p.get('content')==reasoning['content'] for p in body['input'])
        return upstream([answer],'r2')
    session,stream=asyncio.run(consume(install(monkeypatch,handler)))
    assert session.last_run_status=='completed'
    assert len(requests)==2
    assert stream.index('tool-output-available')<stream.index('慢速练习')
    assert '规划节奏' not in stream  # 内部推理不提供给聊天界面。
    assert '规划节奏' not in json.dumps(session.snapshot(), ensure_ascii=False)


@pytest.mark.parametrize('code,message',[(401,'凭证无效'),(402,'额度不足'),(429,'请求受限'),(500,'模型服务请求失败')])
def test_upstream_errors_are_sanitized_without_retries(monkeypatch,code,message):
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(code,json={'error':{'message':'secret-test'}})
    session,stream=asyncio.run(consume(install(monkeypatch,handler)))
    assert session.last_run_status=='failed'
    assert message in stream
    assert 'secret-test' not in stream
    assert len(calls)==1


def test_missing_terminal_does_not_execute_partial_tool(monkeypatch):
    call={'id':'fc_1','type':'function_call','call_id':'call_1','name':'propose_rhythm_exercise','arguments':'','status':'in_progress'}
    events=list(response_events([call]))[:2]
    events.append({'type':'response.function_call_arguments.delta','item_id':'fc_1','output_index':0,'delta':'{"title":'})
    model=install(monkeypatch,lambda request: httpx.Response(200,headers={'content-type':'text/event-stream'},
        content=b''.join(wire({**e,'sequence_number':i}) for i,e in enumerate(events))))
    session,stream=asyncio.run(consume(model))
    assert 'tool-output-available' not in stream
    assert session.last_run_status=='failed'


def test_missing_terminal_does_not_commit_complete_looking_text(monkeypatch):
    answer={'id':'m1','type':'message','status':'completed','role':'assistant',
            'content':[{'type':'output_text','text':'未确认完整的回答','annotations':[]}]}
    events=list(response_events([answer]))[:-1]
    model=install(monkeypatch,lambda request: httpx.Response(200,headers={'content-type':'text/event-stream'},
        content=b''.join(wire({**e,'sequence_number':i}) for i,e in enumerate(events))))
    session,stream=asyncio.run(consume(model))
    assert session.last_run_status=='failed'
    assert '未确认完整的回答' not in json.dumps(session.snapshot(),ensure_ascii=False)


def test_unconfirmed_tool_call_is_not_executed_or_retried(monkeypatch):
    args={'title':'不应生成','description':'四拍','exercise':{'timeSignature':{'beats':4,'beatType':4},
          'measures':[{'elements':[{'kind':'note','noteValue':'whole'}]}]}}
    call={'id':'fc1','type':'function_call','call_id':'c1','name':'propose_rhythm_exercise',
          'arguments':json.dumps(args),'status':'completed'}
    events=list(response_events([call]))[:-1]
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(200,headers={'content-type':'text/event-stream'},
            content=b''.join(wire({**e,'sequence_number':i}) for i,e in enumerate(events)))
    session,stream=asyncio.run(consume(install(monkeypatch,handler)))
    assert session.last_run_status=='failed'
    assert len(calls)==1
    assert 'tool-output-available' not in stream
    assert len(session.snapshot()['messages'])==1


def test_cancelling_http_stream_closes_upstream(monkeypatch):
    async def scenario():
        waiting, closed = asyncio.Event(), asyncio.Event()
        class SlowStream(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield wire({'type':'response.created','sequence_number':0,'response':{
                    'id':'r1','model':'test-model','status':'in_progress','output':[]}})
                waiting.set()
                await asyncio.Event().wait()
            async def aclose(self):
                closed.set()
        model=install(monkeypatch,lambda _: httpx.Response(200,headers={'content-type':'text/event-stream'},stream=SlowStream()))
        task=asyncio.create_task(consume(model))
        await asyncio.wait_for(waiting.wait(),2)
        task.cancel()
        with pytest.raises(asyncio.CancelledError): await task
        assert closed.is_set()
        assert model.client.is_closed()
    asyncio.run(scenario())
