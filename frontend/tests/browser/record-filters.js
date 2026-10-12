// 用受控慢请求验证筛选稳定性，所有接口均模拟，不读写日常数据或调用模型。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => localStorage.removeItem('rhythm:assistant:v1:instance'));
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const contexts = [];
  const selection = { provider: 'deepseek', model: 'test-model' };
  const session = { id: 'filters', messages: [], is_running: false, last_run_status: null, model_selection: selection };
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test-model', models: [{ id: 'test-model', name: 'Test' }] }, chatgpt: { configured: false, models: [] } } }));
  await page.route('**/api/assistant/**', route => {
    const url = route.request().url();
    if (url.endsWith('/status')) return route.fulfill({ json: { status: 'ready', message: '' } });
    if (url.endsWith('/messages')) {
      contexts.push(route.request().postDataJSON().page_context);
      const events = [{ type: 'start', messageId: 'a' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '收到' }, { type: 'text-end', id: 't' }, { type: 'finish' }];
      return route.fulfill({ contentType: 'text/event-stream', body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n' });
    }
    return route.fulfill({ json: session });
  });
  const record = (mode, page = 1) => ({ id: mode + page, source: 'preset', exerciseId: mode, title: (mode === 'tapping' ? '击拍记录' : '听写记录') + page, mode, attemptCount: 10 });
  let controlled = false, receive, requestCount = 0;
  const pending = [];
  const response = url => {
    const mode = url.searchParams.get('mode'), p = Number(url.searchParams.get('page'));
    const after = url.searchParams.get('after');
    const days = after ? (new Date(url.searchParams.get('before')) - new Date(after)) / 86400000 : 100;
    const count = after ? days < 10 ? 7 : 30 : mode === 'all' ? 123 : mode === 'tapping' ? 103 : 20;
    return { records: mode === 'all' ? [record('tapping', p), record('dictation', p)] : [record(mode, p)], page: p, pages: 2, total: 3, pageSize: 2,
      overview: { count, days: 12, tappingCount: 103, passedCount: 80, passRate: 78, dictationCount: 20, completedCount: 15, independentCount: 10 } };
  };
  await page.route('**/api/local-data/records**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: { recordCount: 3, attemptCount: 123 } });
    requestCount++;
    if (!controlled) return route.fulfill({ json: response(url) });
    return new Promise(resolve => {
      const item = { url, finish: async (fail = false) => {
        await route.fulfill(fail ? { status: 503, json: {} } : { json: response(url) }); resolve();
      } };
      pending.push(item); receive?.(item); receive = undefined;
    });
  });
  await page.goto(origin + '/records');
  const results = page.locator('.record-results');
  const rows = page.locator('.record-entry');
  const count = page.locator('.record-metrics dd').first();
  const modeButtons = page.getByRole('group', { name: '记录模式', exact: true });
  const periods = page.getByRole('group', { name: '记录时间范围', exact: true });
  await rows.first().waitFor();
  await page.waitForFunction(() => document.querySelector('.record-results')?.getAttribute('aria-busy') === 'false');
  check((await count.textContent()).includes('123'), '初始统计错误');
  controlled = true;
  async function change(action) {
    const arriving = new Promise(resolve => { receive = resolve; });
    await action(); const item = await arriving;
    await page.waitForFunction(() => document.querySelector('.record-results')?.getAttribute('aria-busy') === 'true');
    return item;
  }
  async function settled() {
    await page.waitForFunction(() => document.querySelector('.record-results')?.getAttribute('aria-busy') === 'false');
  }
  async function stable(action) {
    const oldText = await results.textContent(), bounds = await results.boundingBox();
    const item = await change(action);
    check(await results.textContent() === oldText, '等待新结果时清空列表或改变统计口径');
    const nextBounds = await results.boundingBox();
    check(Math.abs(nextBounds.y - bounds.y) < 1 && Math.abs(nextBounds.height - bounds.height) < 1, '等待期间布局跳动');
    check(await rows.first().getByRole('button', { name: /查看详情/ }).isDisabled(), '旧结果操作仍可用');
    return item;
  }
  const tapping = await stable(() => modeButtons.getByRole('button', { name: '击拍练习', exact: true }).click());
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await page.getByRole('textbox', { name: '向助手提问' }).fill('当前统计是什么');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/messages')), page.getByRole('button', { name: '发送', exact: true }).click()]);
  const context = contexts.at(-1).state;
  check(context.status === 'loading' && context.filter.mode === 'all' && context.requestedFilter.mode === 'tapping' && context.overview.count === 123, '助手把旧统计标成新筛选');
  await tapping.finish(); await settled();
  check(await rows.count() === 1 && (await count.textContent()).includes('103'), '击拍统计与列表未同步更新');
  await page.getByRole('button', { name: '收起助手', exact: true }).click();
  const dictation = await stable(() => modeButtons.getByRole('button', { name: '节奏听写', exact: true }).click());
  const all = await stable(() => modeButtons.getByRole('button', { name: '全部', exact: true }).click());
  await all.finish(); await settled();
  await dictation.finish();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check(await rows.count() === 2 && (await count.textContent()).includes('123'), '迟到响应覆盖新筛选');
  for (const [label, expected] of [['近 7 天', '7'], ['近 30 天', '30'], ['全部', '123']]) {
    const item = await stable(() => periods.getByRole('button', { name: label, exact: true }).click());
    await item.finish(); await settled();
    check((await count.textContent()).replace('次', '').trim() === expected, '时间范围统计未更新');
  }
  const paging = await stable(() => page.getByRole('button', { name: '下一页', exact: true }).click());
  await paging.finish(); await settled();
  check(await rows.first().getByRole('heading').textContent() === '击拍记录2', '分页未生效');
  const failed = await stable(() => modeButtons.getByRole('button', { name: '节奏听写', exact: true }).click());
  const retained = await results.textContent(); await failed.finish(true); await settled();
  await page.getByRole('alert').waitFor();
  check(await results.textContent() === retained && await modeButtons.isVisible(), '失败丢失旧结果或筛选');
  const retry = await change(() => page.getByRole('button', { name: '重新读取', exact: true }).click());
  await retry.finish(); await settled();
  check(await page.getByRole('alert').count() === 0 && (await count.textContent()).includes('20'), '重试未恢复');
  const before = requestCount;
  await modeButtons.getByRole('button', { name: '节奏听写', exact: true }).click();
  await periods.getByRole('button', { name: '全部', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  check(requestCount === before, '重复点击当前筛选仍发请求');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await stable(() => periods.getByRole('button', { name: '近 7 天', exact: true }).click());
  await page.waitForFunction(() => {
    const status = document.querySelector('.record-query-status span');
    return status && getComputedStyle(status).opacity === '1';
  });
  await page.screenshot({ path: 'output/playwright/record-filters-mobile.png', fullPage: true });
  await mobile.finish(); await settled();
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄屏横向溢出');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await stable(() => periods.getByRole('button', { name: '近 30 天', exact: true }).click());
  await page.locator('.record-query-status span').waitFor();
  check(await page.locator('.record-query-status span').evaluate(el => getComputedStyle(el).opacity) === '1', '减少动态效果时加载提示不可见');
  await reduced.finish(); await settled();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check(errors.length === 0, errors.join('\n'));
  return '模式／时间筛选与分页不清空旧结果，统计同步替换，乱序响应、助手口径、失败重试和窄屏布局通过';
}
