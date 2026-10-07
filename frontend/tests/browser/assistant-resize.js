// playwright-cli run-code --filename; assistant requests are mocked.
async page => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const origin = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: {
    provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test', supports_images: true }] },
    chatgpt: { configured: false, models: [] }
  } }));
  await page.route('**/api/assistant/sessions**', route => route.fulfill({ json: { sessions: [], total: 0 } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/settings');
  await page.evaluate(() => localStorage.removeItem('rhythm:assistant-width:v1'));
  await page.reload();
  await page.getByRole('heading', { name: '设置', exact: true }).waitFor();
  const open = page.getByRole('button', { name: '打开 AI 助手' });
  const close = page.getByRole('button', { name: '收起助手' });
  const separator = page.getByRole('separator', { name: '调整助手宽度' });
  const input = page.getByRole('textbox', { name: '向助手提问' });
  const width = () => page.locator('#assistant').evaluate(element => element.getBoundingClientRect().width);
  const near = (actual, expected, message) => { if (Math.abs(actual - expected) > 2) throw new Error(`${message}: ${actual} != ${expected}`); };
  const noOverflow = async () => { if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('horizontal overflow'); };
  await open.click();
  near(await width(), 460, 'initial width');
  await input.fill('切换页面和布局后保留的草稿');
  // Keep the actual DOM node as well as checking its value: no remounts on route/layout changes.
  await input.evaluate(element => { window.originalComposer = element; });
  const checkDraft = async () => {
    if (await input.inputValue() !== '切换页面和布局后保留的草稿' || !await input.evaluate(element => element === window.originalComposer)) throw new Error('composer remounted or draft lost');
  };
  const drag = async delta => {
    const box = await separator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(box.x + delta, 200, { steps: 10 });
    await page.mouse.up();
  };
  await drag(-120);
  const dragged = await width();
  if (dragged < 570) throw new Error('drag did not resize');
  await separator.focus();
  await page.keyboard.press('ArrowLeft');
  const resized = await width();
  if (resized <= dragged) throw new Error('keyboard resize failed');
  near(Number(await page.evaluate(() => localStorage.getItem('rhythm:assistant-width:v1'))), resized, 'saved width');
  await close.click();
  if (await separator.isVisible()) throw new Error('closed separator visible');
  near(await page.locator('#page').evaluate(element => element.getBoundingClientRect().width), 1364, 'closed page expands');
  await open.click();
  near(await width(), resized, 'reopened width');
  await page.getByRole('link', { name: '节奏助手', exact: true }).click();
  await separator.waitFor({ state: 'hidden' });
  await checkDraft();
  if (await separator.isVisible()) throw new Error('home separator visible');
  await noOverflow();
  await page.getByRole('link', { name: '随机练习', exact: true }).click();
  await page.getByRole('heading', { name: '随机练习', exact: true }).waitFor();
  await checkDraft();
  near(await width(), resized, 'route width');
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForFunction(() => !!document.querySelector('.assistant-panel:modal'));
  if (await separator.isVisible()) throw new Error('modal separator visible');
  await checkDraft();
  await page.setViewportSize({ width: 1440, height: 900 });
  await separator.waitFor();
  near(await width(), resized, 'restored desktop width');
  await checkDraft();
  await drag(1000);
  near(await width(), 360, 'assistant minimum');
  await drag(-1000);
  const mainWidth = await page.locator('#page').evaluate(element => element.getBoundingClientRect().width);
  near(mainWidth, 480, 'page minimum');
  await noOverflow();
  const saved = await width();
  await page.reload();
  await open.click();
  near(await width(), saved, 'reload width');
  await page.getByRole('link', { name: '预设练习', exact: true }).click();
  await page.locator('.preset-library').waitFor();
  await noOverflow();
  const dialog = await page.locator('.assistant-panel').boundingBox();
  near(dialog.height, 900, 'preset assistant height');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !!document.querySelector('.assistant-panel:modal'));
  await noOverflow();
  await close.click();
  await noOverflow();
  if (errors.length) throw new Error(errors.join('\n'));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return 'drag, keyboard, limits, persistence, routes, draft identity, home and mobile passed';
}
