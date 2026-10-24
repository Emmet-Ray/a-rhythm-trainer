// playwright-cli run-code --filename; all API traffic mocked.
async page => {
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1280, height: 800 });
  let requests = 0;
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    requests++;
    const url = new URL(route.request().url());
    let json = { status: 'unavailable' };
    if (url.pathname.includes('model-connections')) json = { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } };
    if (url.pathname.includes('custom-exercises')) json = { items: [], offset: 0, limit: 50 };
    if (url.pathname.endsWith('/lookup')) json = null;
    if (url.pathname.endsWith('/summary')) json = { recordCount: 0, attemptCount: 0 };
    if (url.pathname.endsWith('/records')) json = { records: [], page: 1, pages: 1, total: 0,
      activity: { unit: 'day', points: [] }, overview: { count: 0, days: 0 } };
    return route.fulfill({ json });
  });
  for (const [path, name, selector] of [
    ['/practice', '练习', '.practice-hub'],
  ]) {
    await page.goto(origin + path);
    await page.locator(selector).waitFor();
    await page.waitForTimeout(200);
    const before = await page.evaluate(selector => {
      window.repeatNode = document.querySelector(selector);
      return { key: history.state.key, length: history.length };
    }, selector);
    const count = requests;
    const link = page.getByRole('link', { name, exact: true });
    await link.click();
    await link.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const after = await page.evaluate(selector => ({
      key: history.state.key, length: history.length,
      sameNode: document.querySelector(selector) === window.repeatNode,
    }), selector);
    if (before.key !== after.key || before.length !== after.length || !after.sameNode || requests !== count) {
      throw Error('Repeated navigation reset page or requested data: ' + path);
    }
  }
  await page.goto(origin + '/custom/tapping/new');
  const back = page.getByRole('link', { name: '题目列表', exact: true });
  if (await back.getAttribute('href') !== '/custom/tapping') throw Error('editor cannot return to catalog');
  await back.click();
  await page.locator('.custom-catalog').waitFor();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return 'Repeated pointer/keyboard navigation preserves history, content and queries; editor can return to catalog';
}
