// 模拟可暂停的 SSE，不调用真实模型；验证生成期间输入、练习交互及 Markdown。
async (page) => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    const messages = [], requests = [];
    let running = false;
    const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    const emit = (controller, event) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
    const answer = '# 练习建议\n\n先 **保持均匀**，再逐步提速。\n\n1. 听题\n2. 击拍\n\n> 先慢后快\n\n`60 BPM`\n\n```text\n1 & 2 & 3 & 4 &\n```\n\n[资料](https://example.com)';
    window.uxMock = { requests, answer, finish: () => {}, reject: () => {} };
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      if (url.includes('/api/assistant/status')) return json({ status: 'ready', message: '' });
      if (url.includes('/api/model-connections')) return json({ provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test', supports_images: true }] }, chatgpt: { configured: false, models: [] } });
      if (url.includes('/cards/')) return json(JSON.parse(options.body));
      if (!url.includes('/api/assistant/sessions')) return fetchOriginal(input, options);
      if (!url.endsWith('/messages')) return json({ id: 'ux', model_selection: { provider: 'deepseek', model: 'test' }, messages, is_running: running, last_run_status: running ? 'running' : messages.length ? 'completed' : null });
      const body = JSON.parse(options.body); requests.push(body);
      if (body.text === '模拟未接收') return new Promise(resolve => { window.uxMock.reject = () => resolve(new Response('{}', { status: 503 })); });
      messages.push({ id: body.message_id, role: 'user', parts: [{ type: 'text', text: body.text }],
        metadata: { created_at: new Date().toISOString(), page_context: body.page_context } });
      const id = 'a' + requests.length;
      const saved = { id, role: 'assistant', parts: [{ type: 'step-start' }] };
      if (requests.length === 1) {
        const output = { generated_exercise: { id: 'ux-practice', title: '可随时练习', mode: 'tapping', description: '',
          exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: 'note', noteValue: 'whole' }] }] } } };
        saved.parts.push({ type: 'tool-propose_rhythm_exercise', toolCallId: 'c1', state: 'output-available', input: {}, output },
          { type: 'text', text: answer, state: 'done' });
        messages.push(saved);
        const events = [{ type: 'start', messageId: id }, { type: 'start-step' },
          { type: 'tool-input-available', toolName: 'propose_rhythm_exercise', toolCallId: 'c1', input: {} },
          { type: 'tool-output-available', toolCallId: 'c1', output },
          { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: answer },
          { type: 'text-end', id: 't1' }, { type: 'finish-step' }, { type: 'finish' }];
        return new Response(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      running = true;
      return new Response(new ReadableStream({ start(controller) {
        emit(controller, { type: 'start', messageId: id }); emit(controller, { type: 'start-step' });
        emit(controller, { type: 'text-start', id: 't1' });
        const partial = '# 正在分析\n\n**保持均匀**\n\n1. 慢速';
        emit(controller, { type: 'text-delta', id: 't1', delta: partial });
        window.uxMock.finish = () => {
          if (!running) return;
          running = false;
          saved.parts.push({ type: 'text', text: partial + '\n\n' + answer, state: 'done' });
          messages.push(saved);
          emit(controller, { type: 'text-delta', id: 't1', delta: '\n\n' + answer });
          emit(controller, { type: 'text-end', id: 't1' }); emit(controller, { type: 'finish-step' });
          emit(controller, { type: 'finish' }); controller.close();
        };
        options.signal.addEventListener('abort', () => { if (running) { running = false; controller.error(options.signal.reason); } }, { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/');
  const input = page.getByRole('textbox', { name: '向助手提问' });
  await input.fill('**生成练习**'); await input.press('Enter');
  await page.getByRole('button', { name: '开始击拍', exact: true }).waitFor();
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(await page.locator('.assistant-message.user').first().innerText().then(t => t.includes('**生成练习**')), '用户消息保留原文');
  check(await page.locator('.assistant-markdown strong').count() === 1, '完成回复渲染加粗');
  await input.fill('分析一下'); await input.press('Enter');
  await page.getByRole('button', { name: '停止生成' }).waitFor();
  check(await input.isEnabled(), '生成中输入框可用');
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  await page.getByRole('option', { name: '生成节奏听写', exact: true }).click();
  check((await input.inputValue()).includes('听写'), '生成中可使用模板');
  await input.fill('下一条问题'); await input.press('End'); await input.press('Enter');
  check((await input.inputValue()).includes('\n'), '生成中 Enter 换行，不误触停止或发送');
  check(await page.evaluate(() => window.uxMock.requests.length) === 2, '不并发发送');
  check(await page.locator('.assistant-pending strong').innerText() === '保持均匀', '流式回复也渲染 Markdown');
  await page.getByRole('link', { name: '随机练习', exact: true }).click();
  await page.getByRole('button', { name: '打开 AI 助手' }).click();
  await page.getByRole('separator', { name: '调整助手宽度' }).focus();
  await page.keyboard.press('ArrowLeft');
  check(await page.getByRole('button', { name: '停止生成' }).isVisible(), '分栏调整不中断生成');
  await page.getByRole('link', { name: '节奏助手', exact: true }).click();
  await page.locator('.assistant-workspace[data-home="true"]').waitFor();
  check((await input.inputValue()).startsWith('下一条问题'), '生成中跨页面保留草稿');
  await page.getByRole('button', { name: '开始击拍', exact: true }).click();
  await page.locator('.generated-practice-overlay').waitFor();
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  await page.locator('.generated-practice-overlay').waitFor({ state: 'hidden' });
  check((await input.inputValue()).startsWith('下一条问题'), '练习关闭后保留草稿');
  await page.evaluate(() => window.uxMock.finish());
  await page.waitForFunction(() => { const send = document.querySelector('button[aria-label="发送"]'); return send && !send.disabled; });
  check((await input.inputValue()).startsWith('下一条问题'), '回答完成不覆盖草稿');
  await input.press('Enter'); await page.getByRole('button', { name: '停止生成' }).waitFor();
  await input.fill('停止后还要问'); await page.getByRole('button', { name: '停止生成' }).click();
  await page.waitForFunction(() => { const send = document.querySelector('button[aria-label="发送"]'); return send && !send.disabled; });
  check(await input.inputValue() === '停止后还要问', '停止保留新草稿');
  await input.fill('模拟未接收'); await input.press('Enter');
  await page.getByRole('button', { name: '停止生成' }).waitFor();
  await input.fill('失败期间写好的草稿'); await page.evaluate(() => window.uxMock.reject());
  await page.waitForFunction(() => { const send = document.querySelector('button[aria-label="发送"]'); return send && !send.disabled; });
  check(await input.inputValue() === '模拟未接收\n\n失败期间写好的草稿', '失败恢复同时保留原消息与新草稿');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '窄屏无横向溢出');
  check(errors.length === 0, errors.join('\n'));
  return { passed: true, requests: await page.evaluate(() => window.uxMock.requests.length) };
}
