// Run on an isolated Vite origin. Mock API; real audio decoding/scheduling and Phaser.
async page => {
  const origin=new URL(page.url()).origin,errors=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.includes('sessions')?[]:path.includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready',message:''}});
  });
  await page.addInitScript(()=>{
    window.previewContexts=[];window.previewSources=[];window.previewBoundaries=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.previewContexts.push(this);}
      createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);
        gain.connect=(output,...args)=>{gain.output=output;return connect(output,...args);};return gain;}
      createConstantSource(){const source=super.createConstantSource(),entry={},start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=at=>{entry.at=at;window.previewBoundaries.push(entry);return start(at);};
        source.stop=at=>{entry.end=at;return stop(at);};return source;}
      createBufferSource(){
        const source=super.createBufferSource(),entry={context:this,stopped:false,ended:false};
        const start=source.start.bind(source),stop=source.stop.bind(source);
        const connect=source.connect.bind(source);source.connect=(output,...args)=>{entry.output=output;return connect(output,...args);};
        source.start=(...args)=>{Object.assign(entry,{at:args[0],offset:args[1],duration:args[2],rate:source.playbackRate.value,buffer:source.buffer});window.previewSources.push(entry);return start(...args);};
        source.stop=(...args)=>{entry.stopped=true;return stop(...args);};
        source.addEventListener('ended',()=>entry.ended=true);return source;
      }
    };
  });
  const ready=()=>page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  const preview=()=>page.getByRole('button',{name:'看示范',exact:true});
  const stop=()=>page.getByRole('button',{name:'停止示范',exact:true});
  const apply=async(bpm,first,last)=>{
    await page.getByRole('button',{name:'练习设置',exact:true}).click();
    await page.getByRole('spinbutton',{name:'速度',exact:true}).fill(String(bpm));
    await page.getByLabel('起始小节',{exact:true}).selectOption(String(first));
    await page.getByLabel('结束小节',{exact:true}).selectOption(String(last));
    await page.getByRole('button',{name:'应用设置',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});await ready();
  };
  const stopped=()=>page.waitForFunction(()=>window.previewSources.every(source=>source.stopped||source.ended));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/game/glimmer');await ready();await apply(160,8,12);
  await preview().click();await page.locator('[data-mode="preview"][data-phase="count-in"]').waitFor();
  check(await page.getByRole('button',{name:'练习设置',exact:true}).isDisabled(),'settings active during preview');
  const scheduled=await page.evaluate(async()=>{
    const {glimmer}=await import('/src/game-content/levels/glimmer/index.ts');
    const context=window.previewContexts.at(-1);
    const all=window.previewSources.filter(source=>source.context===context),backing=window.previewBoundaries.at(-1);
    const sources=all.filter(source=>source.output?.output?.output===context.destination);
    const notes=glimmer.music.melody.filter(note=>note.beat>=32&&note.beat<48);
    if(sources.length!==notes.length)throw Error('Expected all lead notes before playback');
    if(Math.abs(backing.end-backing.at-6)>1e-8)throw Error('Wrong selected music slice');
    notes.forEach((note,index)=>{
      const source=sources[index];
      if(Math.abs(source.at-backing.at-(note.beat-32)*.375)>1e-8)throw Error('Lead scheduled outside its target');
      if(Math.abs(source.rate-2**((note.midi-Array.from({length:13},(_,i)=>48+i*3).reduce((a,b)=>Math.abs(b-note.midi)<Math.abs(a-note.midi)?b:a))/12))>1e-6)throw Error('Wrong melody pitch');
    });
    document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
    document.querySelector('.orbit-stage').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
    return all.length;
  });
  await page.waitForFunction(()=>Number(document.querySelector('.orbit-progress').textContent.split('/')[0])>=12);
  check(await page.locator('.orbit-feedback').evaluate(el => !!el.closest('.sr-only')), 'preview feedback is visible');
  await page.screenshot({path:'output/playwright/orbit-preview-music.png',scale:'css'});
  await page.setViewportSize({width:390,height:1000});
  await page.screenshot({path:'output/playwright/orbit-preview-390.png',scale:'css'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'preview mobile overflow');
  await page.evaluate(()=>{
    for(let i=0;i<4;i++)document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
    document.querySelector('.orbit-stage').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
    // Audio has already been scheduled. Blocking frames must not cause a miss or schedule a burst of late notes.
    const end=performance.now()+650;while(performance.now()<end){}
  });
  await page.locator('.orbit-stage[data-mode="preview"][data-phase="completed"]').waitFor();
  check(await page.getByLabel('示范进度 44 / 44',{exact:true}).isVisible(),'preview failed to traverse all targets');
  check(await page.evaluate(count=>window.previewSources.length===count,scheduled),'user taps or frames emitted extra audio');
  check(await page.locator('.orbit-overlay').count()===0,'preview displayed challenge success styling');
  check(await page.getByRole('button',{name:'开始游戏',exact:true}).isVisible(),'preview did not return challenge entry');
  await page.screenshot({path:'output/playwright/orbit-preview-finished.png',scale:'css'});

  // Stop a fresh preview before its first note; Esc also works with a toolbar button focused.
  await preview().click();await page.locator('[data-phase="count-in"]').waitFor();
  await stop().focus();await page.keyboard.press('Escape');await ready();await stopped();
  await preview().click();await page.locator('[data-phase="count-in"]').waitFor();await stop().click();await ready();await stopped();

  await page.goto(origin+'/game/eighth');await ready();await apply(240,1,2);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{document.documentElement.dataset.colorMode='light';});
  const firstSource=await page.evaluate(()=>window.previewSources.length);
  await preview().click();await page.locator('[data-mode="preview"][data-phase="count-in"]').waitFor();
  check(await page.evaluate(first=>{
    const context=window.previewContexts.at(-1),at=window.previewBoundaries.at(-1).at;
    const sources=window.previewSources.slice(first).filter(source=>source.output?.output?.output===context.destination);
    return sources.length===8&&sources.every((source,index)=>Math.abs(source.at-at-index*.125)<1e-8);
  },firstSource),'basic melody did not schedule eight pitched notes at selected BPM');
  await page.locator('.orbit-stage[data-mode="preview"][data-phase="completed"]').waitFor();
  check(await page.getByLabel('示范进度 8 / 8',{exact:true}).isVisible(),'ordinary partial preview incomplete');
  await page.getByRole('button',{name:'开始游戏',exact:true}).click();await page.locator('[data-mode="challenge"][data-phase="count-in"]').waitFor();
  await page.locator('[data-phase="failed"]').waitFor();
  check(await page.getByLabel('完成 0 / 8',{exact:true}).isVisible(),'preview changed strict challenge behavior or leaked auto hits');

  // Cancel while loading, then release the delayed response: old playback must not revive.
  await page.goto(origin+'/game/glimmer');await ready();
  await page.route('**/assets/game/shared/audio/piano-60.flac',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();},{times:1});
  await preview().click();await page.locator('[data-phase="loading"][data-mode="preview"]').waitFor();
  await stop().click();await ready();await page.waitForTimeout(750);
  check(await page.evaluate(()=>document.querySelector('.orbit-stage').dataset.phase==='ready'),'cancelled load restarted preview');
  await stopped();
  await preview().click();await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
  });
  check(await stop().isVisible(),'switching tabs stopped preview');
  await stop().click();await ready();await stopped();
  await preview().click();await page.locator('[data-phase="count-in"]').waitFor();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.waitForFunction(()=>window.previewContexts.every(context=>context.state==='closed'));await stopped();

  await page.goto(origin+'/game/glimmer');await ready();
  await page.route('**/assets/game/shared/audio/piano-60.flac',route=>route.fulfill({status:503,body:'test'}),{times:1});
  await preview().click();await page.getByRole('alert').filter({hasText:'音乐加载失败'}).waitFor();await ready();
  await preview().click();await page.locator('[data-mode="preview"][data-phase="count-in"]').waitFor();
  await stop().click();await ready();await stopped();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.waitForFunction(()=>window.previewContexts.every(context=>context.state==='closed'));
  check(errors.length===0,errors.join('\n'));
  return 'Music preview: exact 44-note schedule and local playback, selected range/BPM/pitches, no frame-based or manual extra notes, completion without challenge score, desktop/mobile HUD. Basic preview: eight pitched notes, sparse backing, reduced motion/light mode. Strict challenge unchanged. Stop/Esc, loading cancellation, hidden page, navigation cleanup and load-failure retry passed.';
}
