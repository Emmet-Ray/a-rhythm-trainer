import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { OrbitRound } = await server.ssrLoadModule('/src/game/core/OrbitRound.ts');
const { createOrbitTrack, orbitPose: inputPose } = await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const { gameLevels }=await server.ssrLoadModule('/src/game/catalog.ts');
const { createLevelTrack }=await server.ssrLoadModule('/src/game/core/GameLevel.ts');
const quarter = createOrbitTrack(gameLevels[0].exercise, gameLevels[0].twirlTiles);
const eighth = createOrbitTrack(gameLevels[1].exercise, gameLevels[1].twirlTiles);
// Planned route geometry assumes every target has been accepted. Input-gated behavior is tested separately.
const pose = (time, beat, track) => inputPose(time, beat, track, track.targets.length);
const orbitPose = (time, beat) => pose(time, beat, quarter);
await server.close();
const windows = { hitMs: 150, perfectMs: 50 };

test('同一目标前三次提前误敲只提示、不消耗目标或改变运动，第四次才结束',()=>{
  const track=createOrbitTrack(gameLevels[0].exercise,[2]);
  const round=new OrbitRound(60,windows,track);
  round.tap(0);
  for(let count=1;count<=3;count++){
    const time=count*100,before=inputPose(time,1000,track,round.snapshot.hits);
    assert.equal(round.tap(time),false,'只有有效命中才能触发发声');
    assert.equal(round.snapshot.phase,'playing');
    assert.equal(round.snapshot.earlyTaps,count);
    assert.equal(round.snapshot.hits,1);
    assert.equal(round.snapshot.feedback,'过早');
    assert.equal(round.stoppedAtMs,null);
    assert.deepEqual(inputPose(time,1000,track,round.snapshot.hits),before);
  }
  round.advance(500);assert.equal(round.snapshot.earlyTaps,3,'等待或继续旋转不重置次数');
  assert.equal(round.tap(600),false);
  assert.equal(round.snapshot.phase,'failed');
  assert.equal(round.snapshot.failure,'extra');
  assert.equal(round.snapshot.earlyTaps,4);
  assert.equal(round.stoppedAtMs,600);
  const failed=round.snapshot;
  round.tap(1000);round.advance(9000);assert.equal(round.snapshot,failed);
  assert.equal(new OrbitRound(60,windows,track).snapshot.earlyTaps,0,'重试重新计数');
});

test('提前误敲按当前目标独立计数；窗口内的偏早、偏晚均命中并清零',()=>{
  const round=new OrbitRound(60,windows,quarter);
  for(const time of [-3000,-1000,-1])round.tap(time);
  assert.equal(round.snapshot.earlyTaps,0,'预备拍输入不计误敲');
  round.tap(0);
  for(const time of [100,200,300])assert.equal(round.tap(time),false);
  assert.equal(round.tap(850),true,'左端窗口包含边界');
  assert.equal(round.snapshot.feedback,'偏早');assert.equal(round.snapshot.earlyTaps,0);
  for(const time of [900,1000,1100])assert.equal(round.tap(time),false);
  assert.equal(round.snapshot.earlyTaps,3);
  assert.equal(round.tap(2100),true);
  assert.equal(round.snapshot.feedback,'偏晚');assert.equal(round.snapshot.earlyTaps,0);
  assert.equal(round.snapshot.hits,3);
});

test('每个目标都可独立容忍三次提前误敲，累计超过三次也能通关',()=>{
  for(const level of gameLevels)for(const bpm of [40,100,240]){
    const track=createLevelTrack(level),round=new OrbitRound(bpm,windows,track);
    track.targets.forEach((beat,index)=>{
      const target=beat*round.beatMs;
      if(index>0){
        const previous=track.targets[index-1]*round.beatMs;
        const opensAt=Math.max(target-windows.hitMs,(previous+target)/2);
        for(let count=1;count<=3;count++){
          assert.equal(round.tap(previous+(opensAt-previous)*count/4),false,level.id);
          assert.equal(round.snapshot.earlyTaps,count,level.id);
          assert.equal(round.snapshot.hits,index,level.id);
        }
      }
      assert.equal(round.tap(target),true,level.id);
      assert.equal(round.snapshot.earlyTaps,0,level.id);
    });
    assert.equal(round.snapshot.phase,'completed',level.id);
  }
});

test('三次提前误敲不延长命中窗口；超时输入仍以原定截止时刻漏拍结束',()=>{
  for(const input of [false,true]){
    const round=new OrbitRound(60,windows,quarter);
    round.tap(0);[100,200,300].forEach(time=>round.tap(time));
    if(input)assert.equal(round.tap(1150),false);else round.advance(1150);
    assert.equal(round.snapshot.phase,'failed');assert.equal(round.snapshot.failure,'late');
    assert.equal(round.snapshot.hits,1);assert.equal(round.snapshot.earlyTaps,3);
    assert.equal(round.stoppedAtMs,1150);
  }
});

