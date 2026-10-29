// Isolated Vite origin; API mocked. Short challenge by default.
// Open ?validation=full-audio before running for the full song, screenshots and recording.
async page=>{
  const entry=new URL(page.url()),fullAudio=entry.searchParams.get('validation')==='full-audio';
  const origin=entry.origin,errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.includes('sessions')?[]:path.includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready',message:''}});
  });
  await page.addInitScript(({fullAudio})=>{
    window.musicSources=[];window.musicContexts=[];
    window.musicBoundaries=[];window.musicWorklets=[];
    const Worklet=window.AudioWorkletNode;
    window.AudioWorkletNode=class extends Worklet {constructor(...args){super(...args);const entry={destroyed:false};window.musicWorklets.push(entry);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(message,...rest)=>{if(message.type==='destroyWorklet')entry.destroyed=true;return post(message,...rest);};}};
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.musicContexts.push(this);
        if (fullAudio) {
          const record=this.createMediaStreamDestination(),create=this.createGain.bind(this),destination=this.destination;
          this.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>{if(target===destination)connect(record);return connect(target,...rest);};return gain;};
          this.recorder=new MediaRecorder(record.stream);this.chunks=[];
          this.recorder.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};this.recorder.start();
        }
      }
      createConstantSource(){const source=super.createConstantSource(),entry={ended:false},start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=at=>{entry.at=at;window.musicBoundaries.push(entry);return start(at);};
        source.stop=at=>{entry.end=at;return stop(at);};source.addEventListener('ended',()=>entry.ended=true);return source;}
      createBufferSource(){const source=super.createBufferSource(),entry={stopped:false,ended:false};const start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=(...args)=>{Object.assign(entry,{time:args[0],offset:args[1],duration:args[2],rate:source.playbackRate.value,buffer:source.buffer});window.musicSources.push(entry);return start(...args);};
        source.stop=(...args)=>{entry.stopped=true;return stop(...args);};source.addEventListener('ended',()=>{entry.ended=true;});return source;
      }
    };
  }, {fullAudio});
  const start=page.getByRole('button',{name:/^(开始游戏|我来试试)$/,exact:true});
  const settings=page.getByRole('button',{name:'练习设置',exact:true});
  const ready=()=>page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  const apply=async(bpm,first=0,last=16)=>{
    await settings.click();await page.getByRole('spinbutton',{name:'速度',exact:true}).fill(String(bpm));
    await page.getByLabel('起始小节',{exact:true}).selectOption(String(first));await page.getByLabel('结束小节',{exact:true}).selectOption(String(last));
    await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('dialog',{name:'练习设置',exact:true}).waitFor({state:'hidden'});await ready();
  };
  await page.goto(origin+'/game');await page.getByRole('link',{name:'开始微光',exact:true}).click();await ready();await apply(fullAudio?100:160,fullAudio?0:8,fullAudio?16:10);
  check(await page.getByLabel(fullAudio?'完成 0 / 108':'完成 0 / 24',{exact:true}).isVisible(),'music level target count');
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`output/playwright/glimmer-ready-${width}.png`});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'music overflow');}
  await page.emulateMedia({colorScheme:'dark'});
  await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  check(await page.evaluate(()=>window.musicSources.length===4),'music should retain four prep beats');
  const play=page.evaluate(async({fullAudio})=>{
    const {glimmer}=await import('/src/game-content/levels/glimmer/index.ts');
    const {compileMultipartScore}=await import('/src/game/core/MultipartScore.ts');
    const ctx=window.musicContexts.at(-1),first=window.musicBoundaries.at(-1).at,beat=60/(fullAudio?100:160),targets=compileMultipartScore(glimmer.music).hits.filter(note=>fullAudio||(note.beat>=32&&note.beat<40)).map(note=>note.beat-(fullAudio?0:32));
    let index=0;await new Promise(resolve=>{
      const frame=()=>{
        if(ctx.currentTime<first)document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
        else if(ctx.currentTime>=first+targets[index]*beat+.008){document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));index++;}
        if(index===targets.length)resolve();else requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
    });
  },{fullAudio});
  if (fullAudio) for(const hit of [8,16,17,24,56,96]){
    await page.waitForFunction(hit=>Number(document.querySelector('.orbit-progress').textContent.split('/')[0])>=hit,hit);
    check(await page.locator('.orbit-section').count()===0,'section label should be absent');
    await page.screenshot({path:`output/playwright/glimmer-playing-${hit}.png`});
  }
  await play;await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel(fullAudio?'完成 108 / 108':'完成 24 / 24',{exact:true}).isVisible(),'music challenge failed');

  // The result halo must stay within the viewport, including on narrow screens.
  for (const width of [390, 680, 681, 1440]) {
    await page.setViewportSize({width,height:1000});
    await page.getByRole('heading',{name:'完成',exact:true}).waitFor();
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'completion halo causes horizontal overflow');
  }


  if (fullAudio) {
    await page.waitForFunction(()=>window.musicSources[0].ended);
    const recorded=await page.evaluate(async()=>{const ctx=window.musicContexts.at(-1);await new Promise(resolve=>{ctx.recorder.onstop=resolve;ctx.recorder.stop();});return URL.createObjectURL(new Blob(ctx.chunks,{type:ctx.recorder.mimeType}));});
    const download=page.waitForEvent('download');
    await page.evaluate(url=>{const link=document.createElement('a');link.href=url;link.download='glimmer-playthrough.webm';link.click();},recorded);
    await (await download).saveAs('output/playwright/glimmer-playthrough.webm');
  }
  await page.getByRole('button',{name:'再来一次',exact:true}).click();await page.locator('[data-phase="failed"]').waitFor();
  await page.waitForTimeout(100);
  check(await page.evaluate(()=>window.musicSources.every(source=>source.stopped||source.ended)&&window.musicWorklets.every(w=>w.destroyed)),'failure left music ringing');
  await apply(160,8,10);await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{window.musicSources=[];});await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  check(await page.evaluate(()=>Math.abs(window.musicBoundaries.at(-1).end-window.musicBoundaries.at(-1).at-3)<1e-8),'partial music offset/duration');
  await page.keyboard.press('Escape');await start.waitFor();await page.waitForTimeout(100);
  check(await page.evaluate(()=>window.musicSources.every(source=>source.stopped||source.ended)&&window.musicWorklets.every(w=>w.destroyed)),'Escape left music');
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  check(errors.length===0,errors.join('\n'));
  return {fullAudio, result:'Pitched musical challenge, completion, failure/retry, BPM/range offset, Escape passed; GS loading/retry/navigation disposal are covered by generaluser-gs.js'};
}
