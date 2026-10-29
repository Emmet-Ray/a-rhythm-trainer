import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {gameLevels,soundFontBanks}=await server.ssrLoadModule('/src/game/catalog.ts');
const {compileMultipartScore}=await server.ssrLoadModule('/src/game/core/MultipartScore.ts');
const {createLevelTrack}=await server.ssrLoadModule('/src/game/core/GameLevel.ts');
await server.close();

test('every shipped level uses independent GS parts and its explicit hit map matches the route',()=>{
 for(const level of gameLevels){
  const performance=compileMultipartScore(level.music),track=createLevelTrack(level);
  assert.deepEqual(performance.hits.map(h=>h.beat),track.targets,level.id);
  assert.equal(performance.measureStarts.at(-1),track.durationBeats,level.id);
  assert.ok(soundFontBanks.some(b=>b.file===level.music.soundFont.file),level.id);
 }
});

test('glimmer keeps its established instrumentation and distinct automatic accompaniment',()=>{
 const music=gameLevels.find(l=>l.id==='glimmer').music,performance=compileMultipartScore(music);
 assert.equal(performance.hits.length,108);
 assert.deepEqual(music.parts.map(p=>p.preset.program),[0,4,33,0,0,0]);
 assert.deepEqual([...new Set(performance.notes.filter(n=>n.part.preset.kind==='drums').map(n=>n.midi))].sort(),[36,37,42]);
 assert.ok(performance.notes.some(n=>n.hit===null));
});
