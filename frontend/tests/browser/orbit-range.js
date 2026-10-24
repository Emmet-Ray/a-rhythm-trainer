// Run on an isolated Vite origin. API mocked; real Phaser and Web Audio clock.
async page => {
  const origin=new URL(page.url()).origin;
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    let json={status:'ready',message:''};
    if(path.includes('model-connections'))json={provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}};
    if(path.includes('sessions'))json=[];
    return route.fulfill({json});
  });
  await page.addInitScript(()=>{
    if(window.orbitContexts)return;
    window.orbitContexts=[];window.orbitSources=[];window.orbitBoundaries=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.orbitContexts.push(this);}
      createConstantSource(){
        const source=super.createConstantSource(),entry={};
        const start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=at=>{entry.at=at;window.orbitBoundaries.push(entry);return start(at);};
        source.stop=at=>{entry.end=at;return stop(at);};return source;
      }
      createBufferSource(){
        const source=super.createBufferSource(),entry={stopped:false,ended:false};
        const start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=(...args)=>{entry.time=args[0];window.orbitSources.push(entry);return start(...args);};
        source.stop=(...args)=>{entry.stopped=true;return stop(...args);};
        source.addEventListener('ended',()=>{entry.ended=true;});return source;
      }
    };
  });
  const settings=page.getByRole('button',{name:'练习设置',exact:true});
  const dialog=page.getByRole('dialog',{name:'练习设置',exact:true});
  const assertSettings=async(bpm,first,last)=>{
    await settings.click();
    check(await page.getByRole('spinbutton',{name:'速度',exact:true}).inputValue()===String(bpm),'BPM mismatch');
    check(await page.getByLabel('起始小节',{exact:true}).inputValue()===String(first),'start mismatch');
    check(await page.getByLabel('结束小节',{exact:true}).inputValue()===String(last),'end mismatch');
    await page.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});
  };
  const start=page.getByRole('button',{name:/^(开始游戏|我来试试)$/,exact:true});
  const ready=()=>page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  let currentBpm=60;
  const apply=async(bpm,first,last)=>{
    currentBpm=bpm;
    await settings.click();await page.getByRole('spinbutton',{name:'速度',exact:true}).fill(String(bpm));
    await page.getByLabel('起始小节',{exact:true}).selectOption(String(first));
    await page.getByLabel('结束小节',{exact:true}).selectOption(String(last));
    await page.getByRole('button',{name:'应用设置',exact:true}).click();
    await dialog.waitFor({state:'hidden'});await ready();
  };
  const q=[0],e=[0,.5],s=[0,.25,.5,.75],front=[0,.5,.75],back=[0,.25,.5];
  const dot=[0,.75],reverse=[0,.25],sync=[0,.25,.75],triplet=[0,1/3,2/3];
  const beats=[q,q,e,e,e,e,s,s,front,front,back,back,front,back,front,back,
    dot,dot,reverse,reverse,sync,sync,dot,reverse,e,triplet,e,triplet,triplet,e,q,q];
  const targets=(first,last)=>beats.slice(first*4,last*4).flatMap((offsets,beat)=>offsets.map(offset=>beat+offset));
  const play=async(targets)=>{
    await page.evaluate(()=>{window.orbitSources=[];});await start.click();
    await page.locator('[data-phase="count-in"]').waitFor();
    check(await settings.isDisabled(),'settings editable during play');
    return page.evaluate(async ({targets,bpm})=>{
      // Music boundary is independent of backing voice count and sample order.
      const first=window.orbitBoundaries.at(-1).at,beat=60/bpm,context=window.orbitContexts.at(-1);
      let index=0;
      await new Promise(resolve=>{
        const frame=()=>{
          // Headless Chromium's audio clock can drift from performance.now while idle.
          // Ignored preparation taps keep the input clock sampled and also verify count-in isolation.
          if(context.currentTime<first){
            document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
          }else if(context.currentTime>=first+targets[index]*beat+.005){
            document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));index++;
          }
          if(index===targets.length)resolve();else requestAnimationFrame(frame);
        };requestAnimationFrame(frame);
      });
    },{targets,bpm:currentBpm});
  };
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/game/comprehensive');await ready();
  check(await page.getByLabel('完成 0 / 77',{exact:true}).isVisible(),'initial full target count');
  await settings.click();
  await page.getByRole('spinbutton',{name:'速度',exact:true}).fill('120');
  await page.getByLabel('起始小节',{exact:true}).selectOption('6');
  await page.getByLabel('结束小节',{exact:true}).selectOption('5');
  check(await page.getByLabel('起始小节',{exact:true}).inputValue()==='4','end before start did not normalize');
  await dialog.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
  await page.screenshot({path:'output/playwright/game-settings-1440.png'});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await assertSettings(60,0,8);
  check(await settings.evaluate(el=>document.activeElement===el&&getComputedStyle(el).outlineStyle==='none'),'mouse dialog close focus');
  await apply(120,4,6);
  check(await page.getByLabel('完成 0 / 18',{exact:true}).isVisible(),'range target count');
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.getByRole('button',{name:/基础节奏/}).click();await page.getByRole('link',{name:'开始综合挑战',exact:true}).click();await ready();
  await assertSettings(120,4,6);
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});await settings.click();
    await dialog.evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings horizontal overflow');
    await page.screenshot({path:`output/playwright/game-settings-${width}.png`});
    await page.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await page.screenshot({path:`output/playwright/game-range-${width}.png`});
  }
  // Read an actual rendered map tile before the selected start, away from both balls.
  // This catches a renderer that still draws only the selected movement segment.
  const mapShot=await page.locator('.orbit-canvas canvas').screenshot();
  const previousTileVisible=await page.evaluate(async png=>{
    const {createOrbitTrack,selectOrbitRange}=await import('/src/game/core/OrbitTrack.ts');
    const {createOrbitMapCamera}=await import('/src/game/rendering/OrbitMapCamera.ts');
    const {gameLevels}=await import('/src/game/catalog.ts');
    const level=gameLevels.find(level=>level.id==='comprehensive'),full=createOrbitTrack(level.exercise,level.twirlTiles);
    const part=selectOrbitRange(full,{startMeasure:4,endMeasure:6}),point=full.points[part.anchorOffset-2];
    const host=document.querySelector('.orbit-canvas'),camera=createOrbitMapCamera(part)(-1000,1000,host.clientWidth,host.clientHeight);
    const x=camera.x+point.x*camera.spacing,y=camera.y+point.y*camera.spacing;
    const bitmap=await createImageBitmap(await (await fetch('data:image/png;base64,'+png)).blob());
    const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
    const sample=(dx,dy)=>context.getImageData(Math.round((x+dx)*bitmap.width/host.clientWidth),Math.round((y+dy)*bitmap.height/host.clientHeight),1,1).data;
    const pixel=sample(0,0);
    const visible=pixel[3]>250&&[[24,24],[24,-24],[-24,24],[-24,-24]].some(([dx,dy])=>{
      const background=sample(dx,dy);
      return pixel.slice(0,3).some((value,index)=>Math.abs(value-background[index])>5);
    });
    bitmap.close();
    return visible;
  },mapShot.toString('base64'));
  check(previousTileVisible,'map before selected start was removed');
  await play(targets(4,6));await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByRole('heading',{name:'完成',exact:true}).isVisible(),'partial counted as full challenge');
  check(await page.getByLabel('完成 18 / 18',{exact:true}).isVisible(),'partial did not complete');
  check(await page.evaluate(()=>{const b=window.orbitBoundaries.at(-1);return Math.abs(b.end-b.at-4)<1e-8;}),'range music boundary is not eight beats at 120 BPM');
  check(await page.evaluate(()=>window.orbitSources.every(s=>s.stopped||s.ended)),'completed range left audio');
  await page.getByRole('button',{name:'再来一次',exact:true}).click();await page.locator('[data-phase="failed"]').waitFor();
  check(await page.getByRole('heading',{name:'错过了这一拍',exact:true}).isVisible(),'failure result missing');
  check(await page.evaluate(()=>window.orbitSources.every(s=>s.stopped||s.ended)),'failed range left audio');
  await apply(120,4,5);
  check(await page.getByLabel('完成 0 / 8',{exact:true}).isVisible(),'failed-measure shortcut');
  await assertSettings(120,4,5);
  await play(targets(4,5));await page.locator('[data-phase="completed"]').waitFor();
  await page.getByRole('button',{name:'练习设置',exact:true}).click();await page.getByLabel('起始小节',{exact:true}).selectOption('0');await page.getByLabel('结束小节',{exact:true}).selectOption(await page.getByLabel('结束小节',{exact:true}).locator('option').last().getAttribute('value'));await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await ready();
  check(await page.getByLabel('完成 0 / 77',{exact:true}).isVisible(),'return full target count');
  await assertSettings(120,0,8);
  await apply(240,0,8);
  await play(targets(0,6));await page.locator('[data-phase="failed"]').waitFor();
  check(await page.getByRole('heading',{name:'错过了这一拍',exact:true}).isVisible(),'late-stage failure result');
  await apply(240,6,7);
  check(await page.getByLabel('完成 0 / 10',{exact:true}).isVisible(),'triplet-section shortcut target count');
  await page.evaluate(()=>{window.orbitSources=[];});await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  await page.screenshot({path:'output/playwright/game-range-count-in.png'});
  await page.keyboard.press('Escape');await start.waitFor();
  check(await page.evaluate(()=>window.orbitSources.every(s=>s.stopped||s.ended)),'Escape left range audio');
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.waitForFunction(()=>window.orbitContexts.every(c=>c.state==='closed'));
  check(errors.length===0,errors.join('\n'));
  return 'Range settings/cancel/focus, responsive modal, per-level range restoration, 18 and 8 hit partial completion, full reset, late-stage range selection, count-in, Escape and audio cleanup passed';
}
