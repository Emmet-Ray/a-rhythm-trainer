// 模拟会话读取，逐帧验证切换时旧内容、容器尺寸和新会话滚动位置。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.addInitScript(() => localStorage.setItem('rhythm:assistant:v1:instance', 'a'));
  const selection = { provider: 'deepseek', model: 'test' };
  const sessions = Object.fromEntries(['a', 'b', 'c'].map(id => [id, {
    id, title: '会话 ' + id, unreadable: false, is_running: false, last_run_status: 'completed', model_selection: selection,
    updated_at: '2026-10-12T00:00:00Z', messages: Array.from({ length: id === 'c' ? 1 : 30 }, (_, i) => ({
      id: id + i, role: i % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text: `${id}-${i} ` + '这是用于检查会话滚动位置的消息。'.repeat(8) }],
    })),
  }]));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test' }] }, chatgpt: { configured: false, models: [] } } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  let hold = false, receive;
  await page.route('**/api/assistant/sessions**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/sessions')) return route.fulfill({ json: { sessions: Object.values(sessions), total: 3 } });
    const session = sessions[url.pathname.split('/').at(-1)];
    if (!hold) return route.fulfill({ json: session });
    return new Promise(resolve => receive(async fail => { await route.fulfill(fail ? { status: 503, json: { detail: '测试读取失败' } } : { json: session }); resolve(); }));
  });
  await page.goto(origin + '/');
  const log = page.getByRole('log', { name: '对话记录' });
  await log.getByText(/^a-29 /).waitFor();
  await log.evaluate(el => { el.scrollTop = 120; el.dispatchEvent(new Event('scroll')); });
  async function switchTo(id, fail = false) {
    const hadError = await page.getByRole("alert").count() > 0;
    const before = await log.evaluate(el => ({ text: el.textContent, height: el.clientHeight, top: el.scrollTop }));
    hold = true;
    const arriving = new Promise(resolve => { receive = resolve; });
    await page.getByRole('button', { name: new RegExp('^会话 ' + id) }).click();
    const finish = await arriving;
    await page.waitForTimeout(400); // 跨过延迟提示门槛，验证慢请求也不挤动内容。
    const pending = await log.evaluate(el => ({ text: el.textContent, height: el.clientHeight, top: el.scrollTop }));
    check(pending.text === before.text, '切换期间丢失旧消息');
    // 清除上次错误提示会释放其占位；读取提示本身不得改变消息区尺寸。
    if (!hadError) check(pending.height === before.height, `读取提示改变消息区高度：${before.height} → ${pending.height}`);
    check(Math.abs(pending.top - before.top) < 2, '读取期间移动旧会话位置');
    await log.evaluate(el => {
      window.switchFrames = [];
      window.recordSwitch = true;
      const sample = () => {
        if (!window.recordSwitch) return;
        window.switchFrames.push({ text: el.textContent.slice(0, 2), gap: el.scrollHeight - el.clientHeight - el.scrollTop });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    hold = false; await finish(fail);
    if (fail) {
      await page.getByRole('alert').waitFor();
      check(await log.textContent() === before.text, '失败后丢失旧会话');
    } else {
      await log.getByText(new RegExp(`^${id}-${id === 'c' ? 0 : 29} `)).waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const samples = await page.evaluate(() => window.switchFrames);
      check(samples.some(sample => sample.text === id + '-'), '未采集到切换帧');
      check(samples.filter(sample => sample.text === id + '-').every(sample => Math.abs(sample.gap) < 2), '新会话先显示错误位置再跳到底部');
    }
    await page.evaluate(() => { window.recordSwitch = false; });
  }
  await switchTo('b');
  await switchTo('c');
  await switchTo('a', true);
  await switchTo('a');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开会话列表', exact: true }).click();
  await switchTo('b');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '展开会话列表', exact: true }).click();
  await switchTo('c');
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.getByRole('link', { name: '关于', exact: true }).click();
  const opener = page.getByRole('button', { name: '打开 AI 助手', exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole('button', { name: '历史对话', exact: true }).click();
  await switchTo('b');
  return '会话切换慢请求布局、旧内容保留、失败重试及首帧滚动定位通过';
}
