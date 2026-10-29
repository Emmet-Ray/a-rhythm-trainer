// Isolated Vite origin, mocked API; real music clock, samples, keyboard/pointer events.
async page=>{
  const origin=new URL(page.url()).origin,errors=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.includes('sessions')?[]:path.includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready',message:''}});
  });
  await page.addInitScript(()=>{
    window.earlyContexts=[];window.earlySources=[];window.earlyBoundaries=[];window.earlyNotes=0;
    const Worklet=window.AudioWorkletNode;
    window.AudioWorkletNode=class extends Worklet {constructor(...args){super(...args);const post=this.port.postMessage.bind(this.port);this.port.postMessage=(message,...rest)=>{if(message.type==='midiMessage'&&(message.data.messageData[0]&240)===144&&message.data.messageData[2]>0)window.earlyNotes++;return post(message,...rest);};}};
    const Native=window.AudioContext;
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.earlyContexts.push(this);}
      createConstantSource(){const s=super.createConstantSource(),start=s.start.bind(s);s.start=at=>{window.earlyBoundaries.push(at);return start(at);};return s;}
      createBufferSource(){
        const source=super.createBufferSource(),entry={ended:false,stopped:false};
        const start=source.start.bind(source),stop=source.stop.bind(source);
        source.start=(...args)=>{entry.at=args[0];window.earlySources.push(entry);return start(...args);};
        source.stop=(...args)=>{entry.stopped=true;return stop(...args);};
        source.addEventListener('ended',()=>entry.ended=true);return source;
      }
    };
  });
  const ready=()=>page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  const stopped=()=>page.waitForFunction(()=>window.earlySources.every(source=>source.stopped||source.ended));
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/game/glimmer');await ready();
  await page.getByRole('button',{name:'练习设置',exact:true}).click();
  await page.getByRole('spinbutton',{name:'速度',exact:true}).fill('60');
  await page.getByLabel('起始小节',{exact:true}).selectOption('0');await page.getByLabel('结束小节',{exact:true}).selectOption('1');
  await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await ready();
  const begin=async label=>{
    await page.evaluate(()=>{window.earlyRunStart=window.earlyNotes;});
    await page.getByRole('button',{name:label,exact:true}).click();await page.locator('[data-phase="count-in"]').waitFor();
    check(await page.locator('.orbit-early-count').count()===0,'old target counter survived restart');
  };
  const tap=async(offset,pointer=false)=>{
    await page.evaluate(async({offset,pointer})=>{
      const context=window.earlyContexts.at(-1),first=window.earlyBoundaries.at(-1);
      const key=()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
      await new Promise(resolve=>{
        const frame=()=>{
          if(context.currentTime<first)key(); // Ignored prep input keeps event/audio clocks sampled.
          if(context.currentTime>=first+offset)resolve();else requestAnimationFrame(frame);
        };requestAnimationFrame(frame);
      });
      if(pointer)document.querySelector('.orbit-stage').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));else key();
      await new Promise(resolve=>requestAnimationFrame(resolve));
    },{offset,pointer});
  };
  const sounds=()=>page.evaluate(()=>window.earlyNotes-window.earlyRunStart);
  const hits=number=>page.getByLabel(`完成 ${number} / 4`,{exact:true}).waitFor();
  const counter=number=>page.getByRole('status').filter({hasText:`本目标提前误敲 ${number} / 3`}).waitFor();
  await begin('开始游戏');await tap(.015);await hits(1);
  const firstSounds=await sounds();
  for(let count=1;count<=3;count++){
    await tap(count*.1,count%2===1);await counter(count);await hits(1);
    check(await sounds()===firstSounds,'early input played a melody voice');
    check(await page.locator('[data-phase="playing"]').count()===1,'three early taps ended the game');
  }
  for(const width of [1440,342]){
    await page.setViewportSize({width,height:1000});
    check(await page.evaluate(()=>{
      return !!document.querySelector('.orbit-early-count').closest('.sr-only')&&document.documentElement.scrollWidth<=innerWidth;
    }),'counter is visible or causes overflow');
    await page.screenshot({path:`output/playwright/orbit-early-${width}.png`,scale:'css'});
  }
  await tap(1.015);await hits(2);
  check(await page.locator('.orbit-early-count').count()===0,'successful target did not reset its counter');
  check(await sounds()===firstSounds+1,'valid second target did not play its melody');
  for(let count=1;count<=3;count++){
    await tap(1+count*.1,count%2===0);await counter(count);await hits(2);
    check(await sounds()===firstSounds+1,'next target early taps changed the melody');
  }
  await tap(1.4,true);await page.getByRole('heading',{name:'提前误敲过多',exact:true}).waitFor();await hits(2);
  check(await sounds()===firstSounds+1,'fourth early input played audio');await stopped();
  await page.screenshot({path:'output/playwright/orbit-early-fourth.png',scale:'css'});

  // A fresh target still expires at its original deadline after three tolerated inputs.
  await begin('再试一次');await tap(.015);await hits(1);
  for(let count=1;count<=3;count++){await tap(count*.1);await counter(count);}
  await page.getByRole('heading',{name:'错过了这一拍',exact:true}).waitFor();await hits(1);
  check(await sounds()===firstSounds,'missed target was automatically played');await stopped();
  await page.screenshot({path:'output/playwright/orbit-early-missed.png',scale:'css'});

  // Preview remains automatic and never inherits a target's premature-input count.
  await page.getByRole('button',{name:'看示范',exact:true}).click();await page.locator('[data-mode="preview"][data-phase="count-in"]').waitFor();
  check(await page.locator('.orbit-early-count').count()===0,'preview inherited a challenge counter');
  await page.locator('.orbit-stage[data-mode="preview"][data-phase="completed"]').waitFor();
  check(await page.getByLabel('示范进度 4 / 4',{exact:true}).isVisible(),'preview did not finish');
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.waitForFunction(()=>window.earlyContexts.every(context=>context.state==='closed'));
  check(errors.length===0,errors.join('\n'));
  return 'Per-target early tolerance: three silent keyboard/pointer errors, normal music and hit progression, per-target reset, fourth error ends without sound, no lifetime error budget, original miss deadline, retry reset, automatic preview and audio disposal; desktop/342px counter layout passed.';
}
