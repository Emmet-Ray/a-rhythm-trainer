import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
after(()=>server.close());
const api = await server.ssrLoadModule('/src/practice-records/practiceRecordStorage.ts');
const exercise={timeSignature:{beats:4,beatType:4},measures:[{elements:[{kind:'note',noteValue:'whole'}]}]};
const context={source:'custom',exerciseId:'one',title:'测试题'};
const action=id=>({mode:'dictation',attemptId:'attempt-1',event:{type:'play',scope:'all'},at:`2026-10-07T00:00:0${id}Z`});
function mock(t) {
  let state={revision:0,records:[]};const ledger=new Set();
  const control={conflict:false,loseResponse:false,fail:false};
  t.mock.method(globalThis,'fetch',async (_url,options={})=>{
    if(control.fail)throw Error('offline');
    if(!options.method)return Response.json(state);
    const body=JSON.parse(options.body);
    if(ledger.has(body.operation_id))return Response.json(state);
    if(control.conflict){control.conflict=false;state.revision++;return new Response('',{status:409});}
    if(body.revision!==state.revision)return new Response('',{status:409});
    state={revision:state.revision+1,records:body.records};ledger.add(body.operation_id);
    if(control.loseResponse){control.loseResponse=false;throw Error('lost response');}
    return Response.json(state);
  });
  return {control,read:()=>structuredClone(state)};
}
test('记录无需浏览器存储，串行写入并在版本冲突后重放',async t=>{
  const {control,read}=mock(t);control.conflict=true;
  await Promise.all([api.savePracticeActions(context,exercise,'dictation',[action(1)]),api.savePracticeActions(context,exercise,'dictation',[action(2)])]);
  assert.equal(read().records.length,1);
  assert.equal(read().records[0].attempts[0].measures[0].questionPlayCount,2);
  assert.equal(api.listPracticeRecords().length,1);
});
test('保存成功但响应丢失，重试同一批次不重复计数',async t=>{
  const {control,read}=mock(t);control.loseResponse=true;
  const batch=[action(1)];
  await assert.rejects(api.savePracticeActions(context,exercise,'dictation',batch));
  await api.savePracticeActions(context,exercise,'dictation',batch);
  assert.equal(read().records[0].attempts[0].measures[0].questionPlayCount,1);
});
test('服务失败显示错误，删除后旧页面不能重新创建原记录',async t=>{
  const {control,read}=mock(t);
  const id=await api.savePracticeActions(context,exercise,'dictation',[action(1)]);
  await api.deletePracticeRecord(id);
  await assert.rejects(api.savePracticeActions(context,exercise,'dictation',[action(2)],id),/已被删除/);
  assert.deepEqual(read().records,[]);
  control.fail=true;
  await assert.rejects(api.refreshPracticeRecords());
  assert.throws(()=>api.listPracticeRecords(),/offline/);
});