test('未命中时绕原圆心匀速越过目标，超时冻结在越过的位置', () => {
  const round = new OrbitRound(60, windows, quarter);
  const atTarget = inputPose(0, round.beatMs, quarter, 0);
  for (const time of [25, 75, 149]) {
    round.advance(time);
    const p = inputPose(time, round.beatMs, quarter, round.snapshot.hits);
    assert.equal(p.anchor, 0);
    assert.equal(p.primaryAnchored, atTarget.primaryAnchored);
    assert.ok(Math.sin(p.angle) > 0, '顺时针越过首个目标');
    assert.ok(Math.abs(p.angle - atTarget.angle - Math.PI * time / 1000) < 1e-10);
    assert.equal(round.snapshot.phase, 'playing');
  }
  round.advance(200);
  assert.equal(round.snapshot.failure, 'late');
  assert.equal(round.stoppedAtMs, 150);
  const failed = inputPose(round.stoppedAtMs, round.beatMs, quarter, round.snapshot.hits);
  assert.equal(failed.anchor, 0);
  assert.ok(Math.sin(failed.angle) > 0);
  round.advance(500);
  assert.deepEqual(inputPose(round.stoppedAtMs, round.beatMs, quarter, round.snapshot.hits), failed);
});

test('晚按命中才换圆心，后续旋转仍跟随音乐拍位，偏差不会累积', () => {
  const round = new OrbitRound(120, windows, quarter);
  for (let i = 0; i < quarter.targets.length; i++) {
    const time = quarter.targets[i] * round.beatMs + 80;
    const before = inputPose(time, round.beatMs, quarter, round.snapshot.hits);
    assert.equal(before.anchor, i);
    assert.equal(round.tap(time), true);
    const after = inputPose(time, round.beatMs, quarter, round.snapshot.hits);
    assert.equal(after.anchor, i + 1);
    assert.notEqual(after.primaryAnchored, before.primaryAnchored);
    assert.equal(after.direction, quarter.directions[i + 1]);
    if (i + 1 < quarter.targets.length) {
      assert.ok(Math.abs(after.angle - quarter.angles[i + 1] - after.direction * Math.PI * 80 / round.beatMs) < 1e-10);
    }
  }
  assert.equal(round.snapshot.phase, 'completed');
});

test('偏早命中不提前交换圆心；未命中转向地块不自动反向', () => {
  const track = createOrbitTrack(gameLevels[0].exercise, [2]);
  const round = new OrbitRound(60, windows, track);
  round.tap(0);
  assert.equal(round.tap(900), true);
  assert.equal(inputPose(950, 1000, track, round.snapshot.hits).anchor, 1);
  assert.equal(inputPose(1000, 1000, track, round.snapshot.hits).anchor, 2);
  assert.equal(inputPose(1000, 1000, track, round.snapshot.hits).direction, -1);
  const missed = new OrbitRound(60, windows, track);
  missed.tap(0);missed.advance(1100);
  const p = inputPose(1100, 1000, track, missed.snapshot.hits);
  assert.equal(p.anchor, 1);
  assert.equal(p.direction, 1);
  assert.equal(missed.tap(1100), true);
  assert.equal(inputPose(1100, 1000, track, missed.snapshot.hits).direction, -1);
});

test('最后一个目标也允许越过，实际命中后才固定在终点', () => {
  const round = new OrbitRound(60, windows, quarter);
  for (let i = 0; i < 15; i++) round.tap(i * 1000);
  const waiting = inputPose(15080, 1000, quarter, round.snapshot.hits);
  assert.equal(waiting.anchor, 15);
  assert.ok(Math.abs(waiting.angle - quarter.angles[15]) > Math.PI);
  assert.equal(round.tap(15080), true);
  const completed = inputPose(round.stoppedAtMs, 1000, quarter, round.snapshot.hits);
  assert.equal(completed.anchor, 16);
  assert.deepEqual(completed, inputPose(20000, 1000, quarter, round.snapshot.hits));
});

test('所有关卡的密集音符与转向都等待实际命中，晚按不改变球距', () => {
  for (const level of gameLevels) {
    const track = createLevelTrack(level);
    const round = new OrbitRound(240, windows, track);
    track.targets.forEach((beat, index) => {
      const next = track.targets[index + 1];
      const delay = Math.min(80, next === undefined ? 80 : (next - beat) * round.beatMs / 4);
      const time = beat * round.beatMs + delay;
      const waiting = inputPose(time, round.beatMs, track, round.snapshot.hits);
      assert.equal(waiting.anchor, index, level.id);
      assert.equal(waiting.direction, track.directions[index], level.id);
      assert.equal(waiting.primaryAnchored, index % 2 === 0);
      assert.ok(Math.abs(Math.hypot(Math.cos(waiting.angle), Math.sin(waiting.angle)) - 1) < 1e-10);
      assert.equal(round.tap(time), true, `${level.id} target ${index}`);
      assert.equal(inputPose(time, round.beatMs, track, round.snapshot.hits).anchor, index + 1);
    });
    assert.equal(round.snapshot.phase, 'completed', level.id);
  }
});

