// Run on an isolated Vite origin. API mocked; real audio and Phaser rendering.
async page => {
  const origin = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const setTempo=async bpm=>{
    await page.getByRole('button',{name:'练习设置',exact:true}).click();
    await page.getByRole('spinbutton',{name:'速度',exact:true}).fill(String(bpm));
    await page.getByRole('button',{name:'应用设置',exact:true}).click();
    await page.getByRole('dialog',{name:'练习设置',exact:true}).waitFor({state:'hidden'});
  };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    let json = { status: 'ready', message: '' };
    if (path.includes('model-connections')) json = { provider: 'deepseek', deepseek: { configured: true, models: ['deepseek-chat'] }, chatgpt: { configured: false, models: [] } };
    if (path.includes('sessions')) json = [];
    return route.fulfill({json});
  });
  await page.addInitScript(() => {
    if (window.orbitContexts) return;
    window.orbitContexts = []; window.orbitSources = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.orbitContexts.push(this); }
      createBufferSource() {
        const source = super.createBufferSource();
        const entry = { stopped: false, ended: false };
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args) => { entry.time = args[0]; window.orbitSources.push(entry); return start(...args); };
        source.stop = (...args) => { entry.stopped = true; return stop(...args); };
        source.addEventListener('ended', () => { entry.ended = true; });
        return source;
      }
    };
  });
  // Headless audio/performance clocks can drift during an idle count-in. Sample
  // timestamped, ignored preparation input, as the range/music regressions do.
  await page.addInitScript(() => {
    const prepare = () => {
      const context = window.orbitContexts?.at(-1), first = window.orbitSources?.[4]?.time;
      if (document.querySelector('.orbit-stage[data-phase="count-in"]') && context?.state === 'running' && context.currentTime < first) {
        document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',bubbles:true}));
      }
      requestAnimationFrame(prepare);
    };
    requestAnimationFrame(prepare);
  });
  const gameRequests = [];
  page.on('request', request => { if (/OrbitGame\.ts|deps\/phaser/.test(request.url())) gameRequests.push(request.url()); });
  await page.goto(origin + '/game');
  await page.getByRole('button',{name:/基础节奏/}).click();
  await page.getByRole('link', {name:'开始均匀四分',exact:true}).waitFor();
  check(await page.locator('.orbit-canvas canvas').count() === 0, 'list created a game canvas');
  check(gameRequests.length === 0, 'list loaded Phaser');
  await page.screenshot({path:'output/playwright/game-levels.png'});
  await page.getByRole('link', {name:'开始均匀四分',exact:true}).click();
  check(new URL(page.url()).pathname === '/game/quarter', 'wrong challenge URL');
  const start = page.getByRole('button', {name:'开始游戏', exact:true});
  await start.waitFor();
  check(await page.getByRole('link', {name:'节奏游戏',exact:true}).getAttribute('aria-current') === 'location', 'game nav not selected in challenge');
  await page.waitForFunction(() => !document.querySelector('.orbit-start').disabled);
  check(await page.locator('.orbit-canvas canvas').count() === 1, 'missing Phaser canvas');
  check(!await page.getByRole('button', {name:'打开 AI 助手', exact:true}).isVisible(), 'assistant obscures game');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/orbit-ready.png'});
  // Make the complete play-through short enough for a browser regression.
  await setTempo(240);
  await page.keyboard.press('Tab');
  await start.focus();
  check(await start.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'keyboard button focus must remain visible');
  await start.click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.keyboard.press('Space');
  check(await page.locator('.orbit-stage').evaluate(el => getComputedStyle(el).outlineStyle === 'none'), 'game tap showed stage outline'); // Count-in input is ignored.
  await page.locator('[data-phase="failed"]').waitFor();
  check(await page.getByRole('heading', {name:'错过了这一拍'}).isVisible(), 'missing immediate failure');
  check(await page.evaluate(() => window.orbitSources.every(s => s.stopped || s.ended)), 'failure left audio running');
  await page.screenshot({path:'output/playwright/orbit-failed.png'});
  await page.evaluate(() => { window.orbitSources = []; });
  await page.getByRole('button', {name:'再试一次', exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  // Dispatch timestamped browser input at the actual audio targets; this does not
  // modify game state or substitute the production audio clock.
  await page.evaluate(async () => {
    const times = window.orbitSources.slice(4).map(s => s.time);
    if (times.length !== 16) throw Error('expected 4 count-in + 16 targets');
    const context = window.orbitContexts.at(-1);
    const stage = document.querySelector('.orbit-stage');
    document.activeElement.blur();
    let index = 0;
    await new Promise(resolve => {
      const frame = () => {
        if (index < times.length && context.currentTime >= times[index] + .015) {
          // First hits come from body after focus is lost; later hits come from main.
          if (index === 4) document.querySelector('#main-content').focus();
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',bubbles:true}));
          // Held keys must not count as an extra tap.
          stage.dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',repeat:true,bubbles:true}));
          index++;
        }
        if (index === times.length) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  });
  await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 16 / 16', {exact:true}).isVisible(), '16 hits did not complete');
  check(await page.locator('.orbit-stage').evaluate(el => getComputedStyle(el).outlineStyle === 'none'), 'completion left stage outline');
  await page.screenshot({path:'output/playwright/orbit-completed.png'});
  await page.getByRole('button', {name:'再来一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.keyboard.press('Escape');
  await start.waitFor();
  // A real mouse click after a hit is tolerated; leaving the target unhit still expires it.
  await page.evaluate(() => { window.orbitSources = []; });
  await start.click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(async () => {
    const first = window.orbitSources[4].time;
    const context = window.orbitContexts.at(-1);
    await new Promise(resolve => {
      const frame = () => context.currentTime >= first + .01 ? resolve() : requestAnimationFrame(frame);
      requestAnimationFrame(frame);
    });
    document.activeElement.blur();
  });
  await page.keyboard.press('Space');
  await page.getByRole('region', {name:'节奏游戏区域',exact:true}).click({position:{x:40,y:160}});
  check(await page.getByLabel('完成 1 / 16',{exact:true}).isVisible(),'premature pointer input advanced the target');
  check(await page.locator('.orbit-early-count').textContent()==='本目标提前误敲 1 / 3','premature pointer input was not tolerated');
  await page.getByRole('heading',{name:'错过了这一拍',exact:true}).waitFor();
  await page.getByRole('button', {name:'再试一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.getByRole('link', {name:'关卡列表',exact:true}).click();
  await page.getByRole('link', {name:'开始均匀四分',exact:true}).waitFor();
  await page.waitForFunction(() => window.orbitContexts.every(c => c.state === 'closed'));
  check(await page.locator('.orbit-canvas canvas').count() === 0, 'old canvas retained');
  await page.getByRole('link', {name:'开始均匀四分',exact:true}).click();
  await start.waitFor();
  await page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
  check(await page.locator('.orbit-canvas canvas').count() === 1, 're-entry duplicated canvas');
  for (const width of [390, 1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    check(await start.isVisible(), 'start not visible');
    await page.screenshot({path:`output/playwright/orbit-${width}.png`});
  }
  await page.goto(origin + '/game/unknown');
  await page.getByRole('heading', {name:'未找到该关卡',exact:true}).waitFor();
  check(await page.locator('.orbit-canvas canvas').count() === 0, 'unknown level mounted game');
  await page.getByRole('link', {name:'关卡列表',exact:true}).click();
  await page.getByRole('link', {name:'开始均匀四分',exact:true}).waitFor();
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'list overflow');
    await page.screenshot({path:`output/playwright/game-levels-${width}.png`});
  }
  await page.getByRole('link', {name:'开始二平均',exact:true}).click();
  await start.waitFor();
  await page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
  check(await page.getByLabel('完成 0 / 32', {exact:true}).isVisible(), 'second level uses wrong count');
  await page.evaluate(() => { window.orbitSources = []; });
  await start.click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(async () => {
    const first = window.orbitSources[4].time;
    const beat = window.orbitSources[5].time - first;
    const context = window.orbitContexts.at(-1);
    let index = 0;
    await new Promise(resolve => {
      const frame = () => {
        if (context.currentTime >= first + index * beat / 2 + .01) {
          document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',bubbles:true}));
          index++;
        }
        if (index === 32) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  });
  await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 32 / 32', {exact:true}).isVisible(), 'second level did not complete');
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'eighth overflow');
    await page.screenshot({path:`output/playwright/eighth-${width}.png`});
  }
  await page.getByRole('button', {name:'再来一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.getByRole('link', {name:'关卡列表',exact:true}).click();
  await page.getByRole('link', {name:'开始二平均',exact:true}).waitFor();
  await page.waitForFunction(() => window.orbitContexts.every(c => c.state === 'closed'));
  await page.getByRole('link', {name:'开始四分与二平均混合',exact:true}).click();
  await start.waitFor();
  await page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
  check(await page.getByLabel('完成 0 / 24', {exact:true}).isVisible(), 'third level uses wrong count');
  await setTempo(240);
  for (const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mixed overflow');
    await page.screenshot({path:`output/playwright/mixed-${width}.png`});
  }
  await page.evaluate(() => { window.orbitSources = []; });
  await start.click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(async () => {
    const beats = [0,1,2,3,4,4.5,5,5.5,6,6.5,7,7.5,8,9,9.5,10,11,11.5,12,12.5,13,14,14.5,15];
    const first = window.orbitSources[4].time;
    const beat = window.orbitSources[5].time-first;
    const context = window.orbitContexts.at(-1);
    let index = 0;
    await new Promise(resolve => {
      const frame = () => {
        if (context.currentTime >= first+beats[index]*beat+.01) {
          document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',bubbles:true}));
          index++;
        }
        if (index===beats.length) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  });
  await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 24 / 24', {exact:true}).isVisible(), 'mixed rhythm did not complete');
  await page.screenshot({path:'output/playwright/mixed-completed.png'});
  await page.getByRole('button', {name:'再来一次',exact:true}).click();
  await page.locator('[data-phase="failed"]').waitFor();
  await page.getByRole('button', {name:'再试一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.getByRole('link', {name:'关卡列表',exact:true}).click();
  await page.getByRole('link', {name:'开始四分与二平均混合',exact:true}).waitFor();
  await page.waitForFunction(() => window.orbitContexts.every(c => c.state === 'closed'));
  await page.getByRole('link', {name:'开始四平均',exact:true}).click();
  await start.waitFor();
  await page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
  check(await page.getByLabel('完成 0 / 32', {exact:true}).isVisible(), 'fourth level uses wrong count');
  await setTempo(120);
  await page.evaluate(()=>{document.documentElement.dataset.theme='teal';document.documentElement.dataset.colorMode='dark';});
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sixteenth overflow');
    await page.screenshot({path:`output/playwright/sixteenth-${width}.png`});
  }
  await page.evaluate(()=>{window.orbitSources=[];});
  await start.click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(async()=>{
    const first=window.orbitSources[4].time,beat=window.orbitSources[5].time-first,context=window.orbitContexts.at(-1);
    if(window.orbitSources.length!==12)throw Error('expected 4 count-in + 8 quarter beats');
    let index=0;
    await new Promise(resolve=>{
      const frame=()=>{
        if(context.currentTime>=first+index*beat/4+.005) {
          document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
          index++;
        }
        if(index===32)resolve();else requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
    });
  });
  await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 32 / 32',{exact:true}).isVisible(),'four average did not complete');
  await page.screenshot({path:'output/playwright/sixteenth-completed.png'});
  await page.evaluate(()=>{window.orbitSources=[];});
  await page.getByRole('button',{name:'再来一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(async()=>{
    const first=window.orbitSources[4].time,context=window.orbitContexts.at(-1);
    await new Promise(resolve=>{const frame=()=>context.currentTime>=first+.005?resolve():requestAnimationFrame(frame);requestAnimationFrame(frame);});
    const stage=document.querySelector('.orbit-stage');
    for(let count=0;count<5;count++)stage.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
  });
  await page.locator('[data-phase="failed"]').waitFor();
  check(await page.getByLabel('完成 1 / 32',{exact:true}).isVisible(),'rapid extra tap counted as next target');
  check(await page.evaluate(()=>window.orbitSources.every(s=>s.stopped||s.ended)),'rapid extra tap left audio running');
  await page.getByRole('button',{name:'再试一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.keyboard.press('Escape');
  await start.waitFor();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.getByRole('link',{name:'开始四平均',exact:true}).waitFor();
  await page.waitForFunction(()=>window.orbitContexts.every(c=>c.state==='closed'));
  await page.getByRole('link',{name:'开始二平均与四平均混合',exact:true}).click();
  await start.waitFor();
  await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  check(await page.getByLabel('完成 0 / 24',{exact:true}).isVisible(),'fifth level uses wrong count');
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:900});
    await page.waitForTimeout(100);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'eighth-sixteenth overflow');
    await page.screenshot({path:`output/playwright/eighth-sixteenth-${width}.png`});
  }
  await page.evaluate(()=>{window.orbitSources=[];});
  await start.click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.evaluate(async()=>{
    const beats=[0,.5,1,1.25,1.5,1.75,2,2.5,3,3.25,3.5,3.75,4,4.25,4.5,4.75,5,5.5,6,6.25,6.5,6.75,7,7.5];
    const first=window.orbitSources[4].time,beat=window.orbitSources[5].time-first,context=window.orbitContexts.at(-1);
    let index=0;
    await new Promise(resolve=>{
      const frame=()=>{
        if(context.currentTime>=first+beats[index]*beat+.005) {
          document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
          index++;
        }
        if(index===beats.length)resolve();else requestAnimationFrame(frame);
      };requestAnimationFrame(frame);
    });
  });
  await page.locator('[data-phase="completed"]').waitFor();
  check(await page.getByLabel('完成 24 / 24',{exact:true}).isVisible(),'fifth level did not complete');
  await page.getByRole('button',{name:'再来一次',exact:true}).click();
  await page.locator('[data-phase="failed"]').waitFor();
  await page.getByRole('button',{name:'再试一次',exact:true}).click();
  await page.locator('[data-phase="count-in"]').waitFor();
  await page.keyboard.press('Escape');
  await start.waitFor();
  await page.getByRole('link',{name:'关卡列表',exact:true}).click();
  await page.getByRole('link',{name:'开始二平均与四平均混合',exact:true}).waitFor();
  await page.waitForFunction(()=>window.orbitContexts.every(c=>c.state==='closed'));
  const q=[0],e=[0,.5],s=[0,.25,.5,.75],front=[0,.5,.75],back=[0,.25,.5];
  const dot=[0,.75],reverse=[0,.25],sync=[0,.25,.75],triplet=[0,1/3,2/3];
  for(const [id,title,offsets] of [
    ['eighth-sixteenths','前八后十六',[0,.5,.75]],
    ['sixteenths-eighth','前十六后八',[0,.25,.5]],
    ['dotted-eighth','小附点',[0,.75]],
    ['reverse-dotted-eighth','反小附点',[0,.25]],
    ['small-syncopation','小切分',[0,.25,.75]],
    ['triplet','三连音',[0,1/3,2/3]],
    ['eighth-triplet','二平均与三连音混合',[[0,.5],[0,1/3,2/3],[0,.5],[0,1/3,2/3],
      [0,1/3,2/3],[0,.5],[0,1/3,2/3],[0,.5]]],
    ['comprehensive','综合挑战',[q,q,e,e, e,e,s,s, front,front,back,back, front,back,front,back,
      dot,dot,reverse,reverse, sync,sync,dot,reverse, e,triplet,e,triplet, triplet,e,q,q]],
  ]) {
    const beats=Array.isArray(offsets[0])?offsets:Array.from({length:8},()=>offsets);
    const targets=beats.flatMap((offsets,beat)=>offsets.map(offset=>beat+offset));
    const count=targets.length;
    await page.getByRole('link',{name:`开始${title}`,exact:true}).click();
    await start.waitFor();
    await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
    check(await page.getByLabel(`完成 0 / ${count}`,{exact:true}).isVisible(),`${id} target count`);
    for(const width of [390,1440]) {
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(100);
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id} overflow`);
      await page.screenshot({path:`output/playwright/${id}-${width}.png`});
    }
    await page.evaluate(()=>{window.orbitSources=[];});
    await start.click();
    await page.locator('[data-phase="count-in"]').waitFor();
    const playthrough=page.evaluate(async(targets)=>{
      const first=window.orbitSources[4].time,beat=window.orbitSources[5].time-first,context=window.orbitContexts.at(-1);
      let index=0;
      await new Promise(resolve=>{
        const frame=()=>{
          if(context.currentTime>=first+targets[index]*beat+.005) {
            document.querySelector('.orbit-stage').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
            index++;
          }
          if(index===targets.length)resolve();else requestAnimationFrame(frame);
        };requestAnimationFrame(frame);
      });
    },targets);
    if(id==='comprehensive') {
      for(const hit of [20,45,65]) {
        await page.waitForFunction(hit=>Number(document.querySelector('.orbit-progress')?.textContent.split('/')[0])>=hit,hit);
        await page.screenshot({path:`output/playwright/comprehensive-playing-${hit}.png`});
      }
    }
    await playthrough;
    await page.locator('[data-phase="completed"]').waitFor();
    check(await page.getByLabel(`完成 ${count} / ${count}`,{exact:true}).isVisible(),`${id} did not complete`);
    await page.getByRole('button',{name:'再来一次',exact:true}).click();
    await page.locator('[data-phase="failed"]').waitFor();
    check(await page.evaluate(()=>window.orbitSources.every(s=>s.stopped||s.ended)),`${id} failure audio`);
    await page.getByRole('button',{name:'再试一次',exact:true}).click();
    await page.locator('[data-phase="count-in"]').waitFor();
    await page.keyboard.press('Escape');
    await start.waitFor();
    await page.getByRole('link',{name:'关卡列表',exact:true}).click();
    await page.getByRole('link',{name:`开始${title}`,exact:true}).waitFor();
    await page.waitForFunction(()=>window.orbitContexts.every(c=>c.state==='closed'));
  }
  check(errors.length === 0, errors.join('\n'));
  return 'Phaser canvas, ignored count-in/held inputs, immediate failure, 16 hits, retry, Escape, pointer input, navigation audio cleanup, 32 eighth hits, 24 mixed hits, 32 sixteenth hits, dense extra tap rejection, 24 eighth-sixteenth hits, five uneven rhythm levels, 24 triplet hits, 20 eighth-triplet hits, 77 comprehensive hits and responsive layout passed';
}
