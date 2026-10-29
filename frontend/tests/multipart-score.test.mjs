import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
after(()=>server.close());
const {compileMultipartScore,hitsFromParts}=await server.ssrLoadModule('/src/game/core/MultipartScore.ts');
const {createOrbitTrack,selectOrbitRange}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const note=(id,beat,duration=1,midi=60)=>({id,beat,duration,midi,velocity:.5});
const part=(id,notes)=>({id,name:id,preset:{kind:'melodic',program:24},notes});
const score=parts=>({title:'Fixture',recommendedBpm:95,soundFont:{file:'/bank.sf2',gain:1},bars:[4,4],sections:[],parts,hits:hitsFromParts(parts)});

test('independent parts preserve overlapping durations, same-instrument identity and cross-part hit groups',()=>{
 const a=part('right',[note('a',0,3),note('b',1,1)]),b=part('left',[note('a',0,2,48),note('c',2,2,50)]);
 const music=score([a,b]),before=JSON.stringify(music),compiled=compileMultipartScore(music);
 assert.deepEqual(compiled.hits.map(h=>[h.beat,h.notes.length]),[[0,2],[1,1],[2,1]]);
 assert.equal(compiled.notes.find(n=>n.part.id==='right'&&n.id==='a').duration,3);
 assert.equal(compiled.notes.find(n=>n.part.id==='left'&&n.id==='a').duration,2);
 assert.deepEqual(createOrbitTrack(music).targets,[0,1,2]);
 assert.equal(JSON.stringify(music),before);
});

test('automatic parts add no hits; meter and tied-only ranges do not need chords',()=>{
 const a=part('solo',[note('a',0,4),note('b',1,1)]),b=part('pad',[note('pad',0,8,48)]);
 const music={...score([a,b]),bars:[2,3,4],pickupBeats:1,hits:hitsFromParts([a])};
 const compiled=compileMultipartScore(music);
 assert.deepEqual(compiled.measureStarts,[0,1,4,8]);
 assert.equal(compiled.notes.find(n=>n.part.id==='pad').hit,null);
 const track=selectOrbitRange(createOrbitTrack(music),{startMeasure:2,endMeasure:3});
 assert.deepEqual(track.targets,[]);assert.equal(track.durationBeats,4);
});

test('invalid references, duplicate ownership, offbeat groups and malformed music report actionable errors',()=>{
 const fixture=()=>score([part('solo',[note('a',0),note('b',1)])]);
 for(const [change,message] of [
  [s=>s.hits[0][0].noteId='missing',/solo\/missing/],
  [s=>s.hits.push(s.hits[0]),/重复归属/],
  [s=>s.hits=[s.hits.flat()],/同一拍位/],
  [s=>s.hits.reverse(),/递增/],
  [s=>s.parts.push(s.parts[0]),/声部 ID/],
  [s=>s.parts[0].notes[0].duration=0,/solo.*a/],
  [s=>s.parts[0].notes[0].midi=128,/音高/],
  [s=>s.parts[0].preset.program=-1,/音色/],
  [s=>s.hits=[[]],/没有音符/],
 ]){const s=fixture();change(s);assert.throws(()=>compileMultipartScore(s),message);}
});

test('part count and names are data, including drums and more than sixteen same-instrument parts',()=>{
 const parts=Array.from({length:24},(_,i)=>part(`staff-${i}`,[note('a',0,1,40+i)]));
 parts[23].preset={kind:'drums',program:0};
 const compiled=compileMultipartScore(score(parts));
 assert.equal(compiled.parts.length,24);assert.equal(compiled.hits.length,1);assert.equal(compiled.hits[0].notes.length,24);
});