test('四拍预备不判输入，首拍在零时刻，16 次命中才通关', () => {
  const round = new OrbitRound(60, windows, quarter);
  for (let i = 0; i < 4; i++) {
    round.advance(-4000 + i * 1000);
    assert.equal(round.snapshot.countIn, i + 1);
    assert.equal(round.tap(-4000 + i * 1000), false);
    assert.equal(round.snapshot.hits, 0);
  }
  for (let i = 0; i < 16; i++) {
    assert.equal(round.tap(i * 1000), true);
    assert.equal(round.snapshot.hits, i + 1);
    assert.equal(round.snapshot.phase, i === 15 ? 'completed' : 'playing');
  }
  round.advance(20000); round.tap(20000);
  assert.equal(round.snapshot.phase, 'completed');
  assert.equal(round.snapshot.hits, 16);
});

test('早晚窗口边界与第四次提前误敲、漏拍终止，终态冻结且重试独立', () => {
  const left = new OrbitRound(60, windows, quarter);
  left.tap(0);
  assert.equal(left.tap(850), true);
  assert.equal(left.snapshot.feedback, '偏早');
  const right = new OrbitRound(60, windows, quarter);
  right.tap(0);
  assert.equal(right.tap(1150), false);
  assert.equal(right.snapshot.failure, 'late');
  const extra = new OrbitRound(60, windows, quarter);
  extra.tap(0); [10,20,30,40].forEach(time=>extra.tap(time));
  assert.equal(extra.snapshot.phase, 'failed');
  assert.equal(extra.snapshot.failure, 'extra');
  assert.equal(extra.stoppedAtMs, 40);
  extra.advance(2000); extra.tap(1000);
  assert.equal(extra.snapshot.hits, 1);
  assert.equal(extra.stoppedAtMs, 40);
  const missed = new OrbitRound(60, windows, quarter);
  missed.advance(150);
  assert.equal(missed.snapshot.phase, 'failed');
  assert.equal(missed.stoppedAtMs, 150);
  assert.equal(new OrbitRound(60, windows, quarter).tap(0), true);
});

test('窗口内偏差不累积；BPM 决定目标间隔，非有限输入忽略', () => {
  const round = new OrbitRound(120, windows, quarter);
  assert.equal(round.beatMs, 500);
  round.tap(NaN); round.tap(Infinity);
  assert.equal(round.snapshot.hits, 0);
  for (let i = 0; i < 16; i++) assert.equal(round.tap(i * 500 + 100), true);
  assert.equal(round.snapshot.phase, 'completed');
  for (const bpm of [0, 39, 241, Infinity]) assert.throws(() => new OrbitRound(bpm, windows, quarter));
});

test('首拍有完整半圈预告，交换支点位置连续，结束不越过轨道', () => {
  const start = orbitPose(-1000, 1000);
  assert.equal(start.anchor, 0);
  assert.ok(Math.abs(Math.cos(start.angle) + 1) < 1e-10);
  assert.ok(Math.sin(orbitPose(-500, 1000).angle) < 0);
  const before = orbitPose(-0.001, 1000);
  const after = orbitPose(0, 1000);
  assert.ok(Math.abs(before.anchor + Math.cos(before.angle) - after.anchor) < 0.001);
  assert.ok(Math.abs(before.anchor - after.anchor - Math.cos(after.angle)) < 1e-10);
  assert.notEqual(before.primaryAnchored, after.primaryAnchored);
  assert.ok(Math.sin(orbitPose(500, 1000).angle) < 0);
  assert.deepEqual(orbitPose(15000, 1000), orbitPose(20000, 1000));
});


test('两个球交换圆心后仍顺时针，半圈半径固定且球的位置连续', () => {
  function balls(pose) {
    const anchor = { x: pose.anchor, y: 0 };
    const moving = { x: pose.anchor + Math.cos(pose.angle), y: Math.sin(pose.angle) };
    return pose.primaryAnchored ? [anchor, moving] : [moving, anchor];
  }
  for (let step = 0; step < 16; step++) {
    let lastAngle = 0;
    for (let sample = 0; sample < 10; sample++) {
      const pose = orbitPose((step - 1 + sample / 10) * 1000, 1000);
      assert.equal(pose.anchor, step);
      assert.equal(pose.primaryAnchored, step % 2 === 0);
      assert.ok(pose.angle > lastAngle, '屏幕极角递增代表顺时针');
      lastAngle = pose.angle;
      const [primary, warm] = balls(pose);
      assert.ok(Math.abs(Math.hypot(primary.x - warm.x, primary.y - warm.y) - 1) < 1e-10);
    }
    const before = balls(orbitPose(step * 1000 - .0001, 1000));
    const after = balls(orbitPose(step * 1000, 1000));
    before.forEach((ball, i) => assert.ok(Math.hypot(ball.x - after[i].x, ball.y - after[i].y) < 1e-6));
  }
});

