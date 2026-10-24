import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {exercisePosterExamples,drawRhythmPosters}=await server.ssrLoadModule('/src/game/rendering/RhythmPosters.ts');
const {gameLevels}=await server.ssrLoadModule('/src/game/catalog.ts');
const {expandRhythmElements}=await server.ssrLoadModule('/src/rhythm/RhythmModel.ts');
await server.close();
const level=id=>gameLevels.find(level=>level.id===id);
const example=id=>exercisePosterExamples(level(id).exercise);
const starts=elements=>expandRhythmElements(elements).events.map(event=>event.startTick);
test('single studies show their exact beat and two-beat repetition, including dots and triplets',()=>{
 for(const [id,ticks] of [['quarter',[0]],['eighth',[0,12]],['sixteenth',[0,6,12,18]],['dotted-eighth',[0,18]],['reverse-dotted-eighth',[0,6]],['small-syncopation',[0,6,18]],['triplet',[0,8,16]]]) {
  assert.deepEqual(starts(example(id)[0]),ticks,id);
  assert.deepEqual(example(id)[1],[...example(id)[0],...example(id)[0]]);
 }
 assert.equal(example('dotted-eighth')[0][0].dots,1);
 assert.equal(example('triplet')[0][0].kind,'triplet');
});
test('mixed studies display both component figures; comprehensive examples are distinct actual bars',()=>{
 assert.deepEqual(example('quarter-eighth').map(starts),[[0],[0,12]]);
 assert.deepEqual(example('eighth-sixteenth').map(starts),[[0,12],[0,6,12,18]]);
 assert.deepEqual(example('eighth-triplet').map(starts),[[0,12],[0,8,16]]);
 const examples=example('comprehensive');assert.equal(examples.length,2);
 assert.deepEqual(examples,[level("comprehensive").exercise.measures[4].elements,level("comprehensive").exercise.measures[7].elements]);assert.notDeepEqual(examples[0],examples[1]);
 for(const elements of examples)assert.ok(level('comprehensive').exercise.measures.some(bar=>JSON.stringify(bar.elements)===JSON.stringify(elements)));
 assert.deepEqual(exercisePosterExamples({timeSignature:{beats:4,beatType:4},measures:[]}),[]);
});
test('notation is rasterized only inside its paper and preserves the input data',()=>{
 for(const l of gameLevels.filter(l=>l.category==='rhythm'))for(const elements of example(l.id)) for(const largeNoteheads of [false,true]) {
  const before=JSON.stringify(elements),rects=[];
  const context={save(){},restore(){},beginPath(){},rect(){},clip(){},fillRect(...args){rects.push(args);}};
  const width=largeNoteheads?Math.max(22,expandRhythmElements(elements).events.length*7+10):54;
  drawRhythmPosters(context,[{x:0,y:0,width,height:24,elements}],{largeNoteheads});
  assert.ok(rects.length>0);
  for(const [x,y,w,h]of rects)assert.ok(x>=0&&y>=0&&x+w<=width&&y+h<=24,`${l.id}: ${[x,y,w,h]}`);
  assert.equal(JSON.stringify(elements),before);
 }
});
