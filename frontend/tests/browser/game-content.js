// Isolated origin and mocked API; all registered content must load in the real renderer.
async page => {
  const origin = new URL(page.url()).origin, errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().includes('/assets/game/') && !response.ok()) missing.push(response.url()); });
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json:
    route.request().url().includes('sessions') ? [] : route.request().url().includes('model-connections') ?
      { provider: 'deepseek', deepseek: { configured: true, models: ['deepseek-chat'] }, chatgpt: { configured: false, models: [] } } :
      { status: 'ready', message: '' } }));
  await page.goto(origin + '/game');
  const content = await page.evaluate(async () => {
    const { gameLevels, orbitThemes, gameImages, DEFAULT_ORBIT_THEME } = await import('/src/game/catalog.ts');
    const { soundFontBanks } = await import('/src/game/catalog.ts');
    for (const url of [...gameImages.map(image => image.url), ...soundFontBanks.map(sample => sample.file)]) {
      const response = await fetch(url);
      if (!response.ok || !(await response.arrayBuffer()).byteLength) throw Error('Missing content: ' + url);
    }
    return { levels: gameLevels.map(level => ({ id: level.id, theme: level.visualTheme?.id ?? DEFAULT_ORBIT_THEME })), themes: orbitThemes.map(theme => theme.id) };
  });
  const ready = () => page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const level of content.levels) {
    await page.goto(origin + '/game/' + level.id); await ready();
    if (await page.locator('.orbit-stage').getAttribute('data-visual-theme') !== level.theme) throw Error('Incorrect default: ' + level.id);
    if (await page.locator('.orbit-canvas canvas').count() !== 1) throw Error('Missing or duplicate canvas: ' + level.id);
  }
  await page.getByRole('button', { name: '练习设置', exact: true }).click();
  if (await page.getByLabel('画面主题', { exact: false }).count()) throw Error('Theme selector remains');
  await page.getByRole('button', {name:'取消',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.screenshot({ path: 'output/playwright/game-content-themes.png' });
  if (errors.length || missing.length) throw Error([...errors, ...missing].join('\n'));
  return { passed: true, levels: content.levels.length, themes: content.themes.length, errors, missing };
}
