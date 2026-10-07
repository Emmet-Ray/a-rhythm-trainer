import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
after(()=>server.close());
const api=await server.ssrLoadModule('/src/practice-records/practiceRecordStorage.ts');
const {recordDictationEvent}=await server.ssrLoadModule('/src/practice-records/practiceRecords.ts');
const exercise={timeSignature:{beats:4,beatType:4},measures:[{elements:[{kind:'note',noteValue:'whole'}]}]};
const context={source:'custom',exerciseId:'one',title:'测试题'};
const play=(record=null,id='attempt-1')=>recordDictationEvent(record,context,exercise,id,{type:'play',scope:'all'},'2026-10-07T00:00:01Z');
function mock(t) {
  const attempts=new Map();const calls=[];
  const control={lose:false,deleted:false,fail:false};
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(control.fail)throw Error('offline');
    const payload=options.body&&JSON.parse(options.body);calls.push({url,method:options.method,payload});
    if(url==='/api/local-data/records'&&options.method==='POST'){
      control.deleted=false;
      for(const a of payload.attempts)if(!attempts.has(a.id))attempts.set(a.id,a);
    }else if(options.method==='DELETE'){control.deleted=true;attempts.clear();}
    else if(options.method==='POST'||options.method==='PUT'){
      if(control.deleted)return new Response('',{status:404});
      if(options.method==='PUT'||!attempts.has(payload.attempt.id))attempts.set(payload.attempt.id,payload.attempt);
    }
    if(control.lose){control.lose=false;throw Error('lost response');}
    return Response.json({id:'archive-1',ok:true});
  });
  return {control,calls,attempts};
}
test('首次创建档案，之后只更新改变的尝试，不整份读取历史',async t=>{
  const {calls,attempts}=mock(t);const save=api.createPracticeRecordWriter();
  const record=play();await save(record);await save(record);await save(play(record));
  assert.equal(calls.length,2);
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[1].url,'/api/local-data/records/archive-1/attempts/attempt-1');
  assert.equal(calls[1].method,'PUT');
  assert.equal(attempts.get('attempt-1').measures[0].questionPlayCount,2);
});
test('创建和更新响应丢失后重试仍只保存一次累计值',async t=>{
  const {control,attempts}=mock(t);const save=api.createPracticeRecordWriter();const record=play();
  control.lose=true;await assert.rejects(save(record));await save(record);
  control.lose=true;const next=play(record);await assert.rejects(save(next));await save(next);
  assert.equal(attempts.size,1);assert.equal(attempts.get('attempt-1').measures[0].questionPlayCount,2);
});
test('删除后旧访问更新失败，不再创建档案；新访问允许新建',async t=>{
  const {calls,attempts}=mock(t);const save=api.createPracticeRecordWriter();const record=play();await save(record);
  await api.clearPracticeRecords();await assert.rejects(save(play(record)),/已被删除/);
  assert.equal(attempts.size,0);assert.equal(calls.filter(c=>c.url==='/api/local-data/records'&&c.method==='POST').length,1);
  await api.createPracticeRecordWriter()(play(null,'new'));assert.equal(attempts.size,1);
});
test('同一访问新尝试使用创建接口，已有尝试不重复提交',async t=>{
  const {calls}=mock(t);const save=api.createPracticeRecordWriter();const first=play();await save(first);
  await save(play(first,'second'));
  assert.equal(calls.length,2);assert.equal(calls[1].url,'/api/local-data/records/archive-1/attempts');
  assert.equal(calls[1].payload.attempt.id,'second');
});
test('请求失败保留待存快照，重试不依赖浏览器持久存储',async t=>{
  const {control,attempts}=mock(t);const save=api.createPracticeRecordWriter();const record=play();
  control.fail=true;await assert.rejects(save(record),/offline/);control.fail=false;
  await save(record);assert.equal(attempts.size,1);
});
test('跨题目复用写入器被拒绝',async t=>{
  mock(t);const save=api.createPracticeRecordWriter();await save(play());
  await assert.rejects(save({...play(),exerciseId:'other'}),/切换题目/);
});
test('列表查询包含服务端分页与时间筛选，不要求加载全量记录',()=>{
  const now=new Date('2026-10-07T10:00:00Z');
  const params=new URLSearchParams(api.recordListQuery('dictation','week',2,now));
  assert.equal(params.get('mode'),'dictation');assert.equal(params.get('page'),'2');
  assert.equal(params.get('before'),now.toISOString());assert.ok(params.get('after'));assert.ok(params.get('zone'));
});
