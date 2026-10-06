// playwright-cli run-code --filename；拦截模型请求，检查真实页面发送的上下文。
async (page) => {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let messages = [];
  const requests = [];
  const session = () => ({ id: 'pages', messages, is_running: false, last_run_status: messages.length ? 'completed' : null });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { auth_enabled: false } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/assistant/sessions', route => { messages = []; return route.fulfill({ json: session() }); });
  await page.route('**/api/assistant/sessions/*', route => route.fulfill({ json: session() }));
  await page.route('**/api/assistant/sessions/*/messages', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const exerciseResult = null;
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
    parts.push({ type: 'text', text: '收到', state: 'done' });
    messages.push({ id, role: 'assistant', parts });
    events.push({ type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: '收到' },
      { type: 'text-end', id: 't1' }, { type: 'finish-step' }, { type: 'finish' });
    return route.fulfill({ contentType: 'text/event-stream',
      body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n' });
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  async function visit(path) {
    await page.goto(origin + path);
    await page.locator('#main-content h1, #main-content .practice-titlebar, #main-content .not-found').first().waitFor();
    await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
    await page.getByRole('textbox', { name: '向助手提问' }).waitFor();
  }
  async function ask() {
    const input = page.getByRole('textbox', { name: '向助手提问' });
    await input.fill('解释当前页面');
    await Promise.all([page.waitForResponse(r => r.url().includes('/messages')), input.press('Enter')]);
    await page.getByRole('button', { name: '发送', exact: true }).waitFor();
    return requests.at(-1).page_context;
  }
  // 原生模态打开后助手位于 inert 背景；预填草稿后触发既有 submit handler，验证快照而不改变焦点规则。
  async function askUnderDialog() {
    await Promise.all([page.waitForResponse(r => r.url().includes('/messages')), page.locator('#assistant-input').evaluate(el => el.closest('form').requestSubmit())]);
    await page.getByRole('button', { name: '发送', exact: true }).waitFor();
    return requests.at(-1).page_context;
  }
  await visit('/random');
  check((await ask()).page === 'random_index', '随机入口');
  await visit('/random/dictation');
  let c = await ask();
  check(c.state.generationSettings.materials.length > 0 && c.state.practice.snapshot.metronomeEnabled === true, '生成条件与节拍器');
  check(!Object.hasOwn(c.state.practice.snapshot, 'exercise'), '听写隐藏答案');
  await page.getByRole('textbox', { name: '向助手提问' }).fill('解释生成设置');
  await page.getByRole('button', { name: '生成设置', exact: true }).click();
  await page.getByRole('radio', { name: '4 小节', exact: true }).check();
  c = await askUnderDialog();
  check(c.state.settingsOpen && c.state.generationSettings.measureCount === 4, '更新后的生成条件');
  check(c.state.practice.snapshot.measureCount !== 4, '尚未换题不能改变当前题目');
  await page.getByRole('button', { name: '关闭生成设置', exact: true }).click();

  await visit('/preset');
  c = await ask();
  check(c.page === 'preset_catalog' && c.state.questions.length && c.state.topics.length, '预设目录');
  check(!JSON.stringify(c.state.questions).includes('elements'), '目录不传答案');
  const questionId = c.state.questions[0].id;
  await visit('/preset/' + questionId);
  c = await ask();
  check(c.page === 'preset_practice' && c.state.position === 1 && c.state.topic.id, '预设导航');

  await page.evaluate(async () => {
    const { saveCustomExercise, clearCustomExercises } = await import('/src/exercises/customExercises.ts');
    const { savePracticeActions, clearPracticeRecords } = await import('/src/practice-records/practiceRecordStorage.ts');
    const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [{ elements: [{ kind: 'note', noteValue: 'whole' }] }] };
    clearCustomExercises(); clearPracticeRecords();
    saveCustomExercise({ mode: 'tapping', name: '上下文测试题', exercise });
    const actions = Array.from({ length: 12 }, (_, i) => ({ mode: 'tapping', attempt: { id: 'context-' + i, completedAt: new Date().toISOString(), bpm: 60, timingWindows: { perfectMs: 50, hitMs: 150 }, passed: true, targetCount: 1, hitCount: 1, missCount: 0, wrongTapCount: 0 } }));
    savePracticeActions({ source: 'custom', exerciseId: 'context', title: '上下文测试记录' }, exercise, 'tapping', actions);
  });
  await visit('/custom'); check((await ask()).page === 'custom_index', '自定义入口');
  await visit('/custom/tapping'); c = await ask();
  check(c.page === 'custom_library' && c.state.items.some(i => i.name === '上下文测试题' && i.measureCount === 1), '自定义摘要');
  check(!JSON.stringify(c.state.items).includes('elements'), '列表只传摘要');

  await visit('/records'); c = await ask();
  check(c.page === 'practice_records' && c.state.overview.count >= 12, '记录统计');
  await page.getByRole('button', { name: '近 7 天', exact: true }).click();
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  c = await ask(); check(c.state.filter.period === 'week' && c.state.filter.mode === 'tapping', '筛选同步');
  await page.getByRole('textbox', { name: '向助手提问' }).fill('解释详情');
  await page.getByRole('button', { name: '查看详情：“上下文测试记录”的练习记录' }).click();
  c = await askUnderDialog();
  check(c.state.filter.period === 'week' && c.state.recordDetail.period === 'all' && c.state.recordDetail.totalAttempts === 12, '详情与筛选并存');
  check(c.state.recordDetail.summary.session.recentAttempts.length === 10, '详情按当前页');
  await page.getByRole('button', { name: '关闭记录详情' }).click();
  c = await ask(); check(!Object.hasOwn(c.state, 'recordDetail'), '详情关闭移除');

  await visit('/settings?category=tapping-precision');
  await page.getByRole('radio', { name: '严格', exact: true }).check();
  c = await ask(); check(c.state.tappingPrecision.selected === 'strict', '精度设置同步');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.getByRole('radio', { name: '蓝色', exact: true }).check();
  c = await ask(); check(c.state.category === 'appearance' && c.state.appearance.theme === 'blue' && !Object.hasOwn(c.state, 'tappingPrecision'), '子设置切换无残留');
  await page.getByRole('button', { name: '本地数据', exact: true }).click();
  await page.getByRole('heading', { name: '自定义题库', exact: true }).waitFor();
  c = await ask(); check(c.state.localExercises.summary.total >= 1 && c.state.localRecords.attemptCount >= 12, '本地数据摘要');
  await page.getByRole('button', { name: '账号', exact: true }).click();
  await page.getByRole('heading', { name: '账号', exact: true }).waitFor();
  c = await ask(); check(!Object.hasOwn(c.state, 'localRecords') && !Object.hasOwn(c.state, 'localExercises'), '离开分类移除数据');
  check(!JSON.stringify(c).includes('password') && !JSON.stringify(c).includes('api_key'), '不提供凭证字段');
  await visit('/about'); check((await ask()).page === 'about', '关于');
  await visit('/missing-context-page'); check((await ask()).page === 'not_found', '不存在页面');
  check(errors.length === 0, errors.join('\n'));
  return { passed: true, requests: requests.length };
}
