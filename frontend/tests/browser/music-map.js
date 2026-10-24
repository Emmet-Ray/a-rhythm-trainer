// Isolated Vite origin, mocked API. Native Phaser screenshots verify the music map, not the design sample.
async page => {
  const origin=new URL(page.url()).origin,errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.includes('sessions')?[]:path.includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready',message:''}});
  });
  await page.addInitScript(()=>{
    window.mapContexts=[];window.mapSources=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.mapContexts.push(this);}
      createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{window.mapSources.push({time:args[0]});return start(...args);};return source;}
    };
  });
  const ready=()=>page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  const nextFrame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const settings=page.getByRole('button',{name:'练习设置',exact:true});
  const start=page.getByRole('button',{name:/^(开始游戏|我来试试)$/,exact:true});
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/game/glimmer');await ready();
  const screenshots=[];
  for(const theme of ['purple','blue','teal']){
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.colorMode='dark';},theme);await nextFrame();
    const image=await page.screenshot({path:`output/playwright/glimmer-map-${theme}.png`,scale:'css'});screenshots.push(image.toString('base64'));
  }
  check(new Set(screenshots).size===3,'theme switch did not repaint the music map');
  await page.setViewportSize({width:390,height:1000});await nextFrame();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'music map narrow overflow');
  await page.screenshot({path:'output/playwright/glimmer-map-390.png',scale:'css'});
  await page.evaluate(()=>{document.documentElement.dataset.colorMode='light';});await nextFrame();
  await page.screenshot({path:'output/playwright/glimmer-map-light-390.png',scale:'css'});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>{document.documentElement.dataset.colorMode='dark';});
  await settings.click();await page.getByRole('spinbutton',{name:'速度',exact:true}).fill('100');
  await page.getByLabel('起始小节',{exact:true}).selectOption('8');await page.getByLabel('结束小节',{exact:true}).selectOption('12');
  await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await ready();await nextFrame();
  check(await page.locator('.orbit-canvas canvas').count()===1,'range created duplicate render surfaces');
  const probes=await page.evaluate(async()=>{
    const {glimmer}=await import('/src/game-content/levels/glimmer/index.ts');
    const {createOrbitTrack,selectOrbitRange}=await import('/src/game/core/OrbitTrack.ts');
    const {createOrbitMapCamera}=await import('/src/game/rendering/OrbitMapCamera.ts');
    const full=createOrbitTrack(glimmer.exercise,glimmer.twirlTiles),part=selectOrbitRange(full,{startMeasure:8,endMeasure:12});
    const rect=document.querySelector('.orbit-canvas').getBoundingClientRect(),camera=createOrbitMapCamera(part)(-1000,1000,rect.width,rect.height);
    // The immediately preceding tile is occupied by the other ball in the ready pose.
    const before=full.points[part.anchorOffset-2];
    return {x:camera.x+before.x*camera.spacing,y:camera.y+before.y*camera.spacing,offset:camera.spacing*.55};
  });
  const image=await page.locator('.orbit-canvas').screenshot({path:'output/playwright/glimmer-map-range.png',scale:'css'});
  const pixels=await page.evaluate(async({png,x,y,offset})=>{
    const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    return [y,y+offset].map(y=>[...ctx.getImageData(Math.round(x),Math.round(y),1,1).data]);
  },{png:image.toString('base64'),...probes});
  check(pixels[0].slice(0,3).some((channel,index)=>Math.abs(channel-pixels[1][index])>8),'map before selected start disappeared');
  await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  const play=page.evaluate(async()=>{
    const {glimmer}=await import('/src/game-content/levels/glimmer/index.ts');
    const targets=glimmer.music.melody.filter(note=>note.beat>=32&&note.beat<48).map(note=>note.beat-32);
    const context=window.mapContexts.at(-1),first=window.mapSources[0].time;
    let index=0;
    await new Promise(resolve=>{const frame=()=>{
      if(context.currentTime<first)document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
      else if(context.currentTime>=first+targets[index]*.6+.008){document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));index++;}
      if(index===targets.length)resolve();else requestAnimationFrame(frame);
    };requestAnimationFrame(frame);});
  });
  await page.waitForFunction(()=>document.querySelector('.orbit-progress').textContent.startsWith('8'));
  await page.screenshot({path:'output/playwright/glimmer-map-playing.png',scale:'css'});
  for(const width of [342,390,1440]){
    await page.setViewportSize({width,height:1000});await nextFrame();
    check(await page.evaluate(()=>{
      const feedback=document.querySelector('.orbit-feedback').getBoundingClientRect();
      const section=document.querySelector('.orbit-section').getBoundingClientRect();
      const hud=document.querySelector('.orbit-hud').getBoundingClientRect();
      return feedback.right+4<=section.left&&feedback.top>=hud.top&&feedback.bottom<=hud.bottom;
    }),'music feedback overlaps the section or leaves the HUD');
    if(width===342)await page.screenshot({path:'output/playwright/glimmer-map-playing-342.png',scale:'css'});
  }
  // Retint existing textures while the same round is running; do not rebuild the audio/game.
  await page.evaluate(()=>{document.documentElement.dataset.theme='blue';});await nextFrame();
  await page.waitForFunction(()=>Number(document.querySelector('.orbit-progress').textContent.split('/')[0])>=14);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.screenshot({path:'output/playwright/glimmer-map-reduced-motion.png',scale:'css'});
  await play;await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 44 / 44',{exact:true}).isVisible(),'foldback phrase failed after theme/reduced-motion switch');
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.waitForFunction(()=>window.mapContexts.every(context=>context.state==='closed'));
  await page.goto(origin+'/game/quarter');await ready();await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  await page.keyboard.press('Escape');await start.waitFor();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.waitForFunction(()=>window.mapContexts.every(context=>context.state==='closed'));
  check(errors.length===0,errors.join('\n'));
  return {result:'native music map: themes, light/dark, 390px, full map outside local range, 44-hit foldback phrase, live retint, reduced motion, ordinary level and navigation cleanup passed',pixels};
}
