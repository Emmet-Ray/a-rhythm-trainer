// 用 playwright-cli run-code --filename 执行；先打开本地前端。
// 所有助手请求都在浏览器拦截，不使用真实模型或修改现有会话。
async (page) => {
  function check(value, message) { if (!value) throw new Error(message); }
  // 此脚本会应用测试草稿后离开，直接接受应用内的离开确认。
  await page.addInitScript(() => {
    window.confirm = () => true;
    window.practiceAudioContexts = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) { const context = Reflect.construct(target, args); window.practiceAudioContexts.push(context); return context; },
    });
    window.assistantNewFocusCount = 0;
    document.addEventListener('focusin', event => {
      if (event.target instanceof Element && event.target.matches('.assistant-new')) window.assistantNewFocusCount++;
    });
  });
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const exercise = { id: 'layout-exercise', title: '八分音符入门', mode: 'tapping', description: '测试练习',
    exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [1, 2].map(() => ({
      elements: Array.from({ length: 8 }, () => ({ kind: 'note', noteValue: 'eighth' })),
    })) } };
  let created = 0;
  const submissions = [];
  let messages = [];
  let releaseResponse;
  let deferResponse = false;
  const session = () => ({ id: 'layout-session', messages, is_running: false, last_run_status: messages.length ? 'completed' : null });
  await page.route('**/api/auth/me', route => route.fulfill({ json: { auth_enabled: false } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/assistant/sessions', route => { created++; return route.fulfill({ json: session() }); });
  await page.route('**/api/assistant/sessions/*', route => route.fulfill({ json: session() }));
  await page.route('**/api/assistant/sessions/*/messages', async route => {
    const body = route.request().postDataJSON();
    submissions.push(body);
    if (deferResponse) await new Promise(resolve => { releaseResponse = resolve; });
    const exerciseResult = messages.length ? null : exercise;
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
  check(await page.evaluate(() => window.assistantNewFocusCount) === 0, '首次打开首页不能自动聚焦新对话');
  await page.reload();
  await page.getByRole('heading', { name: '今天想练什么节奏？' }).waitFor();
  check(await page.evaluate(() => window.assistantNewFocusCount) === 0, '刷新首页不能自动聚焦新对话，即使随后焦点又转移');
  const panel = page.locator('#assistant-panel');
  const input = page.getByRole('textbox', { name: '向助手提问' });
  const nav = page.locator('.site-sidebar');
  check(await input.count() === 1, '首页只能有一个输入框');
  check(!await page.getByRole('navigation', { name: '练习入口', exact: true }).count(), '不重复展示传统入口');
  check(await page.locator('.assistant-input-box').getAttribute('data-multiline') === 'false', '空输入采用单行布局');
  const initialInputBox = await page.locator('.assistant-input-box').boundingBox();
  await input.fill('第一行\n第二行');
  check(await page.locator('.assistant-input-box').getAttribute('data-multiline') === 'true', '多行输入展开');
  await input.fill('');
  check(await page.locator('.assistant-input-box').getAttribute('data-multiline') === 'false', '清空后恢复单行');
  check(await page.locator('.site-sidebar-toggle').evaluate(el => {
    const box = el.getBoundingClientRect();
    return [box.left + 8, box.right - 8].every(x => el.contains(document.elementFromPoint(x, box.top + box.height / 2)));
  }), '导航折叠按钮的左右两侧都应完整可点击');
  check(!await page.getByRole('button', { name: '打开 AI 助手' }).isVisible(), '首页不显示重复助手入口');
  await page.locator('.assistant-templates summary').click();
  await page.getByRole('button', { name: '生成击拍练习', exact: true }).click();
  check((await input.inputValue()).includes('两小节'), '快捷提示应填入输入框');
  check(submissions.length === 0, '快捷提示不自动调用模型');
  await input.fill('尚未发送的文字');
  await nav.getByRole('link', { name: '预设练习', exact: true }).click();
  await page.getByRole('button', { name: '打开 AI 助手' }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'assistant-input');
  check(await input.inputValue() === '尚未发送的文字', '首页切到侧栏应保留草稿');
  check(!await panel.evaluate(el => el.matches(':modal')), '宽屏侧栏不能锁住页面');
  await nav.getByRole('link', { name: '首页', exact: true }).click();
  check(await input.inputValue() === '尚未发送的文字', '返回首页应保留草稿');
  await input.fill('给我一道两小节的击拍练习');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.locator('.exercise-card').waitFor();
  const chattingInputBox = await page.locator('.assistant-input-box').boundingBox();
  check(Math.abs(initialInputBox.width - chattingInputBox.width) < 2 && Math.abs(initialInputBox.x - chattingInputBox.x) < 2, '开始聊天前后输入框宽度和左右位置一致');
  check(!await page.getByRole('navigation', { name: '练习入口', exact: true }).count(), '开始对话后隐藏重复入口');
  check(await page.evaluate(() => {
    const title = document.querySelector('#assistant-title').getBoundingClientRect();
    const card = document.querySelector('.exercise-card').getBoundingClientRect();
    const input = document.querySelector('.assistant-input-box').getBoundingClientRect();
    return Math.abs(title.left - card.left) < 2 && Math.abs(card.left - input.left) < 2;
  }), '首页页头、消息和输入框应共用对齐线');
  check(created === 1 && submissions[0].page_context.page === 'home', '首页请求应携带当前页面并只创建一个会话');
  await page.getByRole('button', { name: '加快 5 BPM' }).click();
  await page.locator('.exercise-measure-buttons').getByRole('button', { name: '跳到小节 2', exact: true }).click();
  await input.fill('卡片切换时保留的草稿');
  const originalScroll = await page.locator('.assistant-messages').evaluate(el => el.scrollTop);
  await panel.getByRole('button', { name: '开始击拍', exact: true }).click();
  const overlay = page.getByRole('dialog', { name: exercise.title, exact: true });
  await overlay.getByRole('region', { name: '击拍训练区' }).waitFor();
  check(new URL(page.url()).pathname === '/', '练习覆盖层不能离开首页');
  check(await nav.getByRole('link', { name: '首页', exact: true }).getAttribute('aria-current') === 'page', '首页高亮保留');
  check(await overlay.evaluate(el => el.matches(':modal')), '训练必须在模态覆盖层内');
  check(await input.inputValue() === '卡片切换时保留的草稿', '进入训练不能丢输入');
  check(await page.getByRole('spinbutton', { name: '试听速度 BPM' }).inputValue() === '65', '打开覆盖层不能重置卡片 BPM');
  check(await page.locator('.exercise-measure-buttons button[aria-pressed="true"]').textContent() === '2', '打开覆盖层不能重置选中小节');
  await input.evaluate(el => el.focus());
  check(await overlay.evaluate(el => el.contains(document.activeElement)), '覆盖层隔离背景焦点');
  await overlay.evaluate(el => el.focus());
  await page.keyboard.press('l');
  await overlay.getByRole('button', { name: '停止', exact: true }).waitFor();
  await overlay.evaluate(el => el.focus());
  await page.keyboard.press('s');
  await overlay.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  await page.keyboard.press('h');
  await overlay.getByRole('button', { name: '停止', exact: true }).waitFor();
  check(await overlay.evaluate(el => !el.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }))), '模态训练接收空格击拍');
  await overlay.getByRole('button', { name: '关闭练习', exact: true }).click();
  await page.waitForFunction(() => window.practiceAudioContexts.length > 0 && window.practiceAudioContexts.every(context => context.state === 'closed'));
  check(!await overlay.count(), '关闭应卸载训练并停止音频');
  check(Math.abs(await page.locator('.assistant-messages').evaluate(el => el.scrollTop) - originalScroll) < 2, '原对话滚动位置保留');
  check(await page.evaluate(() => document.activeElement?.textContent?.includes('开始击拍')), '关闭后恢复卡片焦点');
  check(await page.evaluate(() => document.body.style.overflow) !== 'hidden', '关闭后恢复背景滚动');
  check(await input.inputValue() === '卡片切换时保留的草稿', '关闭后保留原草稿');

  // 请求等待期间切换两种布局，再放行响应，检查没有取消或创建第二个会话。
  await nav.getByRole('link', { name: '首页', exact: true }).click();
  deferResponse = true;
  await input.fill('简单一点');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor();
  await nav.getByRole('link', { name: '练习记录', exact: true }).click();
  if (await page.getByRole('button', { name: '打开 AI 助手' }).isVisible()) await page.getByRole('button', { name: '打开 AI 助手' }).click();
  check(await page.getByRole('button', { name: '停止生成', exact: true }).isVisible(), '切换页面不能中止生成');
  await nav.getByRole('link', { name: '首页', exact: true }).click();
  check(typeof releaseResponse === 'function', '延迟请求应已到达');
  releaseResponse();
  await page.getByRole('button', { name: '发送', exact: true }).waitFor();
  check(created === 1 && submissions.length === 2, '跨页面多轮应复用一个会话');
  check(await page.locator('.exercise-card').count() === 1, '切换布局不能复制卡片');

  // 编辑器仍可操作、应用；页面资料应切换为当前编辑器。
  await nav.getByRole('link', { name: '自定义练习', exact: true }).click();
  await page.getByRole('link', { name: /击拍练习/ }).click();
  await page.getByRole('link', { name: /新建练习/ }).click();
  await panel.getByRole('button', { name: '放入编辑器' }).click();
  check(await page.getByRole('textbox', { name: '练习名称' }).inputValue() === exercise.title, '侧栏应继续支持应用到编辑器');

  // 缩到手机尺寸后成为真正模态框，焦点不能进入背后的页面。
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('dialog', { name: '节奏助手' }).waitFor();
  check(await panel.evaluate(el => el.matches(':modal')), '窄屏必须模态展示');
  await page.evaluate(() => document.getElementById('main-content').focus());
  check(await panel.evaluate(el => el.contains(document.activeElement)), '模态框应阻止背景获得焦点');
  check(await page.evaluate(() => document.body.style.overflow) === 'hidden', '覆盖层应锁住背景滚动');
  await input.fill('手机草稿');
  await input.press('Escape');
  check(!await panel.isVisible(), 'Escape 应关闭窄屏助手');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '打开 AI 助手');
  await page.getByRole('button', { name: '打开 AI 助手' }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'assistant-input');
  check(await input.inputValue() === '手机草稿', '窄屏重新打开应保留输入');
  await panel.getByRole('button', { name: '开始击拍', exact: true }).click();
  await overlay.getByRole('region', { name: '击拍训练区' }).waitFor();
  check(new URL(page.url()).pathname.includes('/custom/'), '窄屏训练保留来源页');
  check(await overlay.evaluate(el => el.matches(':modal') && el.clientWidth <= innerWidth), '窄屏训练全屏且不溢出');
  await page.keyboard.press('Escape');
  check(!await overlay.count(), 'Escape 只关闭上层训练');
  check(await panel.evaluate(el => el.matches(':modal')), '关闭训练后保留原来的模态助手');
  check(await page.evaluate(() => document.body.style.overflow) === 'hidden', '下层助手仍需锁住背景滚动');
  await page.getByRole('button', { name: '收起助手', exact: true }).click();
  await page.getByRole('button', { name: '打开导航菜单' }).click();
  await page.getByRole('dialog', { name: '导航菜单' }).getByRole('link', { name: '首页', exact: true }).click();
  await input.waitFor();
  check(!await panel.evaluate(el => el.matches(':modal')), '回到首页应该恢复普通主区域');
  check(await input.inputValue() === '手机草稿', '手机返回首页应保留输入');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '手机首页不能横向溢出');
  // 听写同样在覆盖层完成，关闭与再次打开保留草稿和答案曝光状态。
  await page.setViewportSize({ width: 1440, height: 1000 });
  messages = []; deferResponse = false;
  exercise.id = 'layout-dictation'; exercise.mode = 'dictation'; exercise.title = '听写覆盖层测试';
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await input.fill('给我一道听写题');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await panel.getByRole('button', { name: '开始听写', exact: true }).click();
  const dictation = page.getByRole('dialog', { name: exercise.title, exact: true });
  await dictation.getByRole('region', { name: '节奏听写区' }).waitFor();
  check(new URL(page.url()).pathname === '/', '听写保留首页');
  await dictation.getByRole('button', { name: '查看答案', exact: true }).click();
  await dictation.getByRole('button', { name: '关闭练习', exact: true }).click();
  check(await panel.getByText('已查看答案', { exact: true }).isVisible(), '听写查看答案状态返回卡片');
  // 页面试听、卡片试听和覆盖层共享播放所有权；关闭覆盖层不恢复后台播放。
  await nav.getByRole('link', { name: '预设练习', exact: true }).click();
  await page.locator('a[href="/preset/basic-values-01"]').first().click();
  if (await page.getByRole('button', { name: '打开 AI 助手' }).isVisible()) await page.getByRole('button', { name: '打开 AI 助手' }).click();
  const background = page.locator('section[aria-label="击拍训练区"]');
  await background.getByRole('button', { name: '试听', exact: true }).click();
  await background.getByRole('button', { name: '停止', exact: true }).waitFor();
  await panel.getByRole('button', { name: '试听', exact: true }).click();
  await background.getByRole('button', { name: '试听', exact: true }).waitFor();
  await panel.getByRole('button', { name: '停止试听', exact: true }).waitFor();
  await background.getByRole('button', { name: '试听', exact: true }).click();
  await panel.getByRole('button', { name: '试听', exact: true }).waitFor();
  await background.getByRole('button', { name: '停止', exact: true }).waitFor();
  await panel.getByRole('button', { name: '开始听写', exact: true }).click();
  await dictation.getByRole('region', { name: '节奏听写区' }).waitFor();
  check(await background.getByRole('button', { name: '试听', exact: true, includeHidden: true }).count() === 1, '打开覆盖层停止后台试听');
  await dictation.getByRole('button', { name: '播放题目', exact: true }).click();
  await dictation.getByRole('button', { name: '停止', exact: true }).waitFor();
  await dictation.getByRole('button', { name: '关闭练习', exact: true }).click();
  check(await background.getByRole('button', { name: '试听', exact: true }).isVisible(), '关闭覆盖层不自动恢复后台');
  const attemptCount = () => page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('rhythm-trainer.practice-records') || '{"records":[]}');
    return data.records.filter(record => record.exerciseId === 'basic-values-01' && record.mode === 'tapping')
      .reduce((sum, record) => sum + record.attempts.length, 0);
  });
  const beforeAttempts = await attemptCount();
  // 预备拍中断不写入训练记录。
  await background.getByRole('button', { name: '击拍练习', exact: true }).click();
  await background.locator('.trainer-countdown').waitFor();
  await panel.getByRole('button', { name: '试听', exact: true }).click();
  await background.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  check(await attemptCount() === beforeAttempts, '预备拍取消不新增记录');
  await panel.getByRole('button', { name: '停止试听', exact: true }).click();
  // 正式击拍中断沿用手动停止规则，恰好记录一次未通过。
  await background.getByRole('button', { name: '击拍练习', exact: true }).click();
  await background.locator('.trainer-countdown').waitFor();
  await background.locator('.trainer-countdown').waitFor({ state: 'detached' });
  await panel.getByRole('button', { name: '试听', exact: true }).click();
  await background.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  check(await attemptCount() === beforeAttempts + 1, '正式训练中断只记录一次');
  check(await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('rhythm-trainer.practice-records'));
    return data.records.find(record => record.exerciseId === 'basic-values-01' && record.mode === 'tapping')
      .attempts.at(-1).passed === false;
  }), '中断轮次不能被记录为通过');
  await panel.getByRole('button', { name: '停止试听', exact: true }).click();
  check(errors.length === 0, `浏览器异常：${errors.join('; ')}`);
  console.log('PASS: 助手布局交互回归');
  return { passed: true, sessionsCreated: created, messagesSent: submissions.length,
    checks: '首页/侧栏/训练/编辑器/窄屏切换、草稿和卡片状态、等待中的请求、模态焦点与滚动隔离' };
}
