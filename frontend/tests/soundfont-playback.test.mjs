import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

// Record the public synth contract; use the real player and range selection.
const server = await createServer({
  ssr: { noExternal: ['spessasynth_lib'] },
  configFile: false, server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{ name: 'soundfont-test-synth', enforce: 'pre',
    resolveId(id) {
      if (id === 'spessasynth_lib') return '\0test-synth';
      if (id.includes('spessasynth_processor.min.js')) return '\0test-processor';
    },
    load(id) {
      if (id === '\0test-processor') return 'export default "processor.js"';
      if (id === '\0test-synth') return `
        export const instances = [];
        export class WorkletSynthesizer {
          constructor() { instances.push(this); this.events = []; this.voiceCount = 0;
            this.coreChannelCount = 16; this.listeners = new Map(); this.eventHandler = {addEvent: (type,id,fn)=>this.listeners.set(type,fn),removeEvent:type=>this.listeners.delete(type)};
            this.midiChannels = Array.from({length:16}, () => ({setDrums(){},setSystemParameter(){}}));
            this.soundBankManager = {addSoundBank: async () => {}}; this.isReady = Promise.resolve(); }
          addNewChannelInternal() { this.midiChannels.push({setDrums(){},setSystemParameter(){}}); }
          addNewChannel() {
            // Real 4.4.x core sends parameter changes before channelAdded.
            this.midiChannels[this.coreChannelCount++].setSystemParameter("gain", 1);
            this.addNewChannelInternal(); this.listeners.get("channelAdded")?.();
          }
          setLogLevel() {} setSystemParameter() {} controllerChange() {} programChange() {} connectChannel() {}
          noteOn(channel, key, velocity, options) { this.events.push({kind:'on',channel,key,velocity,...options}); }
          noteOff(channel, key, options) { this.events.push({kind:'off',channel,key,...options}); }
          destroy() { this.destroyed = true; }
        }`;
    },
  }],
});
after(() => server.close());
const { prepareSoundFontMusic } = await server.ssrLoadModule('/src/game/audio/SoundFontMusic.ts');
const { instances } = await server.ssrLoadModule('\0test-synth');
const { createOrbitTrack, selectOrbitRange } = await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');

test('GS local entry plays remaining tied chord/backing without new targets; chord gain and disposal stay bounded', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok:true, arrayBuffer:async()=>new ArrayBuffer(8)});
  t.after(() => { globalThis.fetch = originalFetch; });
  const gain = () => ({gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelAndHoldAtTime(){}},connect(){},disconnect(){}});
  const context = {currentTime:0,audioWorklet:{addModule:async()=>{}},createGain:gain,
    createConstantSource:()=>({offset:{value:0},connect(){},disconnect(){},start(){},stop(){}}),destination:{}};
  const notes=[...[60,64,67,72].map((midi,i)=>({id:`a${i}`,beat:2,duration:5,midi,velocity:.4})),
    ...[62,65,69,74].map((midi,i)=>({id:`b${i}`,beat:7,duration:1,midi,velocity:.4}))];
  const score={title:'Tied chord',recommendedBpm:60,bars:[4,4,4],sections:[],soundFont:{file:'/test.sf2',gain:1},
    parts:[{id:'melody',name:'melody',preset:{kind:'melodic',program:24},notes},
      {id:'keys',name:'keys',preset:{kind:'melodic',program:4},notes:[{id:'a',beat:3,duration:8,midi:48,velocity:.2},{id:'b',beat:0,duration:1,midi:50,velocity:.2}]}],
    hits:[notes.slice(0,4).map(n=>({partId:'melody',noteId:n.id})),notes.slice(4).map(n=>({partId:'melody',noteId:n.id}))]};
  const track = selectOrbitRange(createOrbitTrack(score, [], [{beat:2,halfTurnBeats:4}]), {startMeasure:1,endMeasure:2});
  assert.deepEqual(track.targets,[3]);
  const player = await prepareSoundFontMusic(context, score, track, 60);
  t.after(() => player.stop());
  player.start({audioTimeAt:ms=>10+ms/1000}, 'automatic');
  const synth = instances.at(-1), ons = synth.events.filter(e=>e.kind==='on'), offs = synth.events.filter(e=>e.kind==='off');
  assert.deepEqual(ons.filter(e=>e.time===10).map(e=>e.key),[60,64,67,72,48]);
  assert.deepEqual(ons.filter(e=>e.time===13).map(e=>e.key),[62,65,69,74]);
  assert.equal(ons.filter(e=>e.key===50).length,0,'expired backing must stay silent');
  assert.ok(ons.filter(e=>e.key!==48).every(e=>e.velocity===51),'four-note chord uses half single-note gain');
  assert.ok(offs.filter(e=>[60,64,67,72].includes(e.key)).every(e=>e.time===13));
  assert.equal(offs.find(e=>e.key===48).time,14,'carried backing clipped at range end');
  player.stop();
  const count = synth.events.length;
  player.tap(0);
  assert.equal(synth.events.length,count,'stopped player cannot restart notes');
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(synth.destroyed,true);
});


test('more than sixteen channels, cross-part hits and repeated pitches keep independent note-offs', async t => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  t.after(()=>{globalThis.fetch=originalFetch;});
  const gain=()=>({gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelAndHoldAtTime(){}},connect(){},disconnect(){}});
  const context={currentTime:10,audioWorklet:{addModule:async()=>{}},createGain:gain,
    createConstantSource:()=>({offset:{value:0},connect(){},disconnect(){},start(){},stop(){}}),destination:{}};
  const parts=Array.from({length:20},(_,i)=>({id:`p${i}`,name:`p${i}`,preset:{kind:'melodic',program:24},notes:[{id:'a',beat:0,duration:2,midi:60,velocity:.5}]}));
  parts[0].notes.push({id:'b',beat:.5,duration:1,midi:60,velocity:.5});
  const score={title:'Many parts',recommendedBpm:60,soundFont:{file:'/many.sf2',gain:1},bars:[4],sections:[],parts,
    hits:[[{partId:'p0',noteId:'a'},{partId:'p1',noteId:'a'}],[{partId:'p0',noteId:'b'}]]};
  const player=await prepareSoundFontMusic(context,score,createOrbitTrack(score),60);
  t.after(()=>player.stop());
  player.start({audioTimeAt:ms=>10+ms/1000},'on-hit');
  const synth=instances.at(-1);
  assert.equal(synth.events.filter(e=>e.kind==='on').length,18,'hit-owned notes must not autoplay');
  player.tap(0);context.currentTime=10.45;player.tap(1);
  const ons=synth.events.filter(e=>e.kind==='on');
  assert.equal(ons.length,21);assert.ok(synth.midiChannels.length>16);
  const a=ons[18],b=ons[20];assert.notEqual(a.channel,b.channel,'early repeated pitch needs a separate lane');
  assert.equal(synth.events.find(e=>e.kind==='off'&&e.channel===a.channel).time,12);
  assert.equal(synth.events.find(e=>e.kind==='off'&&e.channel===b.channel).time,11.45);
  player.stop();await new Promise(r=>setTimeout(r,80));assert.equal(synth.destroyed,true);
});
