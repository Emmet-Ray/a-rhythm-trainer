// Run on an isolated Vite origin. All API requests mocked; real Web Audio.
async page => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const path = new URL(route.request().url()).pathname;
    let json = { status: 'unavailable' };
    if (path.includes('model-connections')) json = { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } };
    if (path.includes('/custom-exercises/')) json = { id: 'feedback', name: '尾音测试', mode: 'tapping', created_at: '2026-10-13T00:00:00Z', exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: Array.from({length:4}, () => ({ elements: Array.from({length:4}, () => ({kind:'note',noteValue:'quarter'})) })) } };
    if (path.endsWith('/lookup')) json = null;
    if (path.endsWith('/records')) json = {id:'test'};
    return route.fulfill({json});
  });
  await page.addInitScript(() => {
    if (window.feedbackSources) return;
    window.feedbackSources = []; window.feedbackContexts = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.feedbackContexts.push(this); }
      createBufferSource() {
        const source = super.createBufferSource();
        const entry = {stops:[]};
        const start = source.start.bind(source), stop = source.stop.bind(source);
        source.start = (...args) => { entry.start = args; window.feedbackSources.push(entry); return start(...args); };
        source.stop = (...args) => { entry.stops.push(args); return stop(...args); };
        return source;
      }
    };
  });
  await page.goto(origin + '/custom/tapping/feedback');
  const start = page.getByRole('button',{name:'击拍练习',exact:true});
  await start.waitFor();
  await page.getByRole('spinbutton').fill('240');
  await page.getByRole('spinbutton').blur();
  await start.click();
  await page.getByRole('button',{name:'停止',exact:true}).waitFor();
  await page.waitForTimeout(1800);
  for(let i=0;i<5;i++) { await page.keyboard.press('Space'); await page.waitForTimeout(70); }
  const taps = await page.evaluate(() => window.feedbackSources.filter(s=>s.start[2]===2));
  if(taps.length!==5) throw Error('formal tapping not using two-second tails: '+taps.length);
  if(taps[0].stops.length!==1 || taps.slice(1).some(s=>s.stops.length)) throw Error('not four-voice overlap');
  await page.getByRole('button',{name:'停止',exact:true}).click();
  if(await page.evaluate(()=>window.feedbackSources.filter(s=>s.start[2]===2).some(s=>!s.stops.length))) throw Error('stop left tails');
  await start.click();
  await page.getByRole('button',{name:'停止',exact:true}).waitFor();
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.getByRole('spinbutton').fill('200');
  await page.getByRole('spinbutton').blur();
  await page.waitForFunction(()=>window.feedbackContexts.every(c=>c.state==='closed'));
  // Separate navigation cleanup from the configuration-change scenario.
  await page.reload();
  await start.waitFor();
  await start.click();
  await page.getByRole('button',{name:'停止',exact:true}).waitFor();
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.locator('.site-sidebar a[href="/practice"]').click();
  await page.locator('.practice-hub').waitFor();
  await page.waitForFunction(()=>window.feedbackContexts.every(c=>c.state==='closed'));
  return 'formal B playback, fifth tap steals oldest, stop, configuration change and navigation cleanup passed';
}
