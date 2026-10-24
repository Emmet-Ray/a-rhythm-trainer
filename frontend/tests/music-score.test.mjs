import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {createMusicMelody}=await server.ssrLoadModule('/src/game/core/MusicScore.ts');
const {createOrbitTrack,twirlTilesAtBeats}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const {quarter}=await server.ssrLoadModule('/src/game-content/levels/quarter/index.ts');
const {eighth}=await server.ssrLoadModule('/src/game-content/levels/eighth/index.ts');
const {triplet}=await server.ssrLoadModule('/src/game-content/levels/triplet/index.ts');
const {glimmer}=await server.ssrLoadModule('/src/game-content/levels/glimmer/index.ts');
await server.close();

test('按小节音高生成拍位、音符时长和力度，缺音多音不能挪用后续小节',()=>{
  const exercise={timeSignature:{beats:4,beatType:4},measures:[{elements:[
    {kind:'note',noteValue:'quarter'},{kind:'note',noteValue:'eighth'},{kind:'note',noteValue:'eighth'},
    {kind:'note',noteValue:'quarter'},{kind:'note',noteValue:'quarter'},
  ]}]};
  const notes=createMusicMelody(exercise,[[60,62,64,65,67]],beat=>Number.isInteger(beat)?.5:.3);
  assert.deepEqual(notes.map(note=>note.beat),[0,1,1.5,2,3]);
  assert.deepEqual(notes.map(note=>note.duration),[1,.5,.5,1,1]);
  assert.deepEqual(notes.map(note=>note.gain),[.5,.5,.3,.5,.5]);
  assert.throws(()=>createMusicMelody(exercise,[],()=>.4),/每个小节/);
  const twoBars={timeSignature:quarter.exercise.timeSignature,measures:[quarter.exercise.measures[0],eighth.exercise.measures[0]]};
  assert.throws(()=>createMusicMelody(twoBars,[Array(5).fill(60),Array(7).fill(60)],()=>.4),/第 1 小节需要 4 个/);
  for(const midi of [NaN,60.5,-1,128])assert.throws(()=>createMusicMelody(exercise,[[midi,62,64,65,67]],()=>.4),/有效的 MIDI/);
  for(const gain of [NaN,0,-.1,1.1])assert.throws(()=>createMusicMelody(exercise,[[60,62,64,65,67]],()=>gain),/音量/);
});

test('转向按音乐拍位定位，前面增减音符会自动更新序号，三连音容忍换算尾差',()=>{
  assert.deepEqual(twirlTilesAtBeats(quarter.exercise,[2]),[3]);
  assert.deepEqual(twirlTilesAtBeats(eighth.exercise,[2]),[5]);
  assert.deepEqual(twirlTilesAtBeats(eighth.exercise,[1.5,.5,0]),[1,2,4]);
  assert.deepEqual(twirlTilesAtBeats(triplet.exercise,[1/3,2/3,5/3]),[2,3,6]);
  for(const beats of [[NaN],[Infinity],[-1],[.25],[15.5],[0,Number.EPSILON]]){
    assert.throws(()=>twirlTilesAtBeats(eighth.exercise,beats),/转向拍位/);
  }
});

test('微光旋律逐一对应108个目标，四段覆盖16小节并落回主音',()=>{
  const full=createOrbitTrack(glimmer.exercise,glimmer.twirlTiles);
  assert.equal(full.durationBeats,64);assert.equal(full.targets.length,108);
  assert.deepEqual(glimmer.music.melody.map(note=>note.beat),full.targets);
  assert.deepEqual(glimmer.music.sections.map(section=>section.measure),[0,4,8,12]);
  assert.equal(glimmer.music.chords.length,16);assert.equal(glimmer.music.melody.at(-1).midi,60);
});
