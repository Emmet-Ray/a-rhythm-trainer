import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,statSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {arrangeMusic}=await server.ssrLoadModule('/src/game/audio/MusicArrangement.ts');
const {nearestSample}=await server.ssrLoadModule('/src/game/audio/GameInstruments.ts');
await server.close();
test('疏朗与律动共用音源，律动更密但每声更轻；N.C. 保留静默',()=>{
 const score={chords:[[48,60,64,67],[48,60,64,67],[]],arrangements:[{measure:0,style:'spacious'},{measure:1,style:'rhythmic'}]};
 const events=arrangeMusic(score),a=events.filter(n=>n.beat<4),b=events.filter(n=>n.beat>=4);
 assert.ok(events.every(n=>n.beat<8));assert.ok(b.length>a.length);
 for(const instrument of ['ep','bass','kick','stick','hat'])assert.ok(b.find(n=>n.instrument===instrument).gain<a.find(n=>n.instrument===instrument).gain);
 assert.deepEqual(a.filter(n=>n.instrument==='ep').map(n=>n.midi),[60,64,67]);
 assert.equal(a.find(n=>n.instrument==='bass').midi,36);
 assert.equal(arrangeMusic({chords:[[41,60,65,69]]}).find(n=>n.instrument==='bass').midi,41,'F 根音保留 F2，避免降到难辨认的 F1');
 assert.deepEqual(b.filter(n=>n.instrument==='bass').map(n=>n.beat),[4,5.5,6,7.5]);
});
test('多音区映射不把所有音符从 C4 大幅变调',()=>{
 const samples=Array.from({length:13},(_,i)=>({midi:48+i*3}));
 for(let midi=48;midi<=85;midi++)assert.ok(Math.abs(nearestSample(samples,midi).midi-midi)<=1);
});
test('正式游戏音源清单与发布文件一致，包含来源及完整许可证',()=>{
 const base=new URL('../public/assets/game/shared/audio/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('../src/game-content/shared/audio/samples.json',import.meta.url)));
 assert.deepEqual(manifest.map(item=>item.file.split('/').at(-1)).sort(),readdirSync(base).filter(file=>file.endsWith('.flac')).sort());
 for(const item of manifest){const bytes=readFileSync(new URL('../public'+item.file,import.meta.url));assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);assert.ok(item.source);}
 for(const file of ['Basses-LICENSE.txt','Virtuosity-LICENSE.txt'])assert.ok(statSync(new URL(file,base)).size>100);
});


test('短小节不越界排鼓，小节内换和弦立即换低音并收住旧和声',()=>{
 const score={chords:[[48,60,64,67],[50,62,65,69],[52,64,67,71]],measureBeats:[4,2,4],
   chordChanges:[{measure:0,offset:2,chord:[43,59,62,67]},{measure:1,offset:1,chord:[]}]};
 const events=arrangeMusic(score);
 assert.ok(events.filter(n=>n.beat<2&&n.duration>0).every(n=>n.beat+n.duration<=2));
 assert.equal(events.find(n=>n.instrument==='bass'&&n.beat===2).midi,43);
 assert.ok(!events.some(n=>n.beat>=5&&n.beat<6),'N.C.区间静默');
 assert.ok(events.some(n=>n.beat===6),'第三小节从第六拍开始');
});
