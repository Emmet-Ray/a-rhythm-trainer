// 所有接口模拟；用受控慢请求验证共享查询在题库及记录详情中的更新与失败行为。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/**', route => route.fulfill({ json: { status: 'unavailable', message: '测试不调用模型' } }));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } } }));
  let controlled = false, receive, emptyLastPage = false;
  async function answer(route, value) {
    if (!controlled) return route.fulfill({ json: value });
    return new Promise(resolve => receive({ finish: async fail => {
      await route.fulfill(fail ? { status: 503, json: {} } : { json: value }); resolve();
    } }));
  }
  async function change(action) {
    const arriving = new Promise(resolve => { receive = resolve; });
    await action();
    const request = await arriving;
    await page.waitForFunction(() => document.querySelector('.custom-catalog [aria-busy="true"], .record-detail[aria-busy="true"]'));
    return request;
  }
  await page.route('**/api/custom-exercises?*', route => {
    const url = new URL(route.request().url()), offset = Number(url.searchParams.get('offset'));
    const count = offset === 0 ? 50 : emptyLastPage ? 0 : 2;
    const value = { limit: 50, offset, items: Array.from({ length: count }, (_, i) => ({
      id: `custom-${offset + i}`, name: `题目 ${offset + i}`, mode: 'tapping', created_at: '2026-10-01T00:00:00Z',
    })) };
    return answer(route, value);
  });
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: 'note', noteValue: 'whole' }] }] };
  const record = { id: 'archive', source: 'preset', exerciseId: 'test', title: '详情测试', mode: 'tapping', exercise,
    startedAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z', attemptCount: 20, passedCount: 20, completedCount: 20, independentCount: 0, viewedAnswerCount: 0 };
  await page.route('**/api/local-data/records**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: { recordCount: 1, attemptCount: 20 } });
    if (url.pathname.endsWith('/archive')) {
      const p = Number(url.searchParams.get('page'));
      const attempts = Array.from({ length: 10 }, (_, i) => ({ id: `attempt-${p}-${i}`, completedAt: `2026-10-${p === 1 ? '12' : '01'}T00:${String(i).padStart(2, '0')}:00Z`,
        bpm: p === 1 ? 61 : 82, timingWindows: { perfectMs: 50, hitMs: 150 }, passed: true, targetCount: 1, hitCount: 1, missCount: 0, wrongTapCount: 0 }));
      return answer(route, { record, attempts, page: p, pages: 2, total: 20, pageSize: 10 });
    }
    return route.fulfill({ json: { records: [record], page: 1, pages: 1, total: 1, pageSize: 10,
      overview: { count: 20, days: 2, tappingCount: 20, passedCount: 20, passRate: 100, dictationCount: 0, completedCount: 0, independentCount: 0 } } });
  });
  await page.goto(origin + '/custom/tapping');
  const catalog = page.getByRole('list', { name: '已保存的自定义练习' });
  await catalog.waitFor(); check(await catalog.getByRole('listitem').count() === 50, '初始题库页错误');
  const catalogTop = () => catalog.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  const oldCatalog = await catalog.textContent(), top = await catalogTop();
  controlled = true;
  const next = await change(() => page.getByRole('button', { name: '下一页', exact: true }).click());
  check(await catalog.textContent() === oldCatalog && Math.abs(await catalogTop() - top) < 1, '题库翻页清空或移动旧列表');
  check(await page.getByRole('button', { name: '下一页', exact: true }).isDisabled(), '题库等待时仍可重复翻页');
  await next.finish(); await page.getByRole('heading', { name: '题目 50', exact: true }).waitFor();
  check((await page.getByRole('navigation', { name: '题目分页' }).textContent()).includes('第 2 页'), '题库分页口径错误');
  const failed = await change(() => page.getByRole('button', { name: '上一页', exact: true }).click());
  await failed.finish(true); await page.getByRole('alert').waitFor();
  check(await catalog.getByRole('listitem').count() === 2, '题库读取失败清空旧页');
  const retry = await change(() => page.getByRole('button', { name: '重试读取', exact: true }).click());
  await retry.finish(); await page.getByRole('heading', { name: '题目 0', exact: true }).waitFor();
  // 原页已因删除而消失时，继续查询上一页，期间始终保留当前列表。
  emptyLastPage = true;
  const vanished = await change(() => page.getByRole('button', { name: '下一页', exact: true }).click());
  const fallbackArriving = new Promise(resolve => { receive = resolve; });
  await vanished.finish(); const fallback = await fallbackArriving;
  check(await catalog.getByRole('listitem').count() === 50, '失效页回退期间出现空列表');
  controlled = false; await fallback.finish();
  await page.waitForFunction(() => document.querySelector('.custom-catalog [aria-busy]')?.getAttribute('aria-busy') === 'false');
  check((await page.getByRole('navigation', { name: '题目分页' }).textContent()).includes('第 1 页'), '失效页未回退');
  await page.goto(origin + '/records');
  await page.getByRole('button', { name: '查看详情：“详情测试”的练习记录', exact: true }).click();
  const dialog = page.locator('.record-drawer');
  const table = dialog.getByRole('table', { name: '击拍练习明细' });
  await table.waitFor(); check((await table.textContent()).includes('61 BPM'), '详情首页错误');
  const oldTable = await table.textContent(), bounds = await table.boundingBox();
  controlled = true;
  const detail = await change(() => dialog.getByRole('button', { name: '下一页', exact: true }).click());
  check(await table.textContent() === oldTable && Math.abs((await table.boundingBox()).y - bounds.y) < 1, '详情翻页替换整张表');
  check(await dialog.getByRole('button', { name: '下一页', exact: true }).isDisabled(), '详情等待时分页未禁用');
  await detail.finish(); await page.waitForFunction(() => document.querySelector('.record-detail')?.getAttribute('aria-busy') === 'false');
  check((await table.textContent()).includes('82 BPM'), '详情新页未更新');
  const detailError = await change(() => dialog.getByRole('button', { name: '上一页', exact: true }).click());
  await detailError.finish(true); await dialog.getByRole('alert').waitFor();
  check((await table.textContent()).includes('82 BPM'), '详情失败丢失旧页');
  const detailRetry = await change(() => dialog.getByRole('button', { name: '重新读取', exact: true }).click());
  await detailRetry.finish(); await page.waitForFunction(() => document.querySelector('.record-detail')?.getAttribute('aria-busy') === 'false');
  check((await table.textContent()).includes('61 BPM'), '详情重试未恢复');
  await dialog.getByRole('button', { name: '关闭记录详情', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  // 统计和清空共享题库查询边界，失败可重试且不会伪装为零。
  let failTotals = true, failClear = true, cleared = false;
  await page.route('**/api/local-data/exercises', route => {
    if (route.request().method() === 'DELETE') {
      if (failClear) return route.fulfill({ status: 503, json: { detail: '测试清空失败' } });
      cleared = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill(failTotals ? { status: 503, json: { detail: '测试统计失败' } }
      : { json: { total: cleared ? 0 : 2, tapping: cleared ? 0 : 2, dictation: 0 } });
  });
  await page.goto(origin + '/settings?category=local-data');
  await page.getByText('测试统计失败').waitFor();
  check(await page.getByRole('button', { name: '清空题库', exact: true }).isDisabled(), '统计失败时仍能清空题库');
  failTotals = false;
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.getByText('2 道题目 · 击拍 2 道 · 听写 0 道', { exact: true }).waitFor();
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: '清空题库', exact: true }).click();
  await page.getByText('测试清空失败').waitFor();
  check(!cleared, '失败清空改变了题库');
  failClear = false;
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: '清空题库', exact: true }).click();
  await page.getByText('0 道题目 · 击拍 0 道 · 听写 0 道', { exact: true }).waitFor();
  check(await page.getByRole('button', { name: '清空题库', exact: true }).isDisabled(), '清空后未刷新统计');
  check(errors.length === 0, errors.join('\n'));
  return '共享查询：题库分页与刷新、读取失败及失效页回退，详情分页与失败重试保持内容和布局，题库统计读取和清空重试通过';
}
