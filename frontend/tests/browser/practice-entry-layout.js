async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.route('**/api/auth/me', route => route.fulfill({ json: { auth_enabled: false } }));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://localhost:5173/custom');
  await page.waitForURL('**/custom/tapping');
  await page.getByRole('link', { name: '新建练习', exact: true }).waitFor();
  await page.getByRole('button', { name: '节奏听写', exact: true }).click();
  await page.waitForURL('**/custom/dictation');
  await page.getByRole('link', { name: '新建练习', exact: true }).click();
  await page.waitForURL('**/custom/dictation/new');
  await page.getByRole('link', { name: '题目列表', exact: true }).click();
  await page.waitForURL('**/custom/dictation');
  await page.getByRole('link', { name: '随机练习', exact: true }).click();
  await page.waitForURL('**/random/tapping');
  await page.getByRole('button', { name: '生成设置', exact: true }).waitFor();
  const modes = page.getByRole('group', { name: '训练方式', exact: true });
  await modes.getByRole('button', { name: '节奏听写', exact: true }).click();
  await page.waitForURL('**/random/dictation');
  await page.getByRole('button', { name: '生成设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭生成设置', exact: true }).click();
  await page.getByRole('button', { name: /^换一题/ }).click();
  await page.getByRole('link', { name: '自定义练习', exact: true }).click();
  await page.waitForURL('**/custom/dictation');
  await page.getByRole('link', { name: '随机练习', exact: true }).click();
  await page.waitForURL('**/random/dictation');
  for (const path of ['/preset', '/records', '/settings', '/about', '/custom/tapping']) {
    await page.goto('http://localhost:5173' + path);
    await page.locator('main h1').waitFor();
    const bounds = await page.locator('main').boundingBox();
    const nav = await page.locator('.site-sidebar').boundingBox();
    check(Math.abs((bounds.x - nav.width) - (1600 - bounds.x - bounds.width)) < 3, path + ' 主区域居中');
  }
  await page.screenshot({ path: '/tmp/layout-custom.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/random/dictation', '/custom/dictation', '/custom/tapping/new', '/preset', '/settings']) {
    await page.goto('http://localhost:5173' + path);
    await page.locator('main h1').waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path + ' 窄屏无横向溢出');
  }
  return { passed: true };
}
