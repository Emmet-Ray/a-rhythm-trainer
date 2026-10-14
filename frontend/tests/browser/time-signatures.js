// Run with playwright-cli run-code on an isolated app and temporary backend.
async (page) => {
  page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.accept(); });
  const base = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const meter = () => page.getByRole('combobox', { name: '拍号', exact: true });
  const choose = async value => {
    await meter().click();
    await page.getByRole('option', { name: value, exact: true }).click();
  };
  await page.goto(`${base}/custom/tapping/new`);
  await choose('3/4');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('textbox', { name: '练习名称', exact: true }).fill('三拍回归');
  await page.getByRole('button', { name: '四分音符', exact: true }).click();
  await choose('2/4');
  await page.getByRole('dialog', { name: '切换拍号', exact: true }).getByRole('button', { name: '取消', exact: true }).click();
  check((await meter().textContent()).includes('3/4'), '取消切换必须保持原拍号');
  check(await page.getByRole('button', { name: '试听', exact: true }).isEnabled(), '取消切换保留内容');
  await choose('2/4');
  await page.getByRole('dialog', { name: '切换拍号', exact: true }).getByRole('button', { name: '切换', exact: true }).click();
  check(await page.getByRole('button', { name: '试听', exact: true }).isDisabled(), '确认切换清空内容');
  check(await page.getByRole('textbox', { name: '练习名称', exact: true }).inputValue() === '三拍回归', '切换保留名称');
  await choose('3/4');
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: `跳到小节 ${index}`, exact: true }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '四分音符', exact: true }).click();
  }
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  const saved = await page.evaluate(async () => (await (await fetch('/api/custom-exercises?mode=tapping')).json()).items.find(x => x.name === '三拍回归'));
  check(!!saved, '已保存三拍练习');
  await page.goto(`${base}/custom/tapping/${saved.id}/edit`);
  await page.getByRole('textbox', { name: '练习名称', exact: true }).waitFor();
  check(await meter().count() === 0, '编辑已有练习不提供拍号选择');
  check((await page.locator('.editor-meter').textContent()).includes('3/4'), '编辑保留三拍');
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.waitForTimeout(9800);
  const count = await page.evaluate(async () => (await (await fetch('/api/local-data/records/summary')).json()).attemptCount);
  check(count >= 1, '三拍完整练习可保存记录');
  await page.goto(`${base}/custom/dictation/new`);
  await choose('2/4');
  await page.getByRole('textbox', { name: '练习名称', exact: true }).fill('两拍听写回归');
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: `跳到小节 ${index}`, exact: true }).click();
    await page.getByRole('button', { name: '二分音符', exact: true }).click();
  }
  await page.getByRole('button', { name: '保存练习', exact: true }).click();
  await page.getByRole('button', { name: '播放题目', exact: true }).waitFor();
  await page.getByRole('button', { name: '二分音符', exact: true }).click();
  await page.getByRole('button', { name: '验证当前小节', exact: true }).click();
  check(!await page.locator('.action-error').count(), '两拍听写判定和保存无错误');
  await page.goto(`${base}/random/tapping`);
  await page.getByRole('button', { name: '生成设置', exact: true }).click();
  await choose('3/4');
  await page.getByRole('button', { name: '关闭生成设置', exact: true }).click();
  await page.getByRole('button', { name: '换一题', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  check((await page.locator('.editor-meter').textContent()).includes('3/4'), '随机题目按所选拍号生成');
  check(await page.locator('.exercise-editor').getByRole('combobox', { name: '拍号', exact: true }).count() === 0, '编辑随机题也固定拍号');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '窄屏无横向溢出');
  await page.evaluate(() => { document.body.dataset.meterRegression = 'passed'; });
  return { passed: true, tappingRecordCount: count };
}
