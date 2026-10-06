// 暂停工具后的回复，验证卡片提前可用且同步不重新挂载；不调用真实模型。
async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = window.fetch.bind(window), messages = [];
    let running = false, status = null, count = 0;
    const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    window.streamMock = {};
    window.fetch = async (input, options = {}) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) return json({ auth_enabled: false });
      if (url.includes('/api/assistant/status')) return json({ status: 'ready', message: '' });
      if (!url.includes('/api/assistant/sessions')) return original(input, options);
      if (!url.endsWith('/messages')) return json({ id: 'stream', messages, is_running: running, last_run_status: status });
      const body = JSON.parse(options.body);
      running = true; status = 'running'; count++;
      return new Response(new ReadableStream({ start(controller) {
        const emit = event => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n'));
        messages.push({ id: body.message_id, role: 'user', parts: [{ type: 'text', text: body.text }],
          metadata: { created_at: new Date().toISOString(), page_context: body.page_context } });
        const id = 'answer' + count, callId = 'call' + count;
        const output = { generated_exercise: {
          id: 'practice' + count, title: '流式练习 ' + count, mode: 'tapping', description: '',
          exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [
            { elements: [{ kind: 'note', noteValue: 'whole' }] },
            { elements: [{ kind: 'note', noteValue: 'half' }, { kind: 'note', noteValue: 'half' }] },
          ] },
        } };
        const saved = { id, role: 'assistant', parts: [{ type: 'step-start' },
          { type: 'text', text: '准备这道练习。', state: 'done' },
          { type: 'tool-propose_rhythm_exercise', toolCallId: callId, state: 'output-available', input: {}, output },
          { type: 'step-start' }] };
        messages.push(saved);
        emit({ type: 'start', messageId: id }); emit({ type: 'start-step' });
        emit({ type: 'text-start', id: 'intro' });
        emit({ type: 'text-delta', id: 'intro', delta: '准备这道练习。' });
        emit({ type: 'text-end', id: 'intro' });
        emit({ type: 'tool-input-available', toolCallId: callId, toolName: 'propose_rhythm_exercise', input: {} });
        emit({ type: 'tool-output-available', toolCallId: callId, output });
        emit({ type: 'finish-step' }); emit({ type: 'start-step' });
        emit({ type: 'text-start', id: 'advice' });
        const advice = '**保持均匀**，先慢速练习。';
        window.streamMock.text = () => emit({ type: 'text-delta', id: 'advice', delta: advice });
        window.streamMock.finish = (fail = false) => {
          running = false; status = fail ? 'failed' : 'completed';
          if (fail) emit({ type: 'error', errorText: '模拟后续回复失败' });
          else {
            saved.parts.push({ type: 'text', text: advice, state: 'done' });
            emit({ type: 'text-end', id: 'advice' }); emit({ type: 'finish-step' });
            emit({ type: 'finish' });
          }
          controller.close();
        };
        options.signal.addEventListener('abort', () => {
          if (running) { running = false; status = 'cancelled'; controller.error(options.signal.reason); }
        }, { once: true });
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/');
  const input = page.getByRole('textbox', { name: '向助手提问' });
  await input.fill('生成练习'); await input.press('Enter');
  const start = page.getByRole('button', { name: '开始击拍', exact: true });
  await start.waitFor();
  check(await page.getByRole('button', { name: '停止生成' }).isVisible(), '卡片应在生成结束前出现');
  const node = await start.elementHandle();
  await page.getByRole("button", { name: "跳到小节 2", exact: true }).click();
  await page.getByRole("button", { name: "加快 5 BPM", exact: true }).click();
  await start.click();
  await page.locator('.generated-practice-overlay').waitFor();
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  await input.fill('下一条草稿');
  await page.evaluate(() => window.streamMock.text());
  await page.locator('.assistant-pending strong').waitFor();
  check(await page.locator('.assistant-message.user').count() === 1, '用户消息不重复');
  await page.evaluate(() => window.streamMock.finish());
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(await node.evaluate(el => el.isConnected), '最终同步不重新挂载练习卡片');
  check(await start.count() === 1, '最终同步不重复卡片');
  check(await page.getByRole('button', { name: '跳到小节 2', exact: true }).getAttribute('aria-pressed') === 'true', '最终同步保留选中小节');
  check(await page.locator('.exercise-tempo input').inputValue() === '65', '最终同步保留卡片速度');
  check(await input.inputValue() === '下一条草稿', '保留输入草稿');
  await input.press('Enter');
  await start.nth(1).waitFor();
  await page.evaluate(() => window.streamMock.finish(true));
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(await start.count() === 2, '后续模型失败仍保留已生成卡片');
  await input.fill('再生成'); await input.press('Enter');
  await start.nth(2).waitFor();
  await page.getByRole('button', { name: '停止生成' }).click();
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(await start.count() === 3, '停止后仍保留已生成卡片');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄屏无横向溢出');
  check(errors.length === 0, errors.join('\n'));
  return { passed: true, cards: await start.count() };
}
