// 验证答案展示可折叠，但已查看事实不会回退；使用模拟会话，不调用模型。
async page => {
  const origin = new URL(page.url()).origin;
  const writes = [];
  const proposal = { id: 'exercise', title: '节奏听写', description: '', mode: 'dictation',
    exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: 'note', noteValue: 'whole' }] }] } };
  await page.route(`${origin}/api/assistant/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/cards/')) {
      const state = route.request().postDataJSON(); writes.push(state);
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: path.endsWith('/status') ? { status: 'ready', message: '' }
      : path.endsWith('/sessions') ? { sessions: [], total: 0 }
      : { id: 'toggle', is_running: false, last_run_status: 'completed', messages: [{ id: 'reply', role: 'assistant',
        parts: [{ type: 'tool-propose_rhythm_exercise', toolCallId: 'call', state: 'output-available', input: {}, output: { generated_exercise: proposal } }] }] } });
  });
  await page.evaluate(() => localStorage.setItem('rhythm:assistant:v1:instance', 'toggle'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  const reveal = page.getByRole('button', { name: '查看答案', exact: true });
  await reveal.waitFor();
  if (await page.locator('.exercise-card-score').count()) throw Error('未查看时泄露谱面');
  const node = await reveal.elementHandle();
  const saved = page.waitForResponse(response => response.url().includes('/cards/'));
  await reveal.click(); await saved;
  await page.locator('.exercise-card-score svg').waitFor();
  await page.getByRole('button', { name: '收起答案', exact: true }).click();
  await reveal.waitFor();
  if (await page.locator('.exercise-card-score').count()) throw Error('收起后仍有谱面');
  if (!await node.evaluate(el => el.isConnected && el.getAttribute('aria-expanded') === 'false')) throw Error('按钮被替换');
  if (!writes.length || writes.some(state => state.answer_viewed !== true)) throw Error('已查看事实被撤销');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const aligned = await page.locator('.exercise-card footer').evaluate(footer => {
      const button = footer.querySelector('button');
      return Math.abs(button.getBoundingClientRect().left - footer.getBoundingClientRect().left) < 2;
    });
    if (!aligned) throw Error('按钮未左对齐');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('横向溢出');
  }
  await reveal.click();
  await page.locator('.exercise-card-score svg').waitFor();
  return { passed: true };
}
