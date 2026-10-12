// 用 playwright-cli run-code --filename 执行；先打开本地前端。
// 所有助手请求都在浏览器拦截，不使用真实模型或修改现有会话。
async (page) => {
  function check(value, message) { if (!value) throw new Error(message); }
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => localStorage.removeItem('rhythm:assistant:v1:instance'));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: {
    provider: 'deepseek', deepseek: { configured: true, model: 'test-model', models: [{ id: 'test-model', name: '测试模型', supports_images: true }] },
    chatgpt: { configured: false, model: '', models: [] },
  } }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const exercise = { id: 'layout-exercise', title: '八分音符入门', mode: 'tapping', description: '测试练习',
    exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [1, 2].map(() => ({
      elements: Array.from({ length: 8 }, () => ({ kind: 'note', noteValue: 'eighth' })),
    })) } };
  const runId = Date.now();
  const submissions = [];
  let messages = [];
  const session = () => ({ id: 'layout-session', messages, is_running: false, model_selection: { provider: 'deepseek', model: 'test-model' }, last_run_status: messages.length ? 'completed' : null });
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/assistant/sessions', route => route.fulfill({ json: session() }));
  await page.route('**/api/assistant/sessions/*', route => route.fulfill({ json: session() }));
  await page.route('**/api/assistant/sessions/*/cards/*', route => route.fulfill({ json: route.request().postDataJSON() }));
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    const body = route.request().postDataJSON();
    submissions.push(body);
    const exerciseResult = messages.length && !body.text.includes('再出') ? null : { ...exercise, id: `insight-${runId}-${submissions.length}` };
    messages.push({ id: body.message_id, role: 'user', parts: [{ type: 'text', text: body.text }],
      metadata: { created_at: new Date().toISOString(), page_context: body.page_context } });
    const id = `answer-${messages.length}`, callId = `call-${messages.length}`;
    const parts = [{ type: 'step-start' }];
    const events = [{ type: 'start', messageId: id }, { type: 'start-step' }];
    if (exerciseResult) {
      parts.push({ type: 'tool-propose_rhythm_exercise', toolCallId: callId, state: 'output-available', input: {}, output: { generated_exercise: exerciseResult } });
      events.push({ type: 'tool-input-available', toolName: 'propose_rhythm_exercise', toolCallId: callId, input: {} },
        { type: 'tool-output-available', toolCallId: callId, output: { generated_exercise: exerciseResult } });
    }
    parts.push({ type: 'text', text: '先慢速跟着稳定的拍点练习。', state: 'done' });
    messages.push({ id, role: 'assistant', parts });
    events.push({ type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: '先慢速跟着稳定的拍点练习。' },
      { type: 'text-end', id: 't1' }, { type: 'finish-step' }, { type: 'finish' });
    return route.fulfill({ contentType: 'text/event-stream',
      body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n' });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin);
  await page.getByRole('heading', { name: '今天想练什么节奏？' }).waitFor();
  const input = page.getByRole('textbox', { name: '向助手提问' });
  async function ask(text) {
    await page.waitForFunction(() => document.querySelector("#assistant-input")?.placeholder !== "可以继续输入，回答结束后发送…");
    await input.fill(text);
    await page.waitForFunction(() => document.querySelector('button[aria-label="发送"]')?.disabled === false);
    await Promise.all([page.waitForResponse(r => r.url().includes('/messages')), input.press('Enter')]);
    await page.waitForFunction(() => document.querySelector("#assistant-input")?.placeholder !== "可以继续输入，回答结束后发送…");
  }
  await ask('给我一道击拍题');
  await page.getByRole('button', { name: '开始击拍', exact: true }).click();
  const overlay = page.locator('.generated-practice-overlay');
  const speed = overlay.getByRole('spinbutton', { name: '速度 BPM' });
  await speed.fill('240'); await speed.press('Enter');
  for (let i = 0; i < 2; i++) {
    await overlay.getByRole('button', { name: '击拍练习', exact: true }).click();
    await overlay.locator('.trainer-countdown').waitFor();
    await overlay.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  }
  await overlay.getByRole('button', { name: '关闭练习', exact: true }).click();
  await overlay.waitFor({ state: 'hidden' });
  check(await page.locator('.assistant-composer').getByText(/^(最近|当前|刚才)练习：/).count() === 0, '输入框不显示练习上下文说明');
  await ask('练得怎么样');
  let practice = submissions.at(-1).page_context.state.practice;
  check(practice.scope === 'recent', '关闭后仍引用刚才练习');
  check(practice.snapshot.session.totalAttempts === 2, '本次两轮都进入上下文');
  check(practice.snapshot.history.totalAttempts === 0, '本次已保存轮次不能重复计入历史');
  check(practice.snapshot.session.recentAttempts.every(a => a.bpm === 240 && a.detailAvailability === 'timing'), '实际速度与判定明细');
  check(practice.snapshot.session.recentAttempts.every(a => a.positions.some(p => p.measure === 2)), '位置映射到小节');
  await ask('针对这个问题再出一道');
  check(submissions.at(-1).page_context.state.practice.snapshot.session.totalAttempts === 2, '出题继续携带同一分析依据');
  await page.getByRole('button', { name: '开始击拍', exact: true }).last().click();
  await overlay.getByRole('button', { name: '关闭练习', exact: true }).click();
  // 重新进入同题页面：前一次访问成为同题历史。
  await page.goto(`${origin}/preset/basic-values-01`);
  const workspace = page.locator('section[aria-label="击拍训练区"]');
  await workspace.getByRole('spinbutton', { name: '速度 BPM' }).fill('240');
  await workspace.getByRole('spinbutton', { name: '速度 BPM' }).press('Enter');
  await workspace.getByRole('button', { name: '击拍练习', exact: true }).click();
  await workspace.locator('.trainer-countdown').waitFor();
  await workspace.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  await page.reload();
  await workspace.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await ask('练得怎么样');
  practice = submissions.at(-1).page_context.state.practice;
  check(practice.scope === 'current' && practice.snapshot.session.totalAttempts === 0, '新访问没有本次轮次');
  check(practice.snapshot.history.totalAttempts >= 1, '自动读取同题历史');
  await page.goto(`${origin}/preset/dictation-basic-values-01`);
  await page.locator('section[aria-label="节奏听写区"]').waitFor();
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await ask('这道题怎么练');
  practice = submissions.at(-1).page_context.state.practice;
  check(practice.snapshot.mode === 'dictation' && !('exercise' in practice.snapshot), '听写隐藏标准答案');
  check(Array.isArray(practice.snapshot.currentAnswer), '听写提供用户作答');
  check(errors.length === 0, `浏览器异常：${errors.join('; ')}`);
  return { passed: true, messages: submissions.length, checks: '两轮判定、覆盖层引用、针对出题请求、同题历史、听写保密' };
}
