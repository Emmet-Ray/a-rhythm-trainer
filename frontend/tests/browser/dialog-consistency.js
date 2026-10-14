// 独立测试后端；只模拟模型配置，验证共享弹窗与嵌套确认。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1440, height: 900 });
  let removed = 0;
  const connections = { provider: 'deepseek', deepseek: { configured: true, models: [], model: '' }, chatgpt: { configured: true, account: 'test', models: [], model: '' } };
  await page.route('**/api/model-connections**', route => {
    if (route.request().method() === 'DELETE') {
      removed++;
      if (route.request().url().endsWith('/deepseek/key')) connections.deepseek.configured = false;
      else { connections.chatgpt.configured = false; return route.fulfill({ json: { connections, message: '授权已移除' } }); }
    }
    return route.fulfill({ json: connections });
  });
  await page.goto(origin + '/settings?category=models');
  const dialog = title => page.getByRole('dialog', { name: title, exact: true });
  for (const [provider, action] of [['DeepSeek', '移除 API Key'], ['ChatGPT', '移除授权']]) {
    await page.getByRole('button', { name: '管理 ' + provider, exact: true }).click();
    await dialog(provider).getByRole('button', { name: action, exact: true }).click();
    const confirmation = dialog(provider === 'DeepSeek' ? '移除 API Key' : '移除 ChatGPT 授权');
    check(await confirmation.evaluate(el => el.matches(':modal')), '确认未处于顶层');
    check(await page.evaluate(() => document.body.style.overflow === 'hidden'), '嵌套弹窗未锁滚动');
    await page.keyboard.press('Escape');
    await confirmation.waitFor({ state: 'detached' });
    check(await dialog(provider).isVisible(), 'Esc 关闭了外层');
    check(await page.evaluate(() => document.body.style.overflow === 'hidden'), '内层关闭提前释放滚动锁');
    check(removed === (provider === 'DeepSeek' ? 0 : 1), '取消执行了移除');
    await dialog(provider).getByRole('button', { name: action, exact: true }).click();
    await confirmation.getByRole('button', { name: '移除', exact: true }).click();
    await dialog(provider).waitFor({ state: 'detached' });
    check(await page.evaluate(() => document.body.style.overflow !== 'hidden'), '退出后残留滚动锁');
  }
  await page.goto(origin + '/custom/tapping/new');
  await page.getByRole('textbox', { name: '练习名称', exact: true }).fill('草稿');
  await page.getByRole('button', { name: '跳到小节 2', exact: true }).click();
  await page.getByRole('button', { name: '四分音符', exact: true }).click();
  await page.getByRole('button', { name: /删除.*小节|减少小节/ }).click();
  const deletion = dialog('删除第 2 小节');
  await deletion.getByRole('button', { name: '取消', exact: true }).click();
  await deletion.waitFor({ state: 'detached' });
  check(await page.getByRole('button', { name: '跳到小节 2', exact: true }).count() === 1, '取消删除仍移除小节');
  await page.getByRole('button', { name: /删除.*小节|减少小节/ }).click();
  await deletion.getByRole('button', { name: '删除', exact: true }).click();
  check(await page.getByRole('button', { name: '跳到小节 2', exact: true }).count() === 0, '确认未删除小节');
  await page.getByRole('link', { name: '关于', exact: true }).click();
  const leave = dialog('离开编辑页');
  await leave.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await leave.boundingBox();
  check(box.x >= 0 && box.x + box.width <= 390, '窄屏弹窗溢出');
  await page.waitForTimeout(220); // 等待浮层进入动效完成后检查画面。
  await page.screenshot({ path: 'output/playwright/unified-confirm-mobile.png' });
  await leave.getByRole('button', { name: '取消', exact: true }).click();
  await leave.waitFor({ state: 'detached' });
  check(await page.getByRole('textbox', { name: '练习名称', exact: true }).inputValue() === '草稿', '取消离开丢失草稿');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await dialog('放弃修改').getByRole('button', { name: '放弃', exact: true }).click();
  await page.getByRole('heading', { name: '自定义练习', exact: true }).waitFor();
  check(await page.locator('.app-dialog').count() === 0, '取消新建重复确认');
  return '嵌套确认、模型移除、滚动锁、删除小节、未保存离开与窄屏通过';
}