test('二平均每半拍一个目标，32 次命中通关，漏击结束且多击不占目标', () => {
  for (const bpm of [60, 120, 240]) {
    const round = new OrbitRound(bpm, windows, eighth);
    assert.equal(eighth.targets.length, 32);
    for (let i = 0; i < 32; i++) assert.equal(round.tap(i * round.beatMs / 2), true);
    assert.equal(round.snapshot.phase, 'completed');
  }
  const missed = new OrbitRound(60, windows, eighth);
  missed.tap(0); missed.advance(650);
  assert.equal(missed.snapshot.failure, 'late');
  const extra = new OrbitRound(60, windows, eighth);
  extra.tap(0); extra.tap(100);
  assert.equal(extra.snapshot.phase, 'playing');
  assert.equal(extra.snapshot.earlyTaps, 1);
});
test('二平均转向事件驱动四分之一圈，交换球位置连续，阶梯不重叠', () => {
  const balls = p => {
    const anchor = eighth.points[p.anchor];
    const moving = {x: anchor.x + Math.cos(p.angle), y: anchor.y + Math.sin(p.angle)};
    return p.primaryAnchored ? [anchor, moving] : [moving, anchor];
  };
  for (let i = 1; i < 32; i++) {
    const start = pose((i - 1) * 500, 1000, eighth);
    const before = pose(i * 500 - .0001, 1000, eighth);
    const after = pose(i * 500, 1000, eighth);
    assert.ok(Math.abs(before.angle - start.angle - eighth.directions[i] * Math.PI / 2) < 1e-6);
    const a = balls(before), b = balls(after);
    a.forEach((ball, j) => assert.ok(Math.hypot(ball.x - b[j].x, ball.y - b[j].y) < 1e-6));
    assert.ok(eighth.points[i].x >= eighth.points[i - 1].x - 1e-10);
    assert.ok(eighth.points[i].y <= eighth.points[i - 1].y + 1e-10);
  }
});

test('混合时值复用音乐时间线，未支持的长间隔明确拒绝', () => {
  const track = createOrbitTrack({timeSignature:{beats:4,beatType:4},measures:[{elements:[
    {kind:'note',noteValue:'quarter'}, {kind:'note',noteValue:'quarter'},
    ...Array.from({length:4},()=>({kind:'note',noteValue:'eighth'})),
  ]}]});
  assert.deepEqual(track.targets, [0,1,2,2.5,3,3.5]);
  const round = new OrbitRound(60, windows, track);
  track.targets.forEach(beat=>assert.equal(round.tap(beat*1000),true));
  assert.equal(round.snapshot.phase,'completed');
  assert.throws(()=>createOrbitTrack({timeSignature:{beats:4,beatType:4},measures:[{elements:[
    {kind:'note',noteValue:'half'},{kind:'note',noteValue:'half'},
  ]}]}), /小于一整圈/);
});

test('第三关四小节疏密切换，24 个目标共用判定与显式转向运动', () => {
  const track = createOrbitTrack(gameLevels[2].exercise, gameLevels[2].twirlTiles);
  const expected = [0,1,2,3,4,4.5,5,5.5,6,6.5,7,7.5,8,9,9.5,10,11,11.5,12,12.5,13,14,14.5,15];
  assert.deepEqual(track.targets, expected);
  assert.equal(track.durationBeats, 16);
  const balls = p => {
    const anchor = track.points[p.anchor];
    const moving = {x:anchor.x+Math.cos(p.angle), y:anchor.y+Math.sin(p.angle)};
    return p.primaryAnchored ? [anchor,moving] : [moving,anchor];
  };
  for (const bpm of [60,90,240]) {
    const round = new OrbitRound(bpm, windows, track);
    expected.forEach(beat=>assert.equal(round.tap(beat*round.beatMs),true));
    assert.equal(round.snapshot.phase,'completed');
    assert.equal(round.snapshot.hits,24);
  }
  expected.forEach((beat,i)=>{
    const before = pose(beat*1000-.0001,1000,track), after = pose(beat*1000,1000,track);
    const a = balls(before), b = balls(after);
    a.forEach((ball,j)=>assert.ok(Math.hypot(ball.x-b[j].x,ball.y-b[j].y)<1e-6));
    const startBeat = i === 0 ? -1 : expected[i-1];
    const start = pose(startBeat*1000,1000,track);
    assert.ok(Math.abs(before.angle-start.angle-track.directions[i]*Math.PI*(beat-startBeat))<1e-6);
  });
  const missed = new OrbitRound(60,windows,track);
  expected.filter(beat=>beat<=4).forEach(beat=>missed.tap(beat*1000));
  missed.advance(4650);
  assert.equal(missed.snapshot.failure,'late');
});

