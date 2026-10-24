import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,ws:false},optimizeDeps:{noDiscovery:true,include:[]}});
const {createOrbitMapCamera}=await server.ssrLoadModule('/src/game/rendering/OrbitMapCamera.ts');
const {createOrbitTrack,selectOrbitRange,orbitPose:inputPose}=await server.ssrLoadModule('/src/game/core/OrbitTrack.ts');
const {glimmer}=await server.ssrLoadModule('/src/game-content/levels/glimmer/index.ts');
const { gameLevels }=await server.ssrLoadModule('/src/game/catalog.ts');
const { createLevelTrack }=await server.ssrLoadModule('/src/game/core/GameLevel.ts');
await server.close();
const orbitPose=(time,beat,track)=>inputPose(time,beat,track,track.targets.length);
const track=createOrbitTrack(glimmer.exercise,glimmer.twirlTiles);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('音乐地图按拍位确定取景，整轮不缩放，也不修改原始地图',()=>{
  const before=structuredClone(track),view=createOrbitMapCamera(track),base=view(0,600,1280,650);
  for(let beat=-4;beat<=64;beat+=.125){
    const a=view(beat*600,600,1280,650),b=view(beat*250,250,1280,650);
    assert.deepEqual(a,b);assert.equal(a.spacing,base.spacing);
  }
  assert.deepEqual(track,before);
});

for(const [width,height] of [[1280,650],[350,520],[302,340]])test(`${width}×${height} 音乐地图全程保留双球和未来两拍落点`,()=>{
  const view=createOrbitMapCamera(track);
  for(let beat=-4;beat<=63;beat+=1/24){
    const camera=view(beat*600,600,width,height),pose=orbitPose(beat*600,600,track),p=track.points[pose.anchor];
    const ballPoints=[p,{x:p.x+Math.cos(pose.angle),y:p.y+Math.sin(pose.angle)}];
    for(const point of ballPoints){
      const x=camera.x+point.x*camera.spacing,y=camera.y+point.y*camera.spacing;
      const radius=camera.spacing*.24;
      assert.ok(x>=radius+14&&x<=width-radius-14,`球被横向裁切: ${beat}, ${x}`);
      assert.ok(y>=radius+40&&y<=height-radius-14,`球被纵向裁切: ${beat}, ${y}`);
    }
    track.targets.forEach((target,index)=>{
      if(target<beat||target>beat+2)return;
      const point=track.points[index+1],x=camera.x+point.x*camera.spacing,y=camera.y+point.y*camera.spacing;
      assert.ok(x>=20&&x<=width-20,`预读落点被横向裁切: ${beat}, ${target}, ${x}`);
      assert.ok(y>=60&&y<=height-40,`预读落点被纵向裁切: ${beat}, ${target}, ${y}`);
    });
  }
});

test('落点、转向与预读窗口的边界不会造成镜头跳变',()=>{
  const view=createOrbitMapCamera(track);
  for(const beat of [...track.targets,...track.targets.map(beat=>beat-2)]){
    const before=view((beat-1e-8)*600,600,1280,650),after=view((beat+1e-8)*600,600,1280,650);
    assert.ok(Math.abs(before.x-after.x)<.0001);assert.ok(Math.abs(before.y-after.y)<.0001);
  }
  assert.deepEqual(view(-9000,600,1280,650),view(-600,600,1280,650));
  assert.deepEqual(view(90000,600,1280,650),view(63*600,600,1280,650));
});

test('局部练习沿用绝对坐标，取景在本段末尾停止，完整地图不裁切',()=>{
  const part=selectOrbitRange(track,{startMeasure:8,endMeasure:10}),view=createOrbitMapCamera(part);
  assert.equal(part.map,track.map);
  const moved={...part,points:part.points.map(p=>({x:p.x+123,y:p.y-79}))},movedView=createOrbitMapCamera(moved);
  for(let beat=-1;beat<8;beat+=.125){
    const a=view(beat*600,600,1280,650),b=movedView(beat*600,600,1280,650);
    near(a.spacing,b.spacing);near(a.x-123*a.spacing,b.x);near(a.y+79*a.spacing,b.y);
  }
  assert.deepEqual(view(8*600,600,1280,650),view(part.targets.at(-1)*600,600,1280,650));
});

for(const [width,height] of [[1280,650],[350,520],[302,340]])test(`${width}×${height} 晚按前的完整圆周仍在画面内，且经过待命中的目标`,()=>{
  for(const t of [track,selectOrbitRange(track,{startMeasure:8,endMeasure:10})]){
    const view=createOrbitMapCamera(t),spacing=view(0,250,width,height).spacing;
    for(let i=0;i<t.targets.length;i++){
      const late=Math.min(.8,(t.targets[i+1]-t.targets[i])/2||.8)-1e-7;
      for(const offset of [-.01,0,late]){
        const time=(t.targets[i]+offset)*250,p=inputPose(time,250,t,i);
        const c=view(time,250,width,height),anchor=t.points[p.anchor],target=t.points[p.anchor+1];
        near(Math.hypot(target.x-anchor.x,target.y-anchor.y),1);
        assert.equal(c.spacing,spacing);
        const x=c.x+anchor.x*c.spacing,y=c.y+anchor.y*c.spacing;
        assert.ok(x-c.spacing>=8&&x+c.spacing<=width-8,`圆周横向裁切: ${t.range.startMeasure}, ${i}, ${offset}, ${x}`);
        assert.ok(y-c.spacing>=20&&y+c.spacing<=height-14,`圆周纵向裁切: ${t.range.startMeasure}, ${i}, ${offset}, ${y}`);
      }
    }
  }
});

for(const level of gameLevels)test(`${level.title} 共用取景保留圆周、双球和两拍预读，局部练习不改地图`,()=>{
  const full=createLevelTrack(level);
  const middle=Math.floor(full.range.endMeasure/2);
  for(const t of [full,selectOrbitRange(full,{startMeasure:middle,endMeasure:middle+1})]){
    assert.equal(t.map,full.map);
    for(const [width,height] of [[1280,650],[350,520],[302,340]]){
      const view=createOrbitMapCamera(t),spacing=view(-4000,250,width,height).spacing;
      for(let index=0;index<t.targets.length;index++){
        const late=Math.min(.8,(t.targets[index+1]-t.targets[index])/2||.8)-1e-7;
        for(const offset of [-.01,0,late]){
          const time=(t.targets[index]+offset)*250,pose=inputPose(time,250,t,index);
          const c=view(time,250,width,height),anchor=t.points[pose.anchor];
          assert.equal(c.spacing,spacing);
          const x=c.x+anchor.x*c.spacing,y=c.y+anchor.y*c.spacing;
          assert.ok(x-c.spacing>=8&&x+c.spacing<=width-8,`圆周横向裁切: ${index}, ${offset}, ${width}`);
          assert.ok(y-c.spacing>=20&&y+c.spacing<=height-14,`圆周纵向裁切: ${index}, ${offset}, ${height}`);
          t.targets.forEach((target,i)=>{
            if(target<time/250||target>time/250+2)return;
            const p=t.points[i+1],x=c.x+p.x*c.spacing,y=c.y+p.y*c.spacing;
            assert.ok(x>=20&&x<=width-20,'预读落点横向裁切');
            assert.ok(y>=60&&y<=height-40,'预读落点纵向裁切');
          });
        }
      }
    }
  }
});
