// playwright-cli run-code --filename 执行，助手会话使用模拟数据
async page => {
  const check = (value, message) => { if (!value) throw Error(message); };
  const origin = new URL(page.url()).origin;
  const proposal = { id: 'responsive', title: '两小节入门节奏听写', description: '', mode: 'dictation',
    exercise: { timeSignature: { beats: 4, beatType: 4 }, measures: [1, 2].map(() => ({ elements: [{ kind: 'note', noteValue: 'whole' }] })) } };
  await page.route(`${origin}/api/assistant/**`, route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/status') ? { status: 'ready', message: '' }
      : path.endsWith('/sessions') ? { sessions: [], total: 0 }
      : path.includes('/cards/') ? route.request().postDataJSON()
      : { id: 'responsive', is_running: false, last_run_status: 'completed', messages: Array.from({length: 5}, (_, i) => ({ id: `reply-${i}`, role: 'assistant',
        parts: [{type: 'text', text: '这是一段较长的回复，用于检查窄屏文字换行和滚动位置 '.repeat(12)},
          { type: 'tool-propose_rhythm_exercise', toolCallId: `call-${i}`, state: 'output-available', input: {}, output: { generated_exercise: {...proposal, id: `exercise-${i}`} } }] })) } });
  });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 850 });
    for (const path of ['/custom/tapping/new', '/random/tapping', '/random/dictation']) {
      await page.goto(origin + path);
      if (path.includes('custom')) await page.getByRole('textbox', {name: '练习名称', exact: true}).waitFor();
      else {
        const trigger = page.getByRole('button', {name: '生成设置', exact: true});
        await trigger.click();
        const drawer = page.locator('.random-settings-drawer');
        check(await drawer.evaluate(e => e.scrollWidth <= e.clientWidth), '设置抽屉不横向溢出');
        await page.keyboard.press('Escape');
        check(await trigger.evaluate(e => e === document.activeElement), '关闭设置返回入口');
      }
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${path} 横向溢出`);
    }
  }
  await page.evaluate(() => localStorage.setItem('rhythm:assistant:v1:instance', 'responsive'));
  await page.setViewportSize({width: 390, height: 850});
  await page.goto(origin);
  await page.getByRole('button', {name: '查看答案', exact: true}).last().waitFor();
  const toggle = page.getByRole('button', {name: '展开会话列表', exact: true});
  await toggle.click();
  const close = page.getByRole('button', {name: '收起会话列表', exact: true});
  check(await close.evaluate(e => e === document.activeElement), '打开会话列表应进入列表');
  await page.keyboard.press('Shift+Tab');
  check(await page.locator('.assistant-session-sidebar').evaluate(e => e.contains(document.activeElement)), '反向 Tab 留在列表');
  await page.keyboard.press('Tab');
  check(await close.evaluate(e => e === document.activeElement), '正向 Tab 回到列表首项');
  await page.keyboard.press('Escape');
  check(await toggle.evaluate(e => e === document.activeElement), '关闭会话列表返回入口');
  check(await page.locator('#assistant-panel').getAttribute('inert') === null, '正文恢复交互');
  await page.getByRole('button', {name: '查看答案', exact: true}).last().click();
  await page.locator('.exercise-card-score svg').waitFor();
  const input = page.getByRole('textbox', {name: '向助手提问'});
  await input.fill('第一行\n第二行\n第三行');
  check(await input.evaluate(e => e.getBoundingClientRect().bottom <= innerHeight), '多行输入框仍在视口内');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '长消息和卡片不导致页面横向溢出');
  await toggle.click();
  await page.setViewportSize({width: 1200, height: 850});
  await page.waitForFunction(() => !document.querySelector('#assistant-panel').inert);
  check(await page.locator('.assistant-shell').getAttribute('data-mobile-history') === 'false', '宽屏关闭覆盖模式');
  return {passed: true};
}