test('普通地块不反转，转向在到达时只改变后续方向，重试恢复默认顺时针', () => {
  const track = createOrbitTrack(gameLevels[0].exercise, [2,5]);
  assert.equal(pose(-500,1000,track).direction,1);
  assert.equal(pose(999.999,1000,track).direction,1);
  assert.equal(pose(1000,1000,track).direction,-1);
  assert.equal(pose(3000,1000,track).direction,-1);
  assert.equal(pose(4000,1000,track).direction,1);
  assert.equal(pose(5000,1000,track).direction,1);
  assert.equal(pose(-500,1000,track).direction,1);
  const plain = createOrbitTrack(gameLevels[1].exercise);
  assert.ok(plain.directions.every(direction=>direction===1), '不会为了短弧自动反转');
  for (const events of [[0],[16],[1,1],[1.5]]) assert.throws(()=>createOrbitTrack(gameLevels[0].exercise,events), /转向地块/);
});
test('正式关卡道路不重复、不交叉，每段方向只由显式事件决定', () => {
  for (const level of gameLevels) {
    const track = createLevelTrack(level);
    const keys = track.points.map(point=>`${Math.round(point.x*1e6)},${Math.round(point.y*1e6)}`);
    assert.equal(new Set(keys).size,keys.length,level.title);
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const intersects=(a,b,c,d)=>{
      if(Math.max(a.x,b.x)<Math.min(c.x,d.x)-1e-8 || Math.max(c.x,d.x)<Math.min(a.x,b.x)-1e-8
        || Math.max(a.y,b.y)<Math.min(c.y,d.y)-1e-8 || Math.max(c.y,d.y)<Math.min(a.y,b.y)-1e-8) return false;
      const values=[cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)].map(v=>Math.abs(v)<1e-8?0:v);
      return values[0]*values[1]<=0 && values[2]*values[3]<=0;
    };
    for(let i=0;i<track.points.length-1;i++) for(let j=i+2;j<track.points.length-1;j++) {
      assert.equal(intersects(track.points[i],track.points[i+1],track.points[j],track.points[j+1]),false,level.title);
    }
    for(let i=0;i<track.points.length;i++) for(let j=i+2;j<track.points.length;j++) {
      assert.ok(Math.hypot(track.points[i].x-track.points[j].x,track.points[i].y-track.points[j].y)>.6,'非相邻地块留有可读间距');
    }
    let direction=1;
    for (let i=0;i<track.targets.length;i++) {
      if(level.twirlTiles.includes(i)) direction*=-1;
      assert.equal(track.directions[i],direction);
      const a=track.points[i],b=track.points[i+1];
      assert.ok(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-1)<1e-8);
    }
  }
});

test('四平均两小节共32次敲击，45度运动保持固定半径和落点连续',()=>{
  const level=gameLevels.find(level=>level.id==='sixteenth');
  const track=createLevelTrack(level);
  assert.equal(track.durationBeats,8);
  assert.deepEqual(track.targets,Array.from({length:32},(_,i)=>i/4));
  for(const bpm of [40,60,120,240]) {
    const round=new OrbitRound(bpm,windows,track);
    track.targets.forEach(beat=>assert.equal(round.tap(beat*round.beatMs),true));
    assert.equal(round.snapshot.phase,'completed');
    assert.equal(round.snapshot.hits,32);
  }
  const balls=p=>{
    const a=track.points[p.anchor],b={x:a.x+Math.cos(p.angle),y:a.y+Math.sin(p.angle)};
    return p.primaryAnchored?[a,b]:[b,a];
  };
  for(let i=1;i<32;i++){
    const start=pose((i-1)*250,1000,track),before=pose(i*250-.0001,1000,track),after=pose(i*250,1000,track);
    assert.ok(Math.abs(before.angle-start.angle-track.directions[i]*Math.PI/4)<1e-6);
    const a=balls(before),b=balls(after);
    a.forEach((ball,j)=>assert.ok(Math.hypot(ball.x-b[j].x,ball.y-b[j].y)<1e-6));
    const [first,second]=balls(pose((i-.5)*250,1000,track));
    assert.ok(Math.abs(Math.hypot(first.x-second.x,first.y-second.y)-1)<1e-8);
  }
});
test('密集窗口在相邻中点分开，提前误敲不占目标，漏拍结束，精度设置仍是最大容差',()=>{
  const level=gameLevels.find(level=>level.id==='sixteenth');
  const track=createLevelTrack(level);
  for(const bpm of [60,120,240]) {
    const interval=60000/bpm/4;
    const extra=new OrbitRound(bpm,windows,track);
    extra.tap(0);
    assert.equal(extra.tap(interval/2-.001),false);
    assert.equal(extra.snapshot.phase,'playing');
    assert.equal(extra.snapshot.earlyTaps,1);
    const boundary=new OrbitRound(bpm,windows,track);
    boundary.tap(0);
    assert.equal(boundary.tap(interval/2),true,'下一窗口包含左端中点');
    const missed=new OrbitRound(bpm,windows,track);
    missed.advance(interval/2);
    assert.equal(missed.snapshot.failure,'late','上一窗口不包含右端中点');
  }
  const strict=new OrbitRound(60,{hitMs:100,perfectMs:30},track);
  strict.tap(0);
  assert.equal(strict.tap(140),false,'更严格设置不被中点规则放宽');
});

