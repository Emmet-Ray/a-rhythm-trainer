import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {OrbitPreview}=await server.ssrLoadModule('/src/game/core/OrbitPreview.ts');
const {createOrbitTrack,selectOrbitRange}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const { gameLevels }=await server.ssrLoadModule('/src/game/catalog.ts');
const { createLevelTrack }=await server.ssrLoadModule('/src/game/core/GameLevel.ts');
await server.close();

for(const level of gameLevels)test(`${level.title} 试听按原时间线完美走图，播满完整或局部范围才结束`,()=>{
  const full=createLevelTrack(level);
  for(const track of [full,selectOrbitRange(full,{startMeasure:1,endMeasure:2})])for(const bpm of [40,100,240]){
    const preview=new OrbitPreview(bpm,track);
    for(let count=1;count<=4;count++){
      preview.advance((count-5)*preview.beatMs);
      assert.equal(preview.snapshot.countIn,count);
      assert.equal(preview.snapshot.hits,0);
    }
    track.targets.forEach((beat,index)=>{
      preview.advance(beat*preview.beatMs);
      assert.equal(preview.snapshot.hits,index+1);
      assert.equal(preview.snapshot.phase,'playing');
      assert.equal(preview.snapshot.feedback,'');
      assert.equal(preview.snapshot.earlyTaps,0);
      const snapshot=preview.snapshot;
      preview.advance(beat*preview.beatMs+.001);
      assert.equal(preview.snapshot,snapshot,'同一落点内不重复发布进度');
    });
    assert.equal(preview.stoppedAtMs,null,'末次落地不提前截断最后一个音符');
    preview.advance(track.durationBeats*preview.beatMs);
    assert.equal(preview.snapshot.phase,'completed');
    assert.equal(preview.stoppedAtMs,track.durationBeats*preview.beatMs);
    const completed=preview.snapshot;
    preview.advance(1e9);assert.equal(preview.snapshot,completed);
  }
});

test('试听掉帧直接定位当前进度，不产生漏拍或等待逐个模拟敲击',()=>{
  const level=gameLevels.find(level=>level.id==='glimmer');
  const track=createLevelTrack(level);
  const preview=new OrbitPreview(100,track);
  preview.advance(40.5*600);
  assert.equal(preview.snapshot.hits,track.targets.filter(beat=>beat<=40.5).length);
  assert.equal(preview.snapshot.phase,'playing');
  preview.advance(1e6);
  assert.equal(preview.snapshot.hits,108);
  assert.equal(preview.snapshot.phase,'completed');
  assert.equal(preview.snapshot.failure,undefined);
  for(const bpm of [39,241,NaN,Infinity])assert.throws(()=>new OrbitPreview(bpm,track),/40–240/);
});
