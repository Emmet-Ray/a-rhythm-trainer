// 独立测试来源执行；会话与模型接口全部模拟，不改日常数据。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.addInitScript(() => localStorage.setItem('rhythm:assistant:v1:instance', 'a'));
  const sessions = Object.fromEntries(['a', 'b'].map(id => [id, { id, title: '会话 ' + id, updated_at: '2026-10-12T00:00:00Z',
    is_running: false, unreadable: false, last_run_status: 'completed', model_selection: { provider: 'deepseek', model: 'test' },
    messages: [{ id: id + '-u', role: 'user', parts: [{ type: 'text', text: '你好' }] }] }]));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test' }] }, chatgpt: { configured: false, models: [] } } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  let failRename = false, failDelete = false, deletes = 0;
  await page.route('**/api/assistant/sessions**', async route => {
    const parts = new URL(route.request().url()).pathname.split('/');
    if (parts.at(-1) === 'sessions') return route.fulfill({ json: { sessions: Object.values(sessions), total: Object.keys(sessions).length } });
    if (parts.at(-1) === 'title') {
      if (failRename) return route.fulfill({ status: 503, json: {} });
      const session = sessions[parts.at(-2)];
      session.title = route.request().postDataJSON().title;
      session.updated_at = '2026-10-14T00:00:00Z';
      return route.fulfill({ json: { id: session.id, title: session.title, updated_at: session.updated_at } });
    }
    if (route.request().method() === 'DELETE') { if (failDelete) return route.fulfill({ status: 503, json: {} }); deletes++; delete sessions[parts.at(-1)]; return route.fulfill({ status: 204 }); }
    return route.fulfill({ json: sessions[parts.at(-1)] });
  });
  await page.goto(origin);
  const trigger = () => page.getByRole('button', { name: '对话操作：' + sessions.a.title, exact: true });
  const menu = page.getByRole('menu');
  await page.getByRole('button', { name: '会话 a', exact: true }).focus();
  await trigger().focus(); await page.keyboard.press('ArrowDown');
  await menu.waitFor();
  check(await menu.getByRole('menuitem').count() === 2, '菜单操作数量错误');
  await page.keyboard.press('Escape');
  check(await trigger().evaluate(el => el === document.activeElement), 'Esc 后未返回操作入口');
  check(await page.locator('.assistant-history--sidebar').isVisible(), 'Esc 误关会话列表');
  async function rename() { await page.getByRole('button', { name: sessions.a.title, exact: true }).hover(); await trigger().click(); await menu.getByRole('menuitem', { name: '重命名', exact: true }).click(); }
  await rename();
  const input = page.getByRole('textbox', { name: '对话名称', exact: true });
  const dialog = page.getByRole('dialog', { name: '重命名对话', exact: true });
  check(await dialog.evaluate(el => el.matches(':modal')), '重命名未使用模态弹窗');
  check(await input.evaluate(el => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length), '未聚焦并选中名称');
  check(await page.locator('.assistant-history-open').first().isVisible(), '弹窗隐藏了列表标题');
  await input.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  check(await dialog.evaluate(el => el.contains(document.activeElement)), '焦点逃出弹窗');
  await input.focus();
  await page.waitForTimeout(220); // 等待浮层进入动效完成后检查画面。
  await page.screenshot({ path: 'output/playwright/conversation-rename-desktop.png' });
  check(await input.inputValue() === '会话 a', '没有预填名称');
  await input.fill('   ');
  check(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), '允许空名称');
  await input.fill('我的节奏训练'); failRename = true;
  await input.press('Enter'); await page.getByRole('alert').waitFor();
  check(await input.inputValue() === '我的节奏训练', '保存失败丢失草稿');
  failRename = false; await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '我的节奏训练', exact: true }).waitFor();
  await page.reload(); await page.getByRole('button', { name: sessions.a.title, exact: true }).waitFor();
  await rename(); await input.fill('取消的名称'); await input.press('Escape');
  check(sessions.a.title === '我的节奏训练', '取消编辑修改正式名称');
  await trigger().click(); await page.getByRole('heading', { name: '节奏助手', exact: true }).click();
  check(await menu.count() === 0, '点击外部未关闭菜单');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开会话列表', exact: true }).click();
  await page.getByRole('button', { name: sessions.a.title, exact: true }).hover();
  await trigger().click(); await page.keyboard.press('Escape');
  check(await page.locator('.assistant-history--sidebar').isVisible(), '窄屏 Esc 误关列表');
  await rename();
  const dialogBox = await dialog.boundingBox();
  check(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390, '重命名弹窗超出窄屏');
  await page.waitForTimeout(220); // 等待浮层进入动效完成后检查画面。
  await page.screenshot({ path: 'output/playwright/conversation-rename-mobile.png' });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  check(await page.locator('.assistant-history--sidebar').isVisible(), '取消重命名误关列表');
  await rename(); await input.fill('窄屏训练'); await input.press('Enter');
  await page.getByRole('button', { name: '窄屏训练', exact: true }).waitFor();
  await trigger().click();
  const box = await menu.boundingBox(); check(box.x >= 0 && box.x + box.width <= 390, '菜单超出视口');
  await page.waitForTimeout(220); // 等待浮层进入动效完成后检查画面。
  await page.screenshot({ path: 'output/playwright/conversation-menu-mobile.png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.getByRole('link', { name: '关于', exact: true }).click();
  await page.getByRole('heading', { name: '关于', exact: true }).waitFor();
  const opener = page.getByRole('button', { name: '打开 AI 助手', exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.getByRole('button', { name: '历史对话', exact: true }).click();
  await rename();
  await page.getByRole('button', { name: '关闭重命名', exact: true }).click();
  await rename(); await input.fill('浮层训练'); await input.press('Enter');
  await page.getByRole('button', { name: '浮层训练', exact: true }).waitFor();
  await trigger().click();
  await page.waitForTimeout(220); // 等待浮层进入动效完成后检查画面。
  await page.screenshot({ path: 'output/playwright/conversation-menu-popover.png' });
  await menu.getByRole('menuitem', { name: '删除', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: '删除对话', exact: true });
  check(await deletion.evaluate(el => el.matches(':modal')), '删除未使用模态弹窗');
  check(await deletion.getByRole('button', { name: '取消', exact: true }).evaluate(el => el === document.activeElement), '删除弹窗未聚焦取消');
  const deleteButtonBox = await deletion.getByRole('button', { name: '删除', exact: true }).boundingBox();
  check(deleteButtonBox.width > deleteButtonBox.height, '删除按钮被历史工具栏样式挤窄');
  await page.waitForTimeout(220); // 等待浮层进入动效完成后检查画面。
  await page.screenshot({ path: 'output/playwright/conversation-delete.png' });
  await deletion.getByRole('button', { name: '取消', exact: true }).click();
  check(deletes === 0, '取消确认仍删除会话');
  await trigger().click();
  await menu.getByRole('menuitem', { name: '删除', exact: true }).click();
  await page.keyboard.press('Escape');
  check(deletes === 0, 'Esc 仍删除会话');
  await trigger().click(); await menu.getByRole('menuitem', { name: '删除', exact: true }).click();
  failDelete = true;
  await deletion.getByRole('button', { name: '删除', exact: true }).click();
  await deletion.getByRole('alert').waitFor();
  check(deletes === 0 && await deletion.isVisible(), '删除失败未保留弹窗');
  failDelete = false;
  await deletion.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '浮层训练', exact: true }).waitFor({ state: 'detached' });
  check(deletes === 1, '未删除会话');
  await page.evaluate(() => { window.conversationActionsPassed = true; });
  return '菜单键盘/外部关闭、重命名/取消/失败重试/刷新、窄屏/浮层、删除确认通过';
}
