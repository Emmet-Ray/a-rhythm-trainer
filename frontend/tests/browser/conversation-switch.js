// 模拟文本/图片模型间切换，逐帧检查列表样式、输入框反馈与正文位置。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.addInitScript(() => localStorage.setItem('rhythm:assistant:v1:instance', 'a'));
  const selection = { provider: 'deepseek', model: 'test' };
  const sessions = Object.fromEntries(['a', 'b', 'c'].map(id => [id, {
    id, title: '会话 ' + id, unreadable: false, is_running: false, last_run_status: 'completed', model_selection: id === "b" ? { ...selection, model: "vision" } : selection,
    updated_at: '2026-10-12T00:00:00Z', messages: Array.from({ length: id === 'c' ? 1 : 30 }, (_, i) => ({
      id: id + i, role: i % 2 ? 'assistant' : 'user', parts: [{ type: 'text', text: `${id}-${i} ` + '这是用于检查会话滚动位置的消息。'.repeat(8) }],
    })),
  }]));
  sessions.b.messages[0].parts.push({ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' });
  for (const id of ['a', 'b']) {
    const proposal = { id: 'exercise-' + id, title: '练习 ' + id, description: '', mode: 'tapping', exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: Array.from({length: id === 'a' ? 4 : 8}, () => ({elements:[{kind:'note',noteValue:'whole'}]})) } };
    sessions[id].card_states = { [proposal.id]: { bpm: 60, answer_viewed: true } };
    sessions[id].messages.at(-1).parts.push({type:'tool-propose_rhythm_exercise',toolCallId:'card-'+id,state:'output-available',input:{},output:{generated_exercise:proposal}}, {type:'text',text: id === 'a' ? '只有一行说明。' : '这段说明需要分成多行展示。'.repeat(9)});
  }
  await page.route('**/api/model-connections**' , route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Text', supports_images: false }, { id: 'vision', name: 'Vision', supports_images: true }] }, chatgpt: { configured: false, models: [] } } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  let hold = false, receive;
  await page.route('**/api/assistant/sessions**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/sessions')) return route.fulfill({ json: { sessions: Object.values(sessions), total: 3 } });
    const session = sessions[url.pathname.split('/').at(-1)];
    if (!hold) return route.fulfill({ json: session });
    return new Promise(resolve => receive(async fail => { await route.fulfill(fail ? { status: 503, json: { detail: '测试读取失败' } } : { json: session }); resolve(); }));
  });
  await page.goto(origin + '/');
  const log = page.getByRole('log', { name: '对话记录' });
  await log.getByText(/^a-29 /).waitFor();
  await log.locator('.exercise-card-score svg').first().waitFor();
  await page.waitForTimeout(200);
  await log.evaluate(el => { el.scrollTop = 120; el.dispatchEvent(new Event('scroll')); });
  async function switchTo(id, fail = false) {
    const hadError = await page.getByRole("alert").count() > 0;
    const rowOrder = await page.locator('.assistant-history-open').allTextContents();
    const before = await log.evaluate(el => ({ text: el.textContent, height: el.clientHeight, top: el.scrollTop, composerY: document.querySelector(".assistant-composer").getBoundingClientRect().y }));
    await log.evaluate(el => {
      window.switchFrames = [];
      window.recordSwitch = true;
      const sample = () => {
        if (!window.recordSwitch) return;
        const flashedIcons = matchMedia('(hover: hover)').matches ? [...document.querySelectorAll('.assistant-history--sidebar li')]
          .filter(row => !row.matches(':hover, :focus-within'))
          .filter(row => { const style = getComputedStyle(row.querySelector('.assistant-history-actions')); return style.visibility !== 'hidden' && Number(style.opacity) > 0; }).length : 0;
        window.switchFrames.push({
          cardY: el.querySelector('.exercise-card')?.getBoundingClientRect().y,
          focusedInput: document.activeElement?.matches('textarea'),
          deleteOpacity: [...document.querySelectorAll('.assistant-history--sidebar li:hover .assistant-history-actions')].map(e=>getComputedStyle(e).opacity),
          composerY: document.querySelector('.assistant-composer').getBoundingClientRect().y,
          placeholder: document.querySelector('textarea').placeholder,
          imageError: [...document.querySelectorAll('.assistant-error')].some(e => e.textContent.includes('请选择支持图片的模型')),
          fadedRows: [...document.querySelectorAll('.assistant-history-open:not(:disabled)')].some(e => getComputedStyle(e).opacity !== '1'),
          text: el.textContent.slice(0, 2), gap: el.scrollHeight - el.clientHeight - el.scrollTop, flashedIcons });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    hold = true;
    const arriving = new Promise(resolve => { receive = resolve; });
    await page.getByRole('button', { name: new RegExp('^会话 ' + id) }).click();
    const finish = await arriving;
    await page.waitForTimeout(400); // 跨过延迟提示门槛，验证慢请求也不挤动内容。
    const pending = await log.evaluate(el => ({ text: el.textContent, height: el.clientHeight, top: el.scrollTop, composerY: document.querySelector(".assistant-composer").getBoundingClientRect().y }));
    check(pending.text === before.text, '切换期间丢失旧消息');
    // 清除上次错误提示会释放其占位；读取提示本身不得改变消息区尺寸。
    if (!hadError) check(pending.height === before.height, `读取提示改变消息区高度：${before.height} → ${pending.height}`);
    check(Math.abs(pending.top - before.top) < 2, '读取期间移动旧会话位置');
    hold = false; await finish(fail);
    if (fail) {
      await page.getByRole('alert').waitFor();
      check(await log.textContent() === before.text, '失败后丢失旧会话');
    } else {
      await log.getByText(new RegExp(`^${id}-${id === 'c' ? 0 : 29} `)).waitFor();
      await page.waitForTimeout(250); // 覆盖焦点、模型能力同步及切换后的多帧。
      const samples = await page.evaluate(() => window.switchFrames);
      check(samples.some(sample => sample.text === id + '-'), '未采集到切换帧');
      check(samples.filter(sample => sample.text === id + '-').every(sample => Math.abs(sample.gap) < 2), '新会话先显示错误位置再跳到底部');
    }
    const allFrames = await page.evaluate(() => { window.recordSwitch = false; return window.switchFrames; });
    check(allFrames.every(frame => frame.flashedIcons === 0), '未悬停或聚焦的会话行闪出操作图标');
    check(allFrames.every(frame => frame.deleteOpacity.every(opacity=>opacity === '1')), '悬停行操作图标在切换中改变透明度');
    check(allFrames.every(frame => !frame.focusedInput), '历史切换自动聚焦输入框');
    if (!fail && ['a','b'].includes(id)) {
      const cardFrames = allFrames.filter(frame => frame.text === id + '-' && frame.cardY !== undefined);
      check(Math.max(...cardFrames.map(f=>f.cardY)) - Math.min(...cardFrames.map(f=>f.cardY)) < 2, '新会话练习卡片在出现后跳动');
    }
    check(allFrames.every(frame => !frame.fadedRows), '切换时会话选项集体变灰');
    check(allFrames.every(frame => !frame.placeholder.includes('回答结束后发送')), '历史读取被误报为模型生成');
    check(allFrames.every(frame => !frame.imageError), '切换时用旧模型能力误报图片错误');
    if (!fail && !hadError) check(allFrames.every(frame => Math.abs(frame.composerY - before.composerY) < 2), '切换期间输入框跳动');
    if (await page.locator('.assistant-history--sidebar').isVisible()) check(JSON.stringify(await page.locator('.assistant-history-open').allTextContents()) === JSON.stringify(rowOrder), '相同时间戳的会话因切换而重排');
    check(allFrames.every(frame => frame.text !== ''), '切换期间正文出现空白帧');
  }
  await switchTo('b');
  await switchTo('c');
  await switchTo('a', true);
  await switchTo('a');
  await page.mouse.move(1400, 840);
  const row = page.locator('.assistant-history--sidebar li').first();
  await row.locator('.assistant-history-open').focus();
  check(await row.locator('.assistant-history-actions').isVisible(), '键盘聚焦会话时操作入口不可见');
  await row.locator('.assistant-history-open').press('Tab');
  check(await row.locator('.assistant-history-actions').evaluate(el => el === document.activeElement), '键盘无法进入操作按钮');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开会话列表', exact: true }).click();
  await switchTo('b');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '展开会话列表', exact: true }).click();
  await switchTo('c');
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.getByRole('link', { name: '关于', exact: true }).click();
  await page.getByRole('heading', { name: '关于', exact: true }).waitFor();
  const opener = page.getByRole('button', { name: '打开 AI 助手', exact: true });
  if (await opener.isVisible()) await opener.click();
  // 历史入口多了一层定位容器，通用图标按钮规则不能覆盖文字按钮宽度。
  const historyTrigger = page.getByRole('button', { name: '历史对话', exact: true });
  for (const width of [1440, 1100, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await historyTrigger.waitFor();
    // 响应式侧栏会在媒体查询变化后重新布局，等待最终尺寸。
    await page.waitForFunction(() => {
      const header = document.querySelector('.assistant-heading');
      return header && header.scrollWidth <= header.clientWidth;
    });
    const layout = await historyTrigger.evaluate(button => {
      const text = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
      const range = document.createRange(); range.selectNodeContents(text);
      const box = button.getBoundingClientRect();
      return { lines: range.getClientRects().length, width: box.width, height: box.height,
        overflow: button.scrollWidth > button.clientWidth,
        headerOverflow: button.closest('.assistant-heading').scrollWidth > button.closest('.assistant-heading').clientWidth };
    });
    check(layout.lines === 1 && !layout.overflow && !layout.headerOverflow && layout.width > layout.height,
      `历史对话按钮换行或工具栏溢出：${width}px ${JSON.stringify(layout)}`);
  }
  await page.setViewportSize({ width: 1440, height: 850 });
  await historyTrigger.click();
  await switchTo('b');
  // 真正不兼容的模型仍须提示并阻止发送，不能用隐藏错误来消除跳动。
  await page.getByRole('button', { name: '历史对话', exact: true }).click();
  await switchTo('c');
  sessions.b.model_selection = selection;
  await page.getByRole('button', { name: '历史对话', exact: true }).click();
  await page.getByRole('button', { name: /^会话 b/ }).click();
  await page.getByText('请选择支持图片的模型', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: '向助手提问' }).fill('继续解释');
  check(await page.getByRole('button', { name: '发送', exact: true }).isDisabled(), '图片与模型不兼容时仍可发送');
  return '操作图标无集体闪现、键盘入口、正文无空白帧、慢请求布局与首帧定位、失败重试和窄屏/侧边助手通过';
}
