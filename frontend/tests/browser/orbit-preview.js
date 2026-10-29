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
    window.previewContexts=[];window.previewSources=[];window.previewBoundaries=[];window.previewNotes=0;window.previewWorklets=[];
    const Worklet=window.AudioWorkletNode;
    window.AudioWorkletNode=class extends Worklet {constructor(...args){super(...args);const entry={destroyed:false};window.previewWorklets.push(entry);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(message,...rest)=>{if(message.type==='destroyWorklet')entry.destroyed=true;if(message.type==='midiMessage'&&(message.data.messageData[0]&240)===144&&message.data.messageData[2]>0)window.previewNotes++;return post(message,...rest);};}};
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
  const stopped=()=>page.waitForFunction(()=>window.previewSources.every(source=>source.stopped||source.ended)&&window.previewWorklets.every(w=>w.destroyed));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/game/glimmer');await ready();await apply(160,8,12);
  await preview().click();await page.locator('[data-mode="preview"][data-phase="count-in"]').waitFor();
  check(await page.getByRole('button',{name:'练习设置',exact:true}).isDisabled(),'settings active during preview');
  const scheduled=await page.evaluate(async()=>{
    const {glimmer}=await import('/src/game-content/levels/glimmer/index.ts');
    const {compileMultipartScore}=await import('/src/game/core/MultipartScore.ts');
    const count=compileMultipartScore(glimmer.music).notes.filter(n=>n.beat<48&&n.beat+n.duration>32).length;
    if(window.previewNotes!==count)throw Error('Preview did not schedule every selected note exactly once');
    const backing=window.previewBoundaries.at(-1);
    if(Math.abs(backing.end-backing.at-6)>1e-8)throw Error('Wrong selected music slice');
    document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));
    document.querySelector('.orbit-stage').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));
    return window.previewNotes;
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
  check(await page.evaluate(count=>window.previewNotes===count,scheduled),'user taps or frames emitted extra audio');
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
  await preview().click();await page.locator('[data-mode="preview"][data-phase="count-in"]').waitFor();
  check(await page.evaluate(()=>Math.abs(window.previewBoundaries.at(-1).end-window.previewBoundaries.at(-1).at-1)<1e-8),'basic preview duration at selected BPM');
  await page.locator('.orbit-stage[data-mode="preview"][data-phase="completed"]').waitFor();
  check(await page.getByLabel('示范进度 8 / 8',{exact:true}).isVisible(),'ordinary partial preview incomplete');
  await page.getByRole('button',{name:'开始游戏',exact:true}).click();await page.locator('[data-mode="challenge"][data-phase="count-in"]').waitFor();
  await page.locator('[data-phase="failed"]').waitFor();
  check(await page.getByLabel('完成 0 / 8',{exact:true}).isVisible(),'preview changed strict challenge behavior or leaked auto hits');

  // Hiding the tab must not cancel an automatic demonstration.
  await page.goto(origin+'/game/glimmer');await ready();
  await preview().click();await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
  });
  check(await stop().isVisible(),'switching tabs stopped preview');
  await stop().click();await ready();await stopped();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  check(errors.length===0,errors.join('\n'));
  return 'Music preview: 44-target traversal and local playback, selected range/BPM, frame stalls and manual taps do not change traversal, completion without challenge score, desktop/mobile HUD. Basic preview: eight targets, sparse backing, reduced motion/light mode. Strict challenge unchanged. Preview Stop/Esc controls and hidden-page continuation passed. GS loading/retry/disposal are covered by generaluser-gs.js.';
}
