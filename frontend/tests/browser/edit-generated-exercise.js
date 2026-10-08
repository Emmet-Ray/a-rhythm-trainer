// 使用模拟接口验证跨来源编辑与保存，不调用模型、不写入本地题库。
async page => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const check = (value, message) => { if (!value) throw new Error(message); };
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: [{ kind: 'note', noteValue: 'whole' }] },
    { elements: [{ kind: 'note', noteValue: 'half' }, { kind: 'rest', noteValue: 'half' }] },
  ] };
  const proposal = { id: 'editable-ai', title: '待校正的听写', mode: 'dictation', description: '', exercise };
  let messages = [], saved = null, answerViewed = false, creates = 0, updates = 0, failSave = false;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/status')) return route.fulfill({ json: { status: 'ready', message: '' } });
    if (url.includes('/cards/')) {
      const state = route.request().postDataJSON();
      answerViewed ||= state.answer_viewed === true;
      return route.fulfill({ json: state });
    }
    if (url.includes('?offset=')) return route.fulfill({ json: { sessions: [], total: 0 } });
    if (url.endsWith('/messages')) {
      const body = route.request().postDataJSON();
      messages = [{ id: body.message_id, role: 'user', parts: [{ type: 'text', text: body.text }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'tool-propose_rhythm_exercise', toolCallId: 'c1', state: 'output-available', input: {}, output: { generated_exercise: proposal } }] }];
      const events = [{ type: 'start', messageId: 'a1' }, { type: 'start-step' },
        { type: 'tool-input-available', toolCallId: 'c1', toolName: 'propose_rhythm_exercise', input: {} },
        { type: 'tool-output-available', toolCallId: 'c1', output: { generated_exercise: proposal } }, { type: 'finish-step' }, { type: 'finish' }];
      return route.fulfill({ contentType: 'text/event-stream', body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n' });
    }
    return route.fulfill({ json: { id: 'edit-session', messages, is_running: false, last_run_status: messages.length ? 'completed' : null, model_selection: { provider: 'deepseek', model: 'test' } } });
  });
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test', supports_images: true }] }, chatgpt: { configured: false, models: [] } } }));
  await page.route('**/api/custom-exercises**', route => {
    const method = route.request().method();
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      if (failSave) return route.fulfill({ status: 503, json: {} });
      if (method === 'POST') creates++; else updates++;
      saved = { ...(method === 'POST' ? {} : saved), ...route.request().postDataJSON(), id: method === 'POST' ? `saved-${creates}` : saved.id, created_at: new Date().toISOString() };
      return route.fulfill({ status: method === 'POST' ? 201 : 200, json: saved });
    }
    const url = new URL(route.request().url());
    if (/\/saved-\d+$/.test(url.pathname)) return route.fulfill({ json: saved });
    return route.fulfill({ json: { items: saved ? [saved] : [], limit: Number(url.searchParams.get('limit')), offset: Number(url.searchParams.get('offset')) } });
  });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('textbox', { name: '向助手提问' }).fill('生成听写');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '开始听写', exact: true }).click();
  const overlay = page.locator('.generated-practice-overlay');
  const originalUrl = page.url();
  await overlay.getByRole('button', { name: '播放题目', exact: true }).waitFor();
  const practiceBounds = await overlay.boundingBox();
  await overlay.locator('.exercise-edit').click();
  const name = page.getByRole('textbox', { name: '练习名称', exact: true });
  await name.waitFor();
  check(page.url() === originalUrl && await overlay.isVisible(), 'AI 编辑离开原面板');
  check(await name.inputValue() === proposal.title, 'AI 题名没有导入');
  const editorBounds = await overlay.boundingBox();
  check(['x', 'y', 'width', 'height'].every(key => Math.abs(practiceBounds[key] - editorBounds[key]) < 1), '编辑切换改变面板位置或尺寸');
  check(await overlay.locator('header').getByRole('textbox', { name: '练习名称' }).isVisible(), '名称未复用题头位置');
  check(await overlay.locator('.practice-controls .practice-settings').isVisible(), '编辑速度控件未保持在练习控制栏');
  await page.waitForTimeout(100);
  check(answerViewed, '编辑未标记已查看答案');
  await name.fill('未保存草稿');
  await page.evaluate(() => { window.confirmCalls = 0; window.confirm = () => { window.confirmCalls++; return false; }; });
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  check(await name.inputValue() === '未保存草稿', '取消关闭丢失草稿');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  check(await name.isVisible(), '取消放弃操作仍退出了编辑');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await overlay.locator('.exercise-edit').click();
  check(await name.inputValue() === proposal.title, '取消没有恢复原题');
  await name.fill('校正后保存');
  await page.getByRole('button', { name: '清空当前小节', exact: true }).click();
  await page.getByRole('button', { name: '二分音符', exact: true }).click();
  await page.getByRole('button', { name: '二分音符', exact: true }).click();
  const editedExercise = structuredClone(exercise);
  editedExercise.measures[0].elements = [{ kind: 'note', noteValue: 'half' }, { kind: 'note', noteValue: 'half' }];
  failSave = true;
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '暂不可用' }).waitFor();
  check(await name.inputValue() === '校正后保存', '保存失败丢失草稿');
  failSave = false;
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await overlay.getByRole('heading', { name: '校正后保存', exact: true }).waitFor();
  await overlay.locator('.exercise-edit').waitFor();
  check(page.url() === originalUrl, '保存后发生跳转');
  check(JSON.stringify(saved.exercise) === JSON.stringify(editedExercise) && saved.mode === 'dictation', '保存改变导入节奏或模式');
  check(creates === 1, '没有新建副本');
  await overlay.locator('.exercise-edit').click();
  await name.fill('再次修改');
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await overlay.getByRole('heading', { name: '再次修改', exact: true }).waitFor();
  check(creates === 1 && updates === 1, '重复编辑没有更新同一副本');
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  await overlay.waitFor({ state: 'detached' });
  // 卡片只提供练习入口，编辑保留在练习面板内。
  check(await page.locator('.assistant-exercise-result').getByRole('button', { name: '编辑', exact: true }).count() === 0, 'AI 卡片仍显示编辑按钮');
  await page.getByRole('button', { name: '开始听写', exact: true }).click();
  await overlay.locator('.exercise-edit').click();
  await name.waitFor();
  check(page.url() === originalUrl && await name.inputValue() === '再次修改', '重新进入练习编辑未恢复已保存版本');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  await overlay.waitFor({ state: 'detached' });
  await page.goto('http://127.0.0.1:5173/random/tapping');
  const workspace = page.locator('.random-page');
  const note = workspace.locator('.rhythm-score .vf-notehead').first();
  await note.waitFor();
  const beforeNote = await note.boundingBox();
  await page.locator('.random-page .exercise-edit').click();
  await workspace.locator('.rhythm-answer-notation .vf-notehead').first().waitFor();
  const afterNote = await workspace.locator('.rhythm-answer-notation .vf-notehead').first().boundingBox();
  check(['width', 'height'].every(key => Math.abs(beforeNote[key] - afterNote[key]) < 2), '编辑改变音符大小');
  const controls = workspace.locator('.practice-controls');
  check(await controls.getByRole('button', { name: '增加小节' }).isVisible(), '小节增减未归入工具栏');
  check(await workspace.getByRole('group', { name: '小节导航', exact: true }).count() === 1, '出现重复小节导航');
  const measures = await controls.locator('.editor-measures').boundingBox();
  const playback = await controls.locator('.editor-playback').boundingBox();
  check(Math.abs(measures.y + measures.height / 2 - playback.y - playback.height / 2) < 2, '桌面编辑工具栏未合并为一行');
  const nameBorder = await name.evaluate(el => getComputedStyle(el).borderBottomWidth);
  check(nameBorder === '0px', '名称仍有常驻下划线');

  await name.waitFor();
  check(page.url().endsWith('/random/tapping'), '随机编辑离开原页面');
  await name.fill('随机题副本');
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.getByRole('heading', { name: '随机题副本', exact: true }).waitFor();
  check(saved.exercise.measures.length > 0 && saved.mode === 'tapping' && creates === 2, '随机题保存错误');
  await page.getByRole('button', { name: '换一题', exact: true }).click();
  await page.getByRole('heading', { name: '随机练习', exact: true }).waitFor();
  await page.goto(`http://127.0.0.1:5173/custom/tapping/${saved.id}`);
  await page.locator('.custom-detail .exercise-edit').click();
  const customUrl = page.url();
  await name.fill('自定义修改');
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.getByRole('heading', { name: '自定义修改', exact: true }).waitFor();
  check(page.url() === customUrl && creates === 2 && updates === 2, '自定义编辑未原地更新');
  check(proposal.exercise.measures[0].elements[0].noteValue === 'whole', '编辑污染原始 AI 题目');
  await page.locator('.custom-detail .exercise-edit').click();
  await name.waitFor();
  await name.fill('背景草稿');
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await page.getByRole('button', { name: '开始听写', exact: true }).click();
  await overlay.locator('.exercise-edit').click();
  await overlay.getByRole('textbox', { name: '练习名称', exact: true }).fill('面板草稿');
  await page.evaluate(() => { window.confirmCalls = 0; window.confirm = () => { window.confirmCalls++; return false; }; });
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  check(await overlay.isVisible(), '面板草稿没有关闭保护');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('button', { name: '关闭练习', exact: true }).click();
  await overlay.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '收起助手', exact: true }).click();
  await page.evaluate(() => { window.confirmCalls = 0; window.confirm = () => { window.confirmCalls++; return false; }; });
  await page.getByRole('link', { name: '题目列表', exact: true }).click();
  await page.waitForFunction(() => window.confirmCalls > 0);
  check(await name.inputValue() === '背景草稿', '面板关闭清除了背景草稿保护');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.getByRole('link', { name: '题目列表', exact: true }).click();
  await page.getByRole('link', { name: '新建练习', exact: true }).click();
  await name.fill('新建题目');
  await page.getByRole('button', { name: '全音符', exact: true }).click();
  await page.getByRole('button', { name: '跳到小节 2', exact: true }).click();
  await page.getByRole('button', { name: '全音符', exact: true }).click();
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.locator('.custom-create .exercise-edit').waitFor();
  check(page.url().endsWith('/custom/tapping/new') && creates === 3, '新建未原地切换练习');
  await page.goto('http://127.0.0.1:5173/custom/tapping/new');
  await name.fill('取消的新建题');
  await page.evaluate(() => { window.cancelChecks = 0; window.confirm = () => { window.cancelChecks++; return true; }; });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '自定义练习', exact: true }).waitFor();
  check(await page.evaluate(() => window.cancelChecks) === 1, '取消新建出现重复确认');
  check(!errors.length, errors.join('\n'));
  return 'AI 面板／卡片、随机、自定义原地编辑、取消、失败重试、另存及重复更新通过';
}
