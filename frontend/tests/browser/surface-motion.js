// playwright-cli run-code --filename; only mock model/assistant requests.
async page => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const origin = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/status', r => r.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/model-connections**', r => r.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test', supports_images: true }] }, chatgpt: { configured: false, models: [] } } }));
  await page.route('**/api/assistant/sessions**', r => r.fulfill({ json: { sessions: [], total: 0 } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  const settle = locator => locator.evaluate(async element => { await Promise.all(element.getAnimations().map(a => a.finished.catch(() => {}))); });
  const menu = page.getByRole('dialog', { name: '添加内容', exact: true });
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  if (await menu.evaluate(e => getComputedStyle(e).animationName) !== 'surface-enter') throw new Error('menu entry absent');
  await settle(menu);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  await menu.waitFor();
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  await page.getByLabel('选择图片文件').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: '预览图片 1' }).click();
  const image = page.getByRole('dialog', { name: '图片预览' });
  await settle(image);
  await image.evaluate(element => {
    window.exitFrames = [];
    const sample = () => {
      if (!element.open) return;
      window.exitFrames.push(Number(getComputedStyle(element).opacity));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole('button', { name: '关闭图片预览' }).evaluate(button => button.click());
  if (!await image.evaluate(e => e.inert && !!e.querySelector('img') && e.getAnimations().length > 0)) throw new Error('image disappears before exit');
  await image.waitFor({ state: 'hidden' });
  const frames = await page.evaluate(() => window.exitFrames);
  if (frames.some((opacity, i) => i > 0 && opacity > frames[i - 1] + 0.05)) throw new Error('exit opacity flashes back before close');
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: '添加内容', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '预览图片 1' }).evaluate(e => e.click());
    await page.waitForFunction(() => document.querySelector('.assistant-image-viewer').matches(':modal'));
    await page.keyboard.press('Escape');
    await image.waitFor({ state: 'hidden', timeout: 2000 });
  }
  await page.getByRole('link', { name: '随机练习', exact: true }).click();
  await page.getByRole('button', { name: '生成设置', exact: true }).click();
  const drawer = page.locator('.random-settings-drawer');
  await settle(drawer);
  await page.getByRole('button', { name: '关闭生成设置' }).click();
  await drawer.waitFor({ state: 'hidden' });
  if (!await page.getByRole('button', { name: '生成设置', exact: true }).evaluate(e => e === document.activeElement)) throw new Error('drawer focus not restored');
  await page.getByRole('button', { name: '打开 AI 助手' }).click();
  await settle(page.locator('.assistant-panel'));
  await page.getByRole('button', { name: '历史对话', exact: true }).click();
  const history = page.getByRole('dialog', { name: '历史对话', exact: true });
  await history.waitFor();
  await page.getByRole('button', { name: '关闭历史对话' }).click();
  await history.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '收起助手' }).click();
  await page.getByRole('button', { name: '打开 AI 助手' }).waitFor();
  await page.getByRole('button', { name: '打开 AI 助手' }).click();
  if (await page.getByRole('textbox', { name: '向助手提问' }).inputValue()) throw new Error('unexpected draft');
  // Route change while closing must cancel the old dismissal, leaving home interactive.
  await page.getByRole('button', { name: '收起助手' }).evaluate(button => button.click());
  await page.getByRole('link', { name: '节奏助手', exact: true }).evaluate(link => link.click());
  await page.locator('.assistant-workspace[data-home="true"]').waitFor();
  await page.getByRole('textbox', { name: '向助手提问' }).fill('仍可输入');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  if (await menu.evaluate(e => e.getAnimations().length)) throw new Error('reduced motion animates menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '预览图片 1' }).click();
  await page.getByRole('button', { name: '关闭图片预览' }).click();
  await image.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '打开导航菜单' }).click();
  await page.getByRole('button', { name: '关闭导航菜单' }).click();
  await page.locator('#site-menu').waitFor({ state: 'hidden' });
  if (errors.length) throw new Error(errors.join('\n'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return 'menu, drawer, image exit, assistant dismissal cancellation, focus and reduced motion passed';
}
