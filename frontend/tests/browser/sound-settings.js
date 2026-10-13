// Run against an isolated Vite origin; all API traffic is mocked.
async page => {
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({
    json: route.request().url().includes('model-connections')
      ? { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } }
      : { status: 'unavailable' },
  }));
  await page.addInitScript(() => {
    if (window.soundContexts) return;
    window.soundContexts = [];
    window.soundTimes = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.soundContexts.push(this); }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => { window.soundStarts = (window.soundStarts || 0) + 1; window.soundTimes.push(args[0]); return start(...args); };
        return source;
      }
    };
  });
  await page.goto(origin + '/settings?category=sound');
  async function choose(group, name) {
    await page.getByRole('combobox', {name:group, exact:true}).click();
    await page.getByRole('option', {name, exact:true}).click();
  }
  if(await page.evaluate(() => window.soundStarts || 0)) throw Error('played on entry');
  for (const [name, group] of [
    ['钢琴', '练习音色'], ['吉他', '练习音色'], ['吉他', '练习音色'],
    ...['机械声', '牛铃', '响棒', '闭镲', '铃音', '电子短音'].map(name => [name, '节拍器音色']),
  ]) {
    const before = await page.evaluate(() => window.soundStarts || 0);
    await choose(group, name);
    await page.waitForFunction(count => window.soundStarts >= count + 4, before);
    const times = await page.evaluate(() => window.soundTimes.slice(-4));
    if(times.some((t,i) => Math.abs(t-times[0]-i)>0.001)) throw Error('not four beats at 60 BPM');
    if(await page.evaluate(() => window.soundContexts.filter(c => c.state !== 'closed').length)>1) throw Error('overlapping previews');
  }
  // Keyboard browsing and dismissing are silent; confirming the same option replays.
  let before = await page.evaluate(() => window.soundStarts);
  await page.getByRole('combobox',{name:'练习音色',exact:true}).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  if(await page.evaluate(() => window.soundStarts)!==before) throw Error('played while browsing');
  await page.getByRole('combobox',{name:'练习音色',exact:true}).press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForFunction(count => window.soundStarts >= count+4, before);
  await page.getByRole('button', {name: '外观', exact:true}).click();
  await page.waitForFunction(() => window.soundContexts.every(c => c.state === 'closed'));
  await page.goto(origin + '/settings?category=sound');
  await page.getByRole('combobox',{name:'练习音色',exact:true}).waitFor();
  for (const name of ['吉他', '电子短音']) if (!await page.getByRole('combobox').filter({hasText:name}).count()) throw Error('preference not restored');
  await page.getByRole('button', { name:'恢复默认', exact:true }).click();
  for (const name of ['钢琴','机械声']) if (!await page.getByRole('combobox').filter({hasText:name}).count()) throw Error('reset failed');
  await page.route('**/assets/audio/guitar-c4.flac', route => route.fulfill({status:503, body:'unavailable'}));
  await choose('练习音色','吉他');
  await page.getByText('声音加载失败，请重试。', {exact:true}).waitFor();
  await page.unroute('**/assets/audio/guitar-c4.flac');
  before = await page.evaluate(() => window.soundStarts || 0);
  await choose('练习音色','吉他');
  await page.waitForFunction(count => window.soundStarts > count, before);
  for (const width of [1440, 390]) {
    await page.setViewportSize({width,height:900});
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('horizontal overflow');
  }
  return '8 sounds decoded and scheduled, leaving closes audio, persistence, defaults and retry passed';
}
