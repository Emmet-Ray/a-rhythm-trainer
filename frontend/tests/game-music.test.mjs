import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const { sampleBank } = await server.ssrLoadModule("/src/game/catalog.ts");
const {createOrbitTrack,selectOrbitRange}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const {prepareGameMusic: prepareGameMusicWithBank}=await server.ssrLoadModule('/src/game/audio/GameMusic.ts');
const prepareGameMusic = (...args) => prepareGameMusicWithBank(...args, sampleBank);
const {loadGameSamples: loadGameSamplesWithBank,playMusicVoice}=await server.ssrLoadModule('/src/game/audio/GameInstruments.ts');
const loadGameSamples = (context) => loadGameSamplesWithBank(context, sampleBank);
await server.close();
const score={title:'测试乐句',recommendedBpm:60,measureBeats:[4,2,4],chords:[[],[48,60,64],[50,62,65]],sections:[],
  melody:[{beat:0,duration:4,midi:60,gain:.4},{beat:4,duration:2,midi:62,gain:.4},
    {beat:6,duration:1,midi:64,gain:.4,additionalMidis:[67]},{beat:7,duration:3,midi:65,gain:.4}]};
const full=createOrbitTrack(score,[],[{beat:0,halfTurnBeats:4}]);
const originalFetch=globalThis.fetch,originalOffline=globalThis.OfflineAudioContext;
after(()=>{globalThis.fetch=originalFetch;globalThis.OfflineAudioContext=originalOffline;});
function param(){return{value:1,events:[],setValueAtTime(...a){this.events.push(['set',...a]);},linearRampToValueAtTime(...a){this.events.push(['linear',...a]);},exponentialRampToValueAtTime(...a){this.events.push(['exponential',...a]);},cancelAndHoldAtTime(...a){this.events.push(['hold',...a]);}};}
function node(){return{connect(output){this.output=output;return output;},disconnect(){this.disconnected=true;}};}
class Context{
  sampleRate=44100;boundaries=[];currentTime=10;destination={};sources=[];gains=[];decodes=0;
  async decodeAudioData(){this.decodes++;return{duration:8,decode:this.decodes};}
  createGain(){const gain={...node(),gain:param()};this.gains.push(gain);return gain;}
  createBufferSource(){const source={...node(),playbackRate:param(),stops:[],start(...args){this.started=args;},stop(...args){this.stops.push(args);},listeners:[],addEventListener(name,listener){if(name==='ended')this.listeners.push(listener);},end(){this.onended?.();for(const listener of this.listeners.splice(0))listener();}};this.sources.push(source);return source;}
  createConstantSource(){const source={...node(),offset:param(),start(at){this.at=at;},stops:[],stop(at){this.stops.push(at);},end(){this.onended?.();}};this.boundaries.push(source);return source;}
  createOscillator(){return Object.assign(this.createBufferSource(),{frequency:param()});}
  createDynamicsCompressor(){return{...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
}
globalThis.OfflineAudioContext=class{constructor(){throw Error('不应离线渲染整曲');}};
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
const clock={audioTimeAt:ms=>20+ms/1000};
const leads=c=>c.sources.filter(s=>s.output.output===c.gains[0]);
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
test('准备不发声；伴奏按原拍位排程，命中时即时弹奏；停止取消未来声音',async()=>{
  const c=new Context(),music=await prepareGameMusic(c,score,full,60);
  assert.equal(c.sources.length,0);music.start(clock);
  assert.ok(c.sources.length>0);assert.ok(c.sources.every(s=>s.started[0]>=24),'N.C. 没有伴奏');
  assert.equal(leads(c).length,0);music.tap(0);assert.equal(leads(c)[0].started[0],10);
  near(leads(c)[0].started[2],4.28);
  music.stop();for(const source of c.sources)near(source.stops.at(-1)[0],10.04);
  near(c.boundaries[0].stops.at(-1),10.04);
  const count=c.sources.length;music.tap(1);assert.equal(c.sources.length,count);
});
test('局部变拍号范围从正确旋律进入，试听双音同时响且结束包含曲尾',async()=>{
  const c=new Context(),part=selectOrbitRange(full,{startMeasure:2,endMeasure:3});
  const music=await prepareGameMusic(c,score,part,120);music.start(clock,'automatic');
  assert.deepEqual(leads(c).map(s=>s.started[0]),[20,20,20.5]);
  near(c.boundaries[0].stops[0],22.35);
  assert.ok(c.sources.every(s=>s.started[0]>=20),'不能在预备拍播放上一段尾音');
  music.stop();for(const source of c.sources)near(source.stops.at(-1)[0],10.04);
});
test('完成等待边界与偏晚末音自然结束，停止作废完成回调',async()=>{
  const c=new Context(),music=await prepareGameMusic(c,score,full,60);music.start(clock);
  c.currentTime=29.9;music.tap(3);let done=0;music.finish(()=>done++);
  c.boundaries[0].end();assert.equal(done,0);assert.equal(c.gains[0].disconnected,undefined);
  leads(c)[0].end();assert.equal(done,1);assert.equal(c.gains[0].disconnected,true);
  leads(c)[0].end();assert.equal(done,1);
  const next=await prepareGameMusic(c,score,full,60);next.start(clock);next.finish(()=>done++);next.stop();
  c.boundaries.at(-1).end();assert.equal(done,1);
});
test('纯 N.C. 片段按音频边界完成，无需有声伴奏；局部不附加曲尾',async()=>{
  const c=new Context(),part=selectOrbitRange(full,{startMeasure:0,endMeasure:1});
  const music=await prepareGameMusic(c,score,part,60);music.start(clock);
  assert.equal(c.sources.length,0);assert.equal(c.boundaries[0].stops[0],24);
  c.boundaries[0].end();assert.equal(c.gains[0].disconnected,undefined);
  music.tap(0);let done=0;music.finish(()=>done++);assert.equal(done,0);
  leads(c)[0].end();assert.equal(done,1);
});
test('重试、改 BPM 和新上下文改范围共享解码，BPM 只改变节点排程',async()=>{
  const a=new Context();a.sampleRate=48000;
  await Promise.all([prepareGameMusic(a,score,full,60),prepareGameMusic(a,score,full,120)]);
  assert.equal(a.decodes,40);
  const b=new Context();b.sampleRate=48000;
  const music=await prepareGameMusic(b,score,selectOrbitRange(full,{startMeasure:1,endMeasure:2}),120);
  assert.equal(b.decodes,0);music.start(clock,'automatic');near(leads(b)[0].started[2]/leads(b)[0].playbackRate.value,1.28);
  near(b.boundaries[0].stops[0],21);
});
test('失败的音源可重新加载',async()=>{
  const c=new Context();c.sampleRate=32000;globalThis.fetch=async()=>({ok:false});
  await assert.rejects(prepareGameMusic(c,score,full,60),/音乐加载失败/);
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
  await prepareGameMusic(c,score,full,60);assert.equal(c.decodes,40);
});
test('局部起点从尚存尾音的位置和包络进入，已结束的音不创建节点',async()=>{
  const c=new Context(),samples=await loadGameSamples(c);
  const source=playMusicVoice(c,c.destination,samples,'ep',20,2,60,.5,2.14);
  near(source.started[1],2.14);near(source.started[2],.14);
  assert.ok(c.gains.at(-1).gain.events[0][1]<.5);
  const count=c.sources.length;
  assert.equal(playMusicVoice(c,c.destination,samples,'ep',20,2,60,.5,3),null);
  assert.equal(c.sources.length,count);
});
test('旧采样率的加载迟到失败不能删除后来已成功的音源缓存',async()=>{
  const pending=[];globalThis.fetch=()=>new Promise(resolve=>pending.push(resolve));
  const a=new Context();a.sampleRate=22050;
  const failed=assert.rejects(loadGameSamples(a));
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
  const b=new Context();b.sampleRate=32000;await loadGameSamples(b);
  pending.forEach(resolve=>resolve({ok:false}));await failed;
  const c=new Context();c.sampleRate=32000;await loadGameSamples(c);assert.equal(c.decodes,0);
});
test('延音整小节局部播放自动承接双音，不增加敲击目标，停止释放声源',async()=>{
  const tied={title:'延音',recommendedBpm:120,chords:[[],[],[]],sections:[],backing:[],
    melody:[{beat:0,duration:8,midi:60,additionalMidis:[64],gain:.4},{beat:8,duration:4,midi:62,gain:.4}]};
  const part=selectOrbitRange(createOrbitTrack(tied,[],[{beat:0,halfTurnBeats:8}]),{startMeasure:1,endMeasure:2});
  assert.equal(part.targets.length,0);
  for(const mode of ['on-hit','automatic']){
    const c=new Context(),music=await prepareGameMusic(c,tied,part,120);music.start(clock,mode);
    assert.equal(c.sources.length,2);assert.equal(leads(c).length,0);
    for(const source of c.sources){near(source.started[0],20);near(source.started[1]/source.playbackRate.value,2);near(source.stops[0][0],22);}
    music.stop();for(const source of c.sources)near(source.stops.at(-1)[0],10.04);
  }
});
