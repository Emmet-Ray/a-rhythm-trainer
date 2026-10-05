// 模拟可暂停的 SSE，不调用真实模型；验证生成期间输入、练习交互及 Markdown。
async (page) => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    const entries = [], requests = [];
    let running = false;
    const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    const emit = (controller, event) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
    const answer = '# 练习建议\n\n先 **保持均匀**，再逐步提速。\n\n1. 听题\n2. 击拍\n\n> 先慢后快\n\n`60 BPM`\n\n```text\n1 & 2 & 3 & 4 &\n```\n\n[资料](https://example.com)';
    window.uxMock = { requests, answer, finish: () => {}, reject: () => {} };
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) return json({ auth_enabled: false });
      if (url.includes('/api/assistant/status')) return json({ status: 'ready', message: '' });
      if (!url.includes('/api/assistant/sessions')) return fetchOriginal(input, options);
      if (!url.endsWith('/messages')) return json({ id: 'ux', entries, is_running: running, last_run_status: running ? 'running' : entries.length ? 'completed' : null });
      const body = JSON.parse(options.body); requests.push(body);
      if (body.text === '模拟未接收') return new Promise(resolve => { window.uxMock.reject = () => resolve(new Response('{}', { status: 503 })); });
      entries.push({ type: 'user', text: body.text, page_context: body.page_context, created_at: new Date().toISOString() });
      if (requests.length === 1) {
        entries.push({ type: 'tool_result', tool_name: 'propose_rhythm_exercise', tool_call_id: 'c1', content: '练习', is_error: false, created_at: new Date().toISOString(), details: { generated_exercise: { id: 'ux-practice', title: '可随时练习', mode: 'tapping', description: '', exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: 'note', noteValue: 'whole' }] }] } } } });
        entries.push({ type: 'assistant', text: answer, created_at: new Date().toISOString() });
        return new Response('data: ' + JSON.stringify({ type: 'message_completed', text: answer }) + '\n\ndata: {"type":"run_completed"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
      }
      running = true;
      return new Response(new ReadableStream({ start(controller) {
        emit(controller, { type: 'text_delta', text: '# 正在分析\n\n**保持均匀**\n\n1. 慢速' });
        window.uxMock.finish = () => {
          if (!running) return;
          running = false;
          entries.push({ type: 'assistant', text: answer, created_at: new Date().toISOString() });
          emit(controller, { type: 'message_completed', text: answer });
          emit(controller, { type: 'run_completed' }); controller.close();
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
  await page.getByLabel('练习模板', { exact: true }).click();
  await page.getByRole('button', { name: '生成节奏听写', exact: true }).click();
  check((await input.inputValue()).includes('听写'), '生成中可使用模板');
  await input.fill('下一条问题'); await input.press('End'); await input.press('Enter');
  check((await input.inputValue()).includes('\n'), '生成中 Enter 换行，不误触停止或发送');
  check(await page.evaluate(() => window.uxMock.requests.length) === 2, '不并发发送');
  check(await page.locator('.assistant-pending strong').innerText() === '保持均匀', '流式回复也渲染 Markdown');
  await page.getByRole('button', { name: '开始击拍', exact: true }).click();
  await page.locator('.generated-practice-overlay').waitFor();
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  check((await input.inputValue()).startsWith('下一条问题'), '练习关闭后保留草稿');
  await page.evaluate(() => window.uxMock.finish());
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check((await input.inputValue()).startsWith('下一条问题'), '回答完成不覆盖草稿');
  await input.press('Enter'); await page.getByRole('button', { name: '停止生成' }).waitFor();
  await input.fill('停止后还要问'); await page.getByRole('button', { name: '停止生成' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(await input.inputValue() === '停止后还要问', '停止保留新草稿');
  await input.fill('模拟未接收'); await input.press('Enter');
  await page.getByRole('button', { name: '停止生成' }).waitFor();
  await input.fill('失败期间写好的草稿'); await page.evaluate(() => window.uxMock.reject());
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(await input.inputValue() === '失败期间写好的草稿', '失败恢复不能覆盖新草稿');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '窄屏无横向溢出');
  check(errors.length === 0, errors.join('\n'));
  return { passed: true, requests: await page.evaluate(() => window.uxMock.requests.length) };
}
