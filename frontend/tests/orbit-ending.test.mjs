import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {OrbitEnding,ORBIT_FAILURE_REVEAL_MS,ORBIT_LANDING_MS}=await server.ssrLoadModule('/src/game/runtime/OrbitEnding.ts');
const {READY_ORBIT}=await server.ssrLoadModule('/src/game/core/OrbitRound.ts');
await server.close();
const complete={...READY_ORBIT,phase:'completed',hits:4};

test('末拍提前命中不跳过入场，展示等原时值、落地反馈和真实尾音全部结束',()=>{
  const ending=new OrbitEnding(4000);
  const pending=ending.read(complete,2900,false,3000);
  assert.equal(pending.phase,'finishing');assert.equal(pending.hits,4);
  assert.equal(ending.read(complete,2999,true,3000),pending);
  assert.equal(ending.read(complete,3000+ORBIT_LANDING_MS,true,3000),pending,'末次落地后仍保留最后一个音符的时值');
  assert.equal(ending.read(complete,4000,false,3000),pending,'到达乐句末尾但还有声音时不能展示结果');
  assert.equal(ending.read(complete,4050,true,3000),complete);
  assert.equal(ending.read(complete,5000,false,3000),complete,'已展示结果不因后续通知退回收尾');
});

test('极短末音至少展示落地反馈，长音试听不会额外重复等一段动画',()=>{
  const fast=new OrbitEnding(1000);
  assert.equal(fast.read(complete,1000,true,950).phase,'finishing');
  assert.equal(fast.read(complete,950+ORBIT_LANDING_MS,true,950),complete);
  const preview=new OrbitEnding(4000);
  assert.equal(preview.read(complete,4000,false,2000).phase,'finishing');
  assert.equal(preview.read(complete,4350,true,2000),complete);
});

for(const failure of ['early','late','extra'])test(`${failure} 判定失败保持命中事实，短位置反馈后才展示重试结果`,()=>{
  const ending=new OrbitEnding(4000),snapshot={...READY_ORBIT,phase:'failed',failure,hits:2,earlyTaps:failure==='late'?0:4};
  const pending=ending.read(snapshot,1234,false,0);
  assert.equal(pending.phase,'failing');assert.equal(pending.hits,2);assert.equal(pending.failure,failure);
  assert.equal(ending.atMs,1234);
  assert.equal(ending.read(snapshot,1234+ORBIT_FAILURE_REVEAL_MS-1,true,0),pending);
  assert.equal(ending.read(snapshot,1234+ORBIT_FAILURE_REVEAL_MS,false,0),snapshot,'失败无需等待已取消的声部');
});

test('正常预备和三次容忍输入不进入结束流程，新轮没有旧的结束等待',()=>{
  const old=new OrbitEnding(4000);
  for(const phase of ['ready','loading','count-in','playing']){
    const snapshot={...READY_ORBIT,phase,earlyTaps:3};
    assert.equal(old.read(snapshot,100,false,0),snapshot);
    assert.equal(old.atMs,-Infinity);
  }
  old.read(complete,3000,false,3000);
  const fresh=new OrbitEnding(4000);
  assert.equal(fresh.read(READY_ORBIT,0,false,0),READY_ORBIT);
  assert.equal(fresh.atMs,-Infinity);
});