test('二平均与四平均按拍切换，两小节24次目标，90度和45度衔接连续',()=>{
  const level=gameLevels.find(level=>level.id==='eighth-sixteenth');
  const track=createLevelTrack(level);
  const beats=[0,.5,1,1.25,1.5,1.75,2,2.5,3,3.25,3.5,3.75,4,4.25,4.5,4.75,5,5.5,6,6.25,6.5,6.75,7,7.5];
  assert.deepEqual(track.targets,beats);
  assert.equal(track.durationBeats,8);
  for(const bpm of [40,60,120,240]){
    const round=new OrbitRound(bpm,windows,track);
    beats.forEach(beat=>assert.equal(round.tap(beat*round.beatMs),true));
    assert.equal(round.snapshot.phase,'completed');
    assert.equal(round.snapshot.hits,24);
  }
  const balls=p=>{
    const a=track.points[p.anchor],b={x:a.x+Math.cos(p.angle),y:a.y+Math.sin(p.angle)};
    return p.primaryAnchored?[a,b]:[b,a];
  };
  for(let i=1;i<beats.length;i++){
    const start=pose(beats[i-1]*1000,1000,track),before=pose(beats[i]*1000-.0001,1000,track),after=pose(beats[i]*1000,1000,track);
    const gap=beats[i]-beats[i-1];
    assert.ok(Math.abs(before.angle-start.angle-track.directions[i]*Math.PI*gap)<1e-6);
    const a=balls(before),b=balls(after);
    a.forEach((ball,j)=>assert.ok(Math.hypot(ball.x-b[j].x,ball.y-b[j].y)<1e-6));
    const [first,second]=balls(pose((beats[i]+beats[i-1])*500,1000,track));
    assert.ok(Math.abs(Math.hypot(first.x-second.x,first.y-second.y)-1)<1e-8);
  }
});
test('二平均切四平均时窗口正确衔接，提前误敲不命中，漏拍立即结束',()=>{
  const level=gameLevels.find(level=>level.id==='eighth-sixteenth');
  const track=createLevelTrack(level);
  const extra=new OrbitRound(60,windows,track);
  [0,500,1000].forEach(time=>extra.tap(time));
  assert.equal(extra.tap(1100),false);
  assert.equal(extra.snapshot.phase,'playing');
  assert.equal(extra.snapshot.earlyTaps,1);
  const missed=new OrbitRound(60,windows,track);
  [0,500,1000].forEach(time=>missed.tap(time));
  missed.advance(1375);
  assert.equal(missed.snapshot.failure,'late');
  const boundary=new OrbitRound(60,windows,track);
  [0,500,1000].forEach(time=>boundary.tap(time));
  assert.equal(boundary.tap(1125),true);
});

