// 用 playwright-cli run-code --filename 执行。使用模拟助手，不调用付费模型。
async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const stamp = new Date().toISOString(), runId = Date.now();
  let entries = [], rejectNext = false;
  const submissions = [];
  const session = () => ({ id: 'activity-session', entries, is_running: false, last_run_status: entries.length ? 'completed' : null });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { auth_enabled: false } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/assistant/sessions', route => route.fulfill({ json: session() }));
  await page.route('**/api/assistant/sessions/*', route => route.fulfill({ json: session() }));
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    const body = route.request().postDataJSON(); submissions.push(body);
    if (rejectNext) { rejectNext = false; return route.fulfill({ status: 503, json: { detail: '模拟未接收' } }); }
    const mode = body.text.includes('听写') ? 'dictation' : 'tapping';
    entries.push({ type: 'user', text: body.text, page_context: body.page_context, created_at: stamp });
    if (body.text.startsWith('生成')) entries.push({ type: 'tool_result', tool_call_id: `call-${submissions.length}`, tool_name: 'propose_rhythm_exercise', content: '练习已创建', is_error: false, created_at: stamp,
      details: { generated_exercise: { id: `${runId}-${mode}`, title: mode === 'dictation' ? '活动听写 B' : '活动击拍 B', mode, description: '测试练习', exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [1, 2].map(() => ({ elements: [{ kind: 'note', noteValue: 'whole' }] })) } } } });
    entries.push({ type: 'assistant', text: '模拟分析回答', created_at: stamp });
    return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"message_completed","text":"模拟分析回答"}\n\ndata: {"type":"run_completed"}\n\n' });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/preset/basic-values-01`);
  await page.locator('section[aria-label="击拍训练区"]').waitFor();
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  const input = page.getByRole('textbox', { name: '向助手提问' });
  async function ask(text) {
    const count = submissions.length;
    await input.fill(text);
    await Promise.all([page.waitForResponse(response => response.url().includes('/messages')), input.press('Enter')]);
    await page.getByRole('button', { name: '发送', exact: true }).waitFor();
    check(submissions.length === count + 1, '只发送一次消息');
    return submissions.at(-1).page_context.state;
  }
  await ask('生成击拍');
  await page.getByRole('button', { name: '开始击拍', exact: true }).click();
  const overlay = page.locator('.generated-practice-overlay');
  await overlay.getByRole('spinbutton', { name: '速度 BPM' }).fill('240');
  await overlay.getByRole('spinbutton', { name: '速度 BPM' }).press('Enter');
  async function round() {
    await overlay.getByRole('button', { name: '击拍练习', exact: true }).click();
    await overlay.locator('.trainer-countdown').waitFor();
    await overlay.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  }
  await round(); await round();
  await overlay.getByRole('button', { name: '关闭练习', exact: true }).click();
  let state = await ask('练得怎么样');
  check(state.practice.snapshot.source === 'preset', '页面仍是预设 A');
  check(state.practice_focus.title === '活动击拍 B', '讨论对象来自刚产生的结果 B');
  check(state.practice_activity.practices[0].session.totalAttempts === 2, 'B 两轮结果进入活动');
  state = await ask('再讲一下');
  check(state.practice_activity === null && state.practice_focus.title === '活动击拍 B', '确认后不重发成绩，仍保留讨论对象');
  await page.getByRole('button', { name: '开始击拍', exact: true }).click();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'rhythm-trainer.practice-records') throw new Error('模拟存储失败'); return window.originalSetItem.call(this, key, value); };
  });
  await round();
  await overlay.getByText(/练习记录保存失败/).waitFor();
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await overlay.getByRole('button', { name: '关闭练习', exact: true }).click();
  rejectNext = true;
  state = await ask('第三轮怎么样');
  const thirdId = state.practice_activity.practices[0].session.recentAttempts[0].id;
  state = await ask('第三轮怎么样');
  check(state.practice_activity.practices[0].session.recentAttempts[0].id === thirdId, '发送失败保留同一尝试，保存失败仍能分析');
  await ask('生成听写');
  await page.getByRole('button', { name: '开始听写', exact: true }).click();
  await overlay.getByRole('spinbutton', { name: '速度 BPM' }).fill('240');
  await overlay.getByRole('spinbutton', { name: '速度 BPM' }).press('Enter');
  await overlay.getByRole('button', { name: '播放题目', exact: true }).click();
  await overlay.getByRole('button', { name: '停止', exact: true }).waitFor();
  await overlay.getByRole('button', { name: '停止', exact: true }).click();
  await overlay.getByRole('button', { name: '全音符', exact: true }).click();
  await overlay.getByRole('button', { name: '验证当前小节', exact: true }).click();
  await overlay.getByRole('button', { name: '清空当前小节', exact: true }).click();
  await overlay.getByRole('button', { name: '关闭练习', exact: true }).click();
  state = await ask('我写得怎么样');
  const hearing = state.practice_activity.practices[0];
  check(hearing.title === '活动听写 B' && !('exercise' in hearing), '听写活动不泄露标准答案');
  check(hearing.session.totalAttempts === 1, '播放、验证、编辑归同一作答');
  const attempt = hearing.session.recentAttempts[0];
  check(attempt.measures[0].verificationCount === 1 && attempt.measures[0].verdict === 'unchecked', '编辑后撤销旧正确判定');
  check(attempt.playbackSettings[0].bpm === 240 && attempt.playbackSettings[0].count === 1, '保存实际播放设置');
  check(errors.length === 0, errors.join('; '));
  return { passed: true, checks: '预设A→侧栏B→两轮击拍→关闭分析；确认/重试；存储失败；听写累计进展' };
}
