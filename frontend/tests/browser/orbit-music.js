// Isolated Vite origin; API mocked, real sample decoding, audio-clock scheduling and live audio.
async page=>{
  const origin=new URL(page.url()).origin,errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.includes('sessions')?[]:path.includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready',message:''}});
  });
  await page.addInitScript(()=>{
    window.musicSources=[];window.musicContexts=[];
    window.musicBoundaries=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.musicContexts.push(this);
        const record=this.createMediaStreamDestination(),create=this.createGain.bind(this),destination=this.destination;
        this.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...rest)=>{if(target===destination)connect(record);return connect(target,...rest);};return gain;};
        this.recorder=new MediaRecorder(record.stream);this.chunks=[];
        this.recorder.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};this.recorder.start();
      }
      createConstantSource(){const source=super.createConstantSource(),entry={ended:false},start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=at=>{entry.at=at;window.musicBoundaries.push(entry);return start(at);};
        source.stop=at=>{entry.end=at;return stop(at);};source.addEventListener('ended',()=>entry.ended=true);return source;}
      createBufferSource(){const source=super.createBufferSource(),entry={stopped:false,ended:false};const start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=(...args)=>{Object.assign(entry,{time:args[0],offset:args[1],duration:args[2],rate:source.playbackRate.value,buffer:source.buffer});window.musicSources.push(entry);return start(...args);};
        source.stop=(...args)=>{entry.stopped=true;return stop(...args);};source.addEventListener('ended',()=>{entry.ended=true;});return source;
      }
    };
  });
  const start=page.getByRole('button',{name:/^(开始游戏|我来试试)$/,exact:true});
  const settings=page.getByRole('button',{name:'练习设置',exact:true});
  const ready=()=>page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  const apply=async(bpm,first=0,last=16)=>{
    await settings.click();await page.getByRole('spinbutton',{name:'速度',exact:true}).fill(String(bpm));
    await page.getByLabel('起始小节',{exact:true}).selectOption(String(first));await page.getByLabel('结束小节',{exact:true}).selectOption(String(last));
    await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('dialog',{name:'练习设置',exact:true}).waitFor({state:'hidden'});await ready();
  };
  await page.goto(origin+'/game');await page.getByRole('link',{name:'开始微光',exact:true}).click();await ready();await apply(100);
  check(await page.getByLabel('完成 0 / 108',{exact:true}).isVisible(),'music level target count');
  for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await page.screenshot({path:`output/playwright/glimmer-ready-${width}.png`});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'music overflow');}
  await page.emulateMedia({colorScheme:'dark'});
  await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  check(await page.evaluate(()=>window.musicSources.length>4),'music should use scheduled accompaniment and four prep beats');
  const play=page.evaluate(async()=>{
    const {glimmer}=await import('/src/game-content/levels/glimmer/index.ts');
    const ctx=window.musicContexts.at(-1),first=window.musicBoundaries.at(-1).at,beat=60/100,targets=glimmer.music.melody.map(note=>note.beat);
    let index=0;await new Promise(resolve=>{
      const frame=()=>{
        if(ctx.currentTime<first)document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
        else if(ctx.currentTime>=first+targets[index]*beat+.008){document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));index++;}
        if(index===targets.length)resolve();else requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
    });
  });
  for(const hit of [8,16,17,24,56,96]){
    await page.waitForFunction(hit=>Number(document.querySelector('.orbit-progress').textContent.split('/')[0])>=hit,hit);
    check(await page.locator('.orbit-section').count()===0,'section label should be absent');
    await page.screenshot({path:`output/playwright/glimmer-playing-${hit}.png`});
  }
  await play;await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 108 / 108',{exact:true}).isVisible(),'music challenge failed');


  check(await page.evaluate(()=>new Set(window.musicSources.slice(5).map(source=>source.buffer)).size>4),'melody was a single pitch');

  await page.waitForFunction(()=>window.musicSources[0].ended);
  const recorded=await page.evaluate(async()=>{const ctx=window.musicContexts.at(-1);await new Promise(resolve=>{ctx.recorder.onstop=resolve;ctx.recorder.stop();});return URL.createObjectURL(new Blob(ctx.chunks,{type:ctx.recorder.mimeType}));});
  const download=page.waitForEvent('download');
  await page.evaluate(url=>{const link=document.createElement('a');link.href=url;link.download='glimmer-playthrough.webm';link.click();},recorded);
  await (await download).saveAs('output/playwright/glimmer-playthrough.webm');
  await page.getByRole('button',{name:'再来一次',exact:true}).click();await page.locator('[data-phase="failed"]').waitFor();
  await page.waitForTimeout(100);
  check(await page.evaluate(()=>window.musicSources.every(source=>source.stopped||source.ended)),'failure left music ringing');
  await apply(160,8,10);await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{window.musicSources=[];});await start.click();await page.locator('[data-phase="count-in"]').waitFor();
  check(await page.evaluate(()=>Math.abs(window.musicBoundaries.at(-1).end-window.musicBoundaries.at(-1).at-3)<1e-8),'partial music offset/duration');
  await page.keyboard.press('Escape');await start.waitFor();await page.waitForTimeout(100);
  check(await page.evaluate(()=>window.musicSources.every(source=>source.stopped||source.ended)),'Escape left music');
  await page.reload();await ready();await apply(101,0,16);
  await page.route('**/assets/game/shared/audio/piano-60.flac',route=>route.fulfill({status:503,body:'test'}),{times:1});
  await start.click();await page.getByRole('alert').filter({hasText:'音乐加载失败'}).waitFor();await start.waitFor();
  await start.click();await page.locator('[data-phase="count-in"]').waitFor();await page.keyboard.press('Escape');await start.waitFor();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();await page.waitForFunction(()=>window.musicContexts.every(context=>context.state==='closed'));
  check(errors.length===0,errors.join('\n'));
  return {result:'108-hit musical playthrough, pitched lead, section/camera screenshots, natural outro, failure/retry, BPM/range offset, Escape, reduced motion, load failure recovery and navigation cleanup passed'};
}