for(const [id,offsets] of [
  ['eighth-sixteenths',[0,.5,.75]],['sixteenths-eighth',[0,.25,.5]],
  ['dotted-eighth',[0,.75]],['reverse-dotted-eighth',[0,.25]],['small-syncopation',[0,.25,.75]],
]) {
  test(`${id} 一拍内的节奏、运动角度和判定一致`,()=>{
    const level=gameLevels.find(level=>level.id===id),track=createLevelTrack(level);
    const beats=Array.from({length:8},(_,beat)=>offsets.map(offset=>beat+offset)).flat();
    assert.deepEqual(track.targets,beats);
    assert.equal(track.durationBeats,8);
    const balls=p=>{const a=track.points[p.anchor],b={x:a.x+Math.cos(p.angle),y:a.y+Math.sin(p.angle)};return p.primaryAnchored?[a,b]:[b,a];};
    for(const bpm of [40,60,120,240]){
      const round=new OrbitRound(bpm,windows,track);
      beats.forEach(beat=>assert.equal(round.tap(beat*round.beatMs),true));
      assert.equal(round.snapshot.phase,'completed');
      assert.equal(round.snapshot.hits,beats.length);
    }
    for(let i=0;i<beats.length;i++){
      const previous=i===0?-1:beats[i-1];
      const start=pose(previous*1000,1000,track),before=pose(beats[i]*1000-.0001,1000,track),after=pose(beats[i]*1000,1000,track);
      assert.ok(Math.abs(before.angle-start.angle-track.directions[i]*Math.PI*(beats[i]-previous))<1e-6);
      const a=balls(before),b=balls(after);
      a.forEach((ball,j)=>assert.ok(Math.hypot(ball.x-b[j].x,ball.y-b[j].y)<1e-6));
      const [first,second]=balls(pose((previous+beats[i])*500,1000,track));
      assert.ok(Math.abs(Math.hypot(first.x-second.x,first.y-second.y)-1)<1e-8);
    }
    const extra=new OrbitRound(60,windows,track);extra.tap(0);extra.tap(1);
    assert.equal(extra.snapshot.phase,'playing');
    assert.equal(extra.snapshot.earlyTaps,1);
    const missed=new OrbitRound(60,windows,track);missed.advance(150);
    assert.equal(missed.snapshot.failure,'late');
  });
}
test('附点的三比一与反向一比三间隔不同，较长等待仍保留最大容差',()=>{
  for(const id of ['dotted-eighth','reverse-dotted-eighth']){
    const level=gameLevels.find(level=>level.id===id),track=createLevelTrack(level);
    const round=new OrbitRound(60,windows,track);
    track.targets.forEach((beat,index)=>assert.equal(round.tap(beat*1000+(index%2===0?10:50)),true));
    assert.equal(round.snapshot.phase,'completed');
  }
  const level=gameLevels.find(level=>level.id==='dotted-eighth'),track=createLevelTrack(level);
  const early=new OrbitRound(60,windows,track);early.tap(0);
  assert.equal(early.tap(500),false,'不能把长间隔提前到二平均的位置');
  assert.equal(early.snapshot.phase,'playing');
  assert.equal(early.snapshot.earlyTaps,1);
});

test('三连音使用连音组模型，两小节24次目标，一拍准确三等分',()=>{
  const level=gameLevels.find(level=>level.id==='triplet'),track=createLevelTrack(level);
  assert.equal(level.exercise.measures.length,2);
  assert.ok(level.exercise.measures.every(measure=>measure.elements.length===4&&measure.elements.every(element=>element.kind==='triplet')));
  assert.equal(track.durationBeats,8);
  assert.equal(track.targets.length,24);
  track.targets.forEach((beat,i)=>assert.ok(Math.abs(beat-i/3)<1e-12));
  for(const bpm of [40,60,120,240]){
    const round=new OrbitRound(bpm,windows,track);
    for(let i=0;i<24;i++)assert.equal(round.tap(i*60000/bpm/3),true);
    assert.equal(round.snapshot.hits,24);
    assert.equal(round.snapshot.phase,'completed');
  }
});
test('三连音60度运动与转向连续，提前误敲不占目标，漏拍结束本局',()=>{
  const level=gameLevels.find(level=>level.id==='triplet'),track=createLevelTrack(level);
  const balls=p=>{const a=track.points[p.anchor],b={x:a.x+Math.cos(p.angle),y:a.y+Math.sin(p.angle)};return p.primaryAnchored?[a,b]:[b,a];};
  for(let i=1;i<24;i++){
    const previous=track.targets[i-1]*1000,end=track.targets[i]*1000;
    const start=pose(previous+.0001,1000,track),before=pose(end-.0001,1000,track),after=pose(end+.0001,1000,track);
    assert.ok(Math.abs(before.angle-start.angle-track.directions[i]*Math.PI/3)<1e-6);
    const a=balls(before),b=balls(after);
    a.forEach((ball,j)=>assert.ok(Math.hypot(ball.x-b[j].x,ball.y-b[j].y)<1e-6));
    const [first,second]=balls(pose((previous+end)/2,1000,track));
    assert.ok(Math.abs(Math.hypot(first.x-second.x,first.y-second.y)-1)<1e-8);
  }
  const extra=new OrbitRound(60,windows,track);extra.tap(0);extra.tap(100);
  assert.equal(extra.snapshot.phase,'playing');
  assert.equal(extra.snapshot.earlyTaps,1);
  const missed=new OrbitRound(120,windows,track);missed.tap(0);missed.advance(250);
  assert.equal(missed.snapshot.failure,'late');
});


