import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';

const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {glimmer}=await server.ssrLoadModule('/src/game-content/levels/glimmer/index.ts');
const {createOrbitTrack}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
await server.close();
const track=createOrbitTrack(glimmer.exercise,glimmer.twirlTiles);
const pointAt=beat=>{
  const index=track.targets.indexOf(beat);
  assert.ok(index>=0,`缺少 ${beat} 拍落点`);
  return track.points[index+1];
};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('微光奔跑段先向右展开、折返向左，再留出出口并以二平均方波收束',()=>{
  // 拍位从 0 开始。检查乐句走势，不把每个反转序号或绝对坐标锁死。
  for(const beat of [34,35])assert.ok(pointAt(beat+1).x>pointAt(beat).x);
  for(const beat of [36,37,38,39,40,41])assert.ok(pointAt(beat+1).x<pointAt(beat).x);
  for(const beat of [42,43,44,45,46,47])assert.ok(pointAt(beat+1).x>pointAt(beat).x);
  near(pointAt(44).y,pointAt(48).y);
  const wave=[44,44.5,45,45.5,46,46.5,47,47.5,48].map(pointAt);
  for(let i=0;i<wave.length-1;i++){
    const dx=wave[i+1].x-wave[i].x,dy=wave[i+1].y-wave[i].y;
    if(i%2===0){near(dx,0);near(dy,i%4===0?1:-1);}
    else{near(dx,1);near(dy,0);}
  }
  // 归来段最后一小节恢复直路，与第一段方向一致。
  const start=pointAt(1),entry=pointAt(0);
  for(const beat of [60,61,62]){
    near(pointAt(beat+1).x-pointAt(beat).x,start.x-entry.x);
    near(pointAt(beat+1).y-pointAt(beat).y,start.y-entry.y);
  }
});

test('微光完整地图的非相邻路段为宽地块保留间距',()=>{
  const distance=(p,a,b)=>{
    const dx=b.x-a.x,dy=b.y-a.y;
    const along=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(p.x-a.x-along*dx,p.y-a.y-along*dy);
  };
  // 不交叉另由所有正式关卡共用的测试覆盖；这里检查折返处宽道路的净空。
  for(let i=0;i<track.points.length-1;i++)for(let j=i+2;j<track.points.length-1;j++){
    const [a,b,c,d]=[track.points[i],track.points[i+1],track.points[j],track.points[j+1]];
    const gap=Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
    assert.ok(gap>.64,`路段 ${i} 与 ${j} 过近：${gap}`);
  }
});
