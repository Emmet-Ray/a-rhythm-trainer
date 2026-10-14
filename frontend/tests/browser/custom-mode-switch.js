// 所有接口模拟；模式切换保留列表节点、正确的数据身份和各访问的分页。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: { status: 'unavailable' } }));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } } }));
  let hold = false, receive;
  await page.route('**/api/custom-exercises?*', route => {
    const url = new URL(route.request().url()), mode = url.searchParams.get('mode'), offset = Number(url.searchParams.get('offset'));
    const value = { offset, limit: 50, items: Array.from({ length: offset ? 2 : 50 }, (_, i) => ({
      id: `${mode}-${offset + i}`, name: `${mode} ${offset + i}`, mode, created_at: '2026-10-12T00:00:00Z',
    })) };
    if (!hold) return route.fulfill({ json: value });
    return new Promise(resolve => receive(async fail => {
      await route.fulfill(fail ? { status: 503, json: {} } : { json: value }); resolve();
    }));
  });
  await page.goto(origin + '/custom/tapping');
  await page.getByRole('heading', { name: 'tapping 0', exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    const gap = await page.evaluate(() => document.querySelector('.question-list').getBoundingClientRect().top
      - document.querySelector('.library-mode-switch').getBoundingClientRect().bottom);
    check(gap >= 0 && gap <= 24, `模式切换与列表间距异常：${width}px，${gap}px`);
  }
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByRole('heading', { name: 'tapping 50', exact: true }).waitFor();
  await page.waitForFunction(() => document.getAnimations().length === 0);
  await page.evaluate(() => {
    window.oldCatalog = document.querySelector('.custom-catalog');
    window.entrances = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(...args) {
      if (this.id === 'main-content') window.entrances++;
      return animate.apply(this, args);
    };
  });
  async function change(action, fail = false) {
    hold = true;
    const request = new Promise(resolve => { receive = resolve; });
    const oldText = await page.locator('.question-list').textContent();
    await action(); const finish = await request;
    const listTop = await page.locator('.question-list').evaluate(el => el.getBoundingClientRect().top);
    await page.waitForTimeout(400);
    check(await page.locator('.question-list').evaluate(el => el.getBoundingClientRect().top) === listTop,
      '加载提示出现时移动列表');
    check(await page.evaluate(() => window.oldCatalog === document.querySelector('.custom-catalog')), '模式切换重建列表');
    check(await page.locator('.question-list').textContent() === oldText, '等待时清空旧列表');
    check(await page.evaluate(() => window.entrances === 0), '模式切换触发整页淡入');
    const link = page.locator('.custom-start-action').first();
    check((await link.getAttribute('href')).includes((await page.locator('.question-list h2').first().textContent()).split(' ')[0]), '旧题目链接被标为新模式');
    hold = false; await finish(fail);
    await page.waitForFunction(() => document.querySelector('.custom-catalog [aria-busy]')?.getAttribute('aria-busy') === 'false');
  }
  const modes = page.getByRole('group', { name: '训练方式' });
  await change(() => modes.getByRole('button', { name: '节奏听写', exact: true }).click(), true);
  await page.getByRole('alert').waitFor();
  check(await page.getByRole('heading', { name: 'tapping 50', exact: true }).count() === 1, '失败丢失上一模式');
  await page.getByRole('button', { name: '重试读取', exact: true }).click();
  await page.getByRole('heading', { name: 'dictation 0', exact: true }).waitFor();
  await change(() => modes.getByRole('button', { name: '击拍练习', exact: true }).click());
  await page.getByRole('heading', { name: 'tapping 50', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'dictation 0', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'tapping 50', exact: true }).waitFor();
  check(await page.evaluate(() => window.entrances === 0), '历史切换触发整页淡入');
  return '题库模式切换、失败重试、链接身份和历史分页恢复通过';
}