test('二平均与三连音按拍切换，两小节20次敲击且二三等分时值准确',()=>{
  const level=gameLevels.find(level=>level.id==='eighth-triplet'),track=createLevelTrack(level);
  const divisions=[2,3,2,3,3,2,3,2];
  const expected=divisions.flatMap((count,beat)=>Array.from({length:count},(_,i)=>beat+i/count));
  assert.equal(track.durationBeats,8);
  assert.equal(track.targets.length,20);
  track.targets.forEach((target,i)=>assert.ok(Math.abs(target-expected[i])<1e-12));
  for(const bpm of [40,60,120,240]){
    const round=new OrbitRound(bpm,windows,track);
    expected.forEach(target=>assert.equal(round.tap(target*60000/bpm),true));
    assert.equal(round.snapshot.hits,20);
    assert.equal(round.snapshot.phase,'completed');
  }
});
test('二三等分切换保持90度和60度转速、半径与双球位置连续，错拍立即结束',()=>{
  const level=gameLevels.find(level=>level.id==='eighth-triplet'),track=createLevelTrack(level);
  const balls=p=>{const a=track.points[p.anchor],b={x:a.x+Math.cos(p.angle),y:a.y+Math.sin(p.angle)};return p.primaryAnchored?[a,b]:[b,a];};
  for(let i=1;i<track.targets.length;i++){
    const start=track.targets[i-1]*1000,end=track.targets[i]*1000;
    const before=pose(end-.0001,1000,track),after=pose(end+.0001,1000,track);
    const angle=before.angle-pose(start+.0001,1000,track).angle;
    assert.ok(Math.abs(angle-track.directions[i]*Math.PI*(end-start)/1000)<1e-6);
    balls(before).forEach((ball,j)=>assert.ok(Math.hypot(ball.x-balls(after)[j].x,ball.y-balls(after)[j].y)<1e-6));
    const [a,b]=balls(pose((start+end)/2,1000,track));
    assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-1)<1e-8);
  }
  // 两等分转三等分及三等分转两等分的交界，漏拍和额外敲击均不得跳过。
  for(const boundary of [2,5]){
    const missed=new OrbitRound(120,windows,track),extra=new OrbitRound(120,windows,track);
    for(let i=0;i<boundary;i++){
      missed.tap(track.targets[i]*500);
      extra.tap(track.targets[i]*500);
    }
    missed.advance(track.targets[boundary]*500+151);
    assert.equal(missed.snapshot.failure,'late');
    extra.tap(track.targets[boundary-1]*500+1);
    assert.equal(extra.snapshot.phase,'playing');
    assert.equal(extra.snapshot.earlyTaps,1);
  }
});


test('综合挑战八小节按段编排77次目标，各小节满四拍，最后基本拍收尾',()=>{
  const level=gameLevels.find(level=>level.id==='comprehensive'),track=createLevelTrack(level);
  const q=[0],e=[0,.5],s=[0,.25,.5,.75],front=[0,.5,.75],back=[0,.25,.5];
  const dot=[0,.75],reverse=[0,.25],sync=[0,.25,.75],triplet=[0,1/3,2/3];
  const beats=[q,q,e,e, e,e,s,s, front,front,back,back, front,back,front,back,
    dot,dot,reverse,reverse, sync,sync,dot,reverse, e,triplet,e,triplet, triplet,e,q,q];
  const expected=beats.flatMap((offsets,beat)=>offsets.map(offset=>beat+offset));
  assert.equal(level.exercise.measures.length,8);
  assert.equal(track.durationBeats,32);
  assert.equal(track.targets.length,77);
  track.targets.forEach((target,i)=>assert.ok(Math.abs(target-expected[i])<1e-12));
  for(let bar=0;bar<8;bar++)assert.equal(track.targets.filter(beat=>beat>=bar*4&&beat<(bar+1)*4).length,[6,12,12,12,8,10,10,7][bar]);
  assert.deepEqual(track.targets.slice(-2),[30,31]);
  for(const bpm of [40,60,120,240]){
    const round=new OrbitRound(bpm,windows,track);
    expected.forEach(target=>assert.equal(round.tap(target*60000/bpm),true));
    assert.equal(round.snapshot.hits,77);
    assert.equal(round.snapshot.phase,'completed');
  }
});
test('综合挑战各段切换不跳位、不变速，任意小节漏拍立即失败',()=>{
  const level=gameLevels.find(level=>level.id==='comprehensive'),track=createLevelTrack(level);
  const balls=p=>{const a=track.points[p.anchor],b={x:a.x+Math.cos(p.angle),y:a.y+Math.sin(p.angle)};return p.primaryAnchored?[a,b]:[b,a];};
  for(let i=1;i<track.targets.length;i++){
    const start=track.targets[i-1]*1000,end=track.targets[i]*1000;
    const before=pose(end-.0001,1000,track),after=pose(end+.0001,1000,track);
    assert.ok(Math.abs(before.angle-pose(start+.0001,1000,track).angle-track.directions[i]*Math.PI*(end-start)/1000)<1e-6);
    balls(before).forEach((ball,j)=>assert.ok(Math.hypot(ball.x-balls(after)[j].x,ball.y-balls(after)[j].y)<1e-6));
  }
  for(let bar=0;bar<8;bar++){
    const round=new OrbitRound(120,windows,track),boundary=track.targets.findIndex(beat=>beat>=bar*4);
    for(let i=0;i<boundary;i++)round.tap(track.targets[i]*500);
    round.advance(track.targets[boundary]*500+151);
    assert.equal(round.snapshot.phase,'failed');
    assert.equal(round.snapshot.hits,boundary);
  }
});
