import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {createOrbitTrack,selectOrbitRange,orbitPose:inputPose,orbitTargetMeasure}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const {OrbitRound}=await server.ssrLoadModule('/src/game/core/OrbitRound.ts');
const { gameLevels }=await server.ssrLoadModule('/src/game/catalog.ts');
const { createLevelTrack }=await server.ssrLoadModule('/src/game/core/GameLevel.ts');
await server.close();
const orbitPose=(time,beat,track)=>inputPose(time,beat,track,track.targets.length);
const windows={hitMs:150,perfectMs:50};
const balls=(track,pose)=>{
  const anchor=track.points[pose.anchor],moving={x:anchor.x+Math.cos(pose.angle),y:anchor.y+Math.sin(pose.angle)};
  return pose.primaryAnchored?[anchor,moving]:[moving,anchor];
};
for(const level of gameLevels) test(`${level.title} 的连续小节范围保留原落点、双球身份、方向和时值`,()=>{
  const full=createLevelTrack(level),before=structuredClone(full);
  assert.deepEqual(selectOrbitRange(full,full.range),full);
  for(let start=0;start<full.range.endMeasure;start++) for(let end=start+1;end<=full.range.endMeasure;end++){
    const part=selectOrbitRange(full,{startMeasure:start,endMeasure:end});
    assert.equal(part.map,full.map,'局部练习共享完整地图，范围前后的道路不能被裁掉');
    assert.deepEqual(part.map.points,full.points);
    assert.deepEqual(part.map.twirlTiles,full.twirlTiles);
    const startBeat=full.measureStarts[start],endBeat=full.measureStarts[end];
    const expected=full.targets.filter(beat=>beat>=startBeat-1e-8&&beat<endBeat-1e-8);
    assert.deepEqual(part.targets,expected.map(beat=>Math.max(0,beat-startBeat)));
    assert.ok(part.targets[0] === undefined || part.targets[0] >= 0);
    assert.equal(part.durationBeats,endBeat-startBeat);
    for(const time of part.targets.length ? [(part.targets[0] ?? 0)-part.leadInBeats+.000001,...part.targets.map(beat=>beat===0?0:beat-.000001),...part.targets.slice(1).map((beat,i)=>(beat+part.targets[i])/2)] : []){
      const local=orbitPose(time*1000,1000,part),original=orbitPose((time+startBeat)*1000,1000,full);
      assert.equal(local.primaryAnchored,original.primaryAnchored);
      assert.equal(local.direction,original.direction);
      balls(part,local).forEach((ball,i)=>assert.ok(Math.hypot(ball.x-balls(full,original)[i].x,ball.y-balls(full,original)[i].y)<1e-8));
    }
    part.targets.forEach((beat,i)=>assert.equal(orbitTargetMeasure(part,i),full.measureStarts.findLastIndex(start=>start<=beat+startBeat+1e-8)));
    for(const bpm of [40,120,240]){
      const round=new OrbitRound(bpm,windows,part);
      assert.equal(round.tap(-100),false);
      for(const beat of part.targets)assert.equal(round.tap(beat*60000/bpm),true);
      if(!expected.length)round.advance(part.durationBeats*60000/bpm);
      assert.equal(round.snapshot.phase,'completed');
      assert.equal(round.snapshot.hits,expected.length);
    }
  }
  assert.deepEqual(full,before,'截取范围不修改原关卡');
});
test('局部预备先静止展示，最后按原入场间隔进入首拍；重试无旧进度',()=>{
  const level=gameLevels.find(level=>level.id==='comprehensive'),full=createLevelTrack(level);
  for(const startMeasure of [2,4,6,7]){
    const part=selectOrbitRange(full,{startMeasure,endMeasure:startMeasure+1});
    const frozen=orbitPose(-4000,1000,part);
    assert.deepEqual(orbitPose(-part.leadInBeats*1000,1000,part),frozen);
    const mid=orbitPose(-part.leadInBeats*500,1000,part);
    assert.ok(Math.abs(mid.angle-frozen.angle-part.directions[0]*Math.PI*part.leadInBeats/2)<1e-8);
    const missed=new OrbitRound(120,windows,part);missed.advance(151);
    assert.equal(missed.snapshot.phase,'failed');
    assert.equal(orbitTargetMeasure(part,missed.snapshot.hits),startMeasure);
    const retry=new OrbitRound(120,windows,part);
    assert.equal(retry.snapshot.hits,0);assert.equal(retry.snapshot.phase,'count-in');
    assert.equal(retry.tap(0),true);
  }
});
test('范围校验拒绝越界、空范围和小数，已截取的范围仍可继续缩小',()=>{
  const level=gameLevels.find(level=>level.id==='comprehensive'),full=createLevelTrack(level);
  for(const [startMeasure,endMeasure] of [[-1,1],[0,9],[2,2],[3,2],[.5,2],[0,NaN],[0,Infinity]])assert.throws(()=>selectOrbitRange(full,{startMeasure,endMeasure}),/练习范围/);
  const part=selectOrbitRange(full,{startMeasure:2,endMeasure:7});
  assert.deepEqual(selectOrbitRange(part,{startMeasure:4,endMeasure:6}),selectOrbitRange(full,{startMeasure:4,endMeasure:6}));
  assert.throws(()=>selectOrbitRange(part,{startMeasure:0,endMeasure:3}),/练习范围/);
  assert.throws(()=>orbitTargetMeasure(part,-1),/目标下标/);
  assert.throws(()=>orbitTargetMeasure(part,part.targets.length),/目标下标/);
});


test('奇数个目标之前开始局部练习，仍保留原来的双球身份',()=>{
  const full=createOrbitTrack({timeSignature:{beats:3,beatType:4},measures:Array.from({length:2},()=>({elements:Array.from({length:3},()=>({kind:'note',noteValue:'quarter'}))}))});
  const part=selectOrbitRange(full,{startMeasure:1,endMeasure:2});
  assert.equal(part.anchorOffset,3);
  assert.equal(orbitPose(-1000,1000,part).primaryAnchored,false);
  for(const time of [-.5,0,.5,1,1.5,2]){
    const local=orbitPose(time*1000,1000,part),original=orbitPose((time+3)*1000,1000,full);
    assert.equal(local.primaryAnchored,original.primaryAnchored);
    assert.deepEqual(balls(part,local),balls(full,original));
  }
});
