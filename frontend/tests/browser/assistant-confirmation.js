// 确认正常回复不读取快照，输入草稿正常清空，会话列表不因忙闲切换重复请求。
async page => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    let sequence = 0;
    window.confirmationRequests = [];
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      if (url.includes('/api/assistant/status')) return json({ status: 'ready', message: '' });
      if (url.includes('/api/model-connections')) return json({ provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test', supports_images: true }] }, chatgpt: { configured: false, models: [] } });
      if (!url.includes('/api/assistant/sessions')) return original(input, options);
      window.confirmationRequests.push([url, options.method || 'GET']);
      if (url.includes('?offset=')) return json({ sessions: [], total: 0 });
      if (options.method === 'POST' && url.endsWith('/sessions')) return json({ id: `test-${++sequence}`, messages: [], is_running: false, last_run_status: null, model_selection: { provider: 'deepseek', model: 'test' } });
      if (url.endsWith('/messages')) {
        const body = JSON.parse(options.body), stamp = new Date().toISOString(), id = 'a-' + body.message_id;
        const events = [
          { type: 'data-turn-accepted', transient: true, data: { user_id: body.message_id, created_at: stamp, title: body.text, updated_at: stamp } },
          { type: 'start', messageId: id, messageMetadata: { created_at: stamp } },
          { type: 'start-step' }, { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: '收到：' + body.text },
          { type: 'text-end', id: 't' }, { type: 'finish-step' },
          { type: 'data-turn-completed', transient: true, data: { user_id: body.message_id, assistant_id: id, title: body.text, updated_at: stamp } }, { type: 'finish' },
        ];
        return new Response(new ReadableStream({ start(controller) {
          const emit = event => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
          events.slice(0, 2).forEach(emit);
          window.confirmationText = () => events.slice(2, 5).forEach(emit);
          window.confirmationFinish = () => { events.slice(5).forEach(emit); controller.close(); };
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      throw new Error('Unexpected snapshot request: ' + url);
    };
    localStorage.clear();
  });
  await page.goto('http://127.0.0.1:5173/');
  const input = page.getByRole('textbox', { name: '向助手提问' });
  await input.waitFor();
  const initialLists = await page.evaluate(() => window.confirmationRequests.filter(([url]) => url.includes('?offset=')).length);
  for (const text of ['确认第一条', '确认第二条']) {
    await input.fill(text);
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.getByText('正在思考…', { exact: true }).waitFor();
    const turns = page.locator('.assistant-turn');
    const before = await turns.count();
    if (await turns.last().locator('article.user').count() !== 1) throw new Error('思考期间出现空助手消息');
    const times = await page.locator('.assistant-message-meta time').count();
    await page.evaluate(() => window.confirmationText());
    await page.getByText('收到：' + text, { exact: true }).waitFor();
    if (await page.locator('.assistant-message-meta time').count() !== times) throw new Error('生成中提前显示助手时间');
    if (await turns.last().locator('.assistant-message-copy').count()) throw new Error('生成中提前显示复制操作');
    await page.evaluate(() => window.confirmationFinish());
    await page.waitForFunction(count => document.querySelectorAll('.assistant-message-meta time').length === count + 1, times);
    if (await turns.count() !== before + 1) throw new Error('助手消息重复');
    await page.waitForFunction(() => !document.querySelector('button[aria-label="停止生成"]'));
    if (await input.inputValue()) throw new Error('已接受的输入没有清空');
  }
  const requests = await page.evaluate(() => window.confirmationRequests);
  if (requests.some(([url, method]) => method === 'GET' && !url.includes('?offset='))) throw new Error('正常路径读取了快照');
  if (requests.filter(([url]) => url.includes('?offset=')).length > initialLists) throw new Error('重复刷新会话列表');
  return requests;
}
