// All API traffic mocked; real Web Audio exercises scheduling and playback lifecycle.
async page => {
  const origin = new URL(page.url()).origin;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: [{ kind: 'note', noteValue: 'eighth' }, { kind: 'rest', noteValue: 'eighth' }, ...Array.from({ length: 3 }, () => ({ kind: 'note', noteValue: 'quarter' }))] },
    { elements: [{ kind: 'rest', noteValue: 'quarter' }, { kind: 'note', noteValue: 'quarter' }, { kind: 'rest', noteValue: 'half' }] },
    { elements: [{ kind: 'note', noteValue: 'whole' }] },
  ] };
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    let json = { status: 'unavailable' };
    if (url.pathname.includes('model-connections')) json = { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } };
    if (url.pathname.includes('/custom-exercises/')) json = { id: url.pathname.split('/').at(-1), name: '自由起点测试', mode: 'tapping',
      created_at: '2026-10-13T00:00:00Z', exercise: url.pathname.endsWith('/one') ? { ...exercise, measures: exercise.measures.slice(0, 1) } : exercise };
    if (url.pathname.endsWith('/lookup')) json = null;
    if (url.pathname.endsWith('/records') && route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON()); json = { id: 'record-test' };
    }
    return route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/custom/tapping/range');
  const event = (measure, index) => page.getByRole('button', { name: `第 ${measure} 小节第 ${index} 个符号，设为练习起点`, exact: true });
  const selected = () => page.locator('.score-event-select[aria-pressed="true"]');
  await event(1, 1).waitFor();
  check(await page.getByRole('checkbox', { name: '只练习当前小节' }).count() === 0, '仍保留小节范围开关');
  check(await page.getByRole('button', { name: '从头开始', exact: true }).count() === 0, '仍保留重置按钮');
  const bpm = page.getByRole('spinbutton');
  await bpm.fill('240'); await bpm.blur();
  await page.locator('.rhythm-score svg').evaluate(el => { window.originalScore = el; });
  await event(1, 2).click();
  check(await event(1, 2).getAttribute('aria-pressed') === 'true', '休止符起点未选中');
  check(await page.locator('.tapping-range-summary').count() === 0, '仍显示多余范围文字');
  check(await page.locator('.rhythm-score svg').evaluate(el => el === window.originalScore), '选择重建谱面');
  await page.getByRole('button', { name: '试听', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.score-event-select')?.disabled);
  check(await event(1, 2).isDisabled(), '播放期间仍可改变起点');
  await page.getByRole('button', { name: '试听', exact: true }).waitFor({ timeout: 6000 });
  check(writes.length === 0, '试听写入记录');
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.getByText('本次未通过', { exact: true }).waitFor({ timeout: 6000 });
  check(writes.length === 0, '首小节中间起点被记录为整题');
  check(await event(1, 2).getAttribute('aria-pressed') === 'true', '结束后丢失起点');
  await event(2, 2).focus(); await page.keyboard.press('Enter');
  check(await event(2, 2).getAttribute('aria-pressed') === 'true', '键盘选择失败');
  check(!await page.locator('.practice-result').textContent(), '换起点保留旧成绩');
  const fullSaved = page.waitForResponse(response => response.url().endsWith('/records') && response.request().method() === 'POST');
  await event(1, 1).click();
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.locator(".trainer-countdown").waitFor();
  await page.locator(".trainer-countdown").waitFor({ state: "detached" });
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await fullSaved;
  check(writes.length === 1 && writes[0].attempts[0].targetCount === 6, '整题记录异常：' + JSON.stringify(writes));
  await page.setViewportSize({ width: 390, height: 700 });
  await event(2, 2).scrollIntoViewIfNeeded();
  const viewport = page.locator('.rhythm-score-viewport');
  const before = await viewport.evaluate(el => el.scrollTop);
  await event(2, 2).click();
  check(await viewport.evaluate(el => el.scrollTop) === before, '定位触发滚动');
  const name = await selected().getAttribute('aria-label');
  const box = await event(2, 1).boundingBox();
  await page.mouse.move(box.x + 10, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x + 25, box.y + 60, { steps: 5 }); await page.mouse.up();
  check(await selected().getAttribute('aria-label') === name, '拖动修改起点');
  // 滚动取消正在进行的点击；pointercancel 后的合成 click 也不能选中。
  await event(2, 1).dispatchEvent('pointerdown', { clientX: 20, clientY: 20, button: 0, isPrimary: true });
  await viewport.evaluate(el => { el.scrollTop += 5; el.dispatchEvent(new Event('scroll', { bubbles: true })); });
  await event(2, 1).dispatchEvent('click', { detail: 1 });
  check(await selected().getAttribute('aria-label') === name, '滚动修改起点');
  await event(2, 1).dispatchEvent('pointerdown', { clientX: 20, clientY: 20, button: 0, isPrimary: true });
  await event(2, 1).dispatchEvent('pointercancel');
  await event(2, 1).dispatchEvent('click', { detail: 1 });
  check(await selected().getAttribute('aria-label') === name, '取消的手势修改起点');
  await viewport.click({ position: { x: 5, y: 5 } });
  check(await selected().getAttribute('aria-label') === name, '留白点击修改起点');
  check(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), '窄屏横向溢出');
  await viewport.evaluate(el => { el.scrollTop = 0; el.scrollIntoView({ block: 'center' }); });
  const touchBox = await viewport.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const x = touchBox.x + touchBox.width / 2, y = Math.min(touchBox.y + touchBox.height - 20, 650);
  const initialScroll = await viewport.evaluate(el => el.scrollTop);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let distance = 20; distance <= 100; distance += 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  check(await viewport.evaluate(el => el.scrollTop) > initialScroll, '触屏滑动未滚动谱面');
  check(await selected().getAttribute('aria-label') === name, '触屏滑动改变起点');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await cdp.detach();
  await page.screenshot({ path: 'output/playwright/start-position-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await event(1, 3).click();
  await page.screenshot({ path: 'output/playwright/start-position-desktop.png', fullPage: true });
  await page.goto(origin + '/custom/tapping/one');
  await event(1, 2).waitFor(); await event(1, 2).click();
  check(await event(1, 2).getAttribute('aria-pressed') === 'true', '单小节不能选内部起点');
  await event(1, 1).click();
  await bpm.fill('240'); await bpm.blur();
  const singleSaved = page.waitForResponse(response => response.url().endsWith('/records') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.getByText('本次未通过', { exact: true }).waitFor({ timeout: 6000 });
  await singleSaved;
  check(writes.length === 2 && writes[1].attempts[0].targetCount === 4, '单小节整题未保存');
  check(!errors.length, errors.join('\n'));
  return '自由起点、试听、键盘、浏览手势隔离、稳定谱面、运行锁定、重复练习与记录边界通过';
}
