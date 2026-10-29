// Isolated Vite origin, mocked API; native Phaser pixels prove late rotation uses the old pivot.
async page => {
  const origin=new URL(page.url()).origin,errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.includes('sessions')?[]:path.includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready',message:''}});
  });
  await page.addInitScript(()=>{
    window.guideContexts=[];window.guideSources=[];window.guideBoundaries=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.guideContexts.push(this);}
      createConstantSource(){const s=super.createConstantSource(),start=s.start.bind(s);s.start=at=>{window.guideBoundaries.push(at);return start(at);};return s;}
      createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.guideSources.push({time:args[0]});return start(...args);};return source;}
    };
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1440,height:1000});
  const samples=[];
  for(const [level,bpm] of [['quarter',60],['glimmer',100]]){
    await page.goto(origin+'/game/'+level);
    await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
    await page.getByRole('button',{name:'练习设置',exact:true}).click();
    await page.getByRole('spinbutton',{name:'速度',exact:true}).fill(String(bpm));
    await page.getByRole('button',{name:'应用设置',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
    await page.evaluate(()=>{document.documentElement.dataset.colorMode='dark';});
    await page.screenshot({path:`output/playwright/orbit-guide-${level}-ready.png`,scale:'css'});
    await page.getByRole('button',{name:/^(开始游戏|我来试试)$/,exact:true}).click();
    await page.locator('[data-phase="count-in"]').waitFor();
    await page.evaluate(async ()=>{
      const context=window.guideContexts.at(-1),first=window.guideBoundaries.at(-1);
      await new Promise((resolve,reject)=>{const frame=()=>{
        if(context.currentTime<first)document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
        if(document.querySelector('[data-phase="failed"]'))resolve();
        else if(context.currentTime>first+2)reject(new Error('miss did not end the round'));
        else requestAnimationFrame(frame);
      };requestAnimationFrame(frame);});
    },level==='glimmer');
    const probes=await page.evaluate(async({level,bpm})=>{
      const {gameLevels}=await import('/src/game/catalog.ts');
      const {createOrbitTrack,orbitPose}=await import('/src/game/core/OrbitTrack.ts');
      const {createOrbitMapCamera}=await import('/src/game/rendering/OrbitMapCamera.ts');
      const data=gameLevels.find(item=>item.id===level),track=createOrbitTrack(data.exercise,data.twirlTiles);
      const beatMs=60000/bpm,time=150,pose=orbitPose(time,beatMs,track,0);
      const {width,height}=document.querySelector('.orbit-canvas').getBoundingClientRect();
      const camera=createOrbitMapCamera(track)(time,beatMs,width,height);
      const anchor=track.points[pose.anchor];
      const pixel=p=>({x:camera.x+p.x*camera.spacing,y:camera.y+p.y*camera.spacing});
      return {moving:pixel({x:anchor.x+Math.cos(pose.angle),y:anchor.y+Math.sin(pose.angle)}),target:pixel(track.points[1])};
    },{level,bpm});
    const png=await page.locator('.orbit-canvas').screenshot({path:`output/playwright/orbit-guide-${level}-late.png`,scale:'css'});
    const pixels=await page.evaluate(async({png,probes})=>{
      const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      return Object.fromEntries(Object.entries(probes).map(([key,p])=>[key,[...ctx.getImageData(Math.round(p.x),Math.round(p.y),1,1).data]]));
    },{png:png.toString('base64'),probes});
    check(pixels.moving[0]>pixels.moving[1]*1.1&&pixels.moving[1]>pixels.moving[2]*1.1,`${level}: orange ball did not pass the target on its original circle: ${JSON.stringify(pixels)}`);
    check(pixels.target.slice(0,3).some((v,i)=>Math.abs(v-pixels.moving[i])>30),`${level}: ball still anchored automatically on target`);
    samples.push({level,pixels});
    await page.getByRole('button',{name:'再试一次',exact:true}).click();
    await page.locator('[data-phase="count-in"]').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:/^(开始游戏|我来试试)$/,exact:true}).waitFor();
    await page.setViewportSize({width:390,height:1000});
    await page.screenshot({path:`output/playwright/orbit-guide-${level}-390.png`,scale:'css'});
    await page.evaluate(()=>{document.documentElement.dataset.colorMode='light';});
    await page.screenshot({path:`output/playwright/orbit-guide-${level}-light-390.png`,scale:'css'});
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('link',{name:'关卡列表',exact:true}).click();
    await page.waitForFunction(()=>window.guideContexts.every(context=>context.state==='closed'));
  }
  check(errors.length===0,errors.join('\n'));
  return {result:'native ordinary/music pixels verify late overrun, original pivot, failure freeze; retry/Escape, narrow/light/dark/reduced motion and audio cleanup passed',samples};
}
