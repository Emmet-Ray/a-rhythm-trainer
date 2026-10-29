async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(new URL('/custom/tapping/new', page.url()).href);
  const name = page.getByRole('textbox', { name: '练习名称', exact: true });
  const save = page.getByRole('button', { name: '保存练习', exact: true });
  await name.waitFor();
  await page.getByRole('button', { name: '跳到小节 2', exact: true }).click();
  const top = () => page.locator('.practice-body').evaluate(el => el.getBoundingClientRect().top + scrollY);
  const before = await top();
  await save.click();
  check(await name.getAttribute('aria-invalid') === 'true', '名称错误标记');
  check(await name.evaluate(el => el === document.activeElement), '聚焦名称');
  check(Math.abs(await top() - before) < 1, '名称错误不推动谱面');
  await name.fill('反馈测试');
  await save.click();
  check(await page.getByRole('button', { name: '跳到小节 1', exact: true }).getAttribute('aria-pressed') === 'true', '定位首个未完成小节');
  check((await page.locator('.rhythm-editor-input-message').textContent()).includes('还差 4 拍'), '小节校验出现在固定反馈区');
  check(Math.abs(await top() - before) < 1, '小节错误不推动谱面');
  // API save failures and draft retention are covered by edit-generated-exercise.js.
  await page.screenshot({ path: '/tmp/editor-feedback.png' });
  return { passed: true };
}
