// playwright-cli run-code --filename；使用模拟供应商和会话，不读取真实凭证
async (page) => {
  const origin = new URL(page.url()).origin;
  const stamp = () => Date.now() / 1000;
  const state = { provider: 'deepseek', deepseek: { configured: false, model: '', models: [], catalog_updated_at: 0 },
    chatgpt: { configured: true, model: '', account: 'test@example.com', models: [{ id: 'gpt-test', name: 'GPT Test' }], catalog_updated_at: stamp() } };
  const sessions = new Map();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/assistant/sessions**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/sessions')) {
      if (request.method() === 'GET') return route.fulfill({ json: { sessions: [], total: 0 } });
      const model = state[state.provider].model;
      const value = { id: `test${sessions.size}`, messages: [], is_running: false, last_run_status: null,
        model_selection: model ? { provider: state.provider, model } : null };
      sessions.set(value.id, value);
      return route.fulfill({ json: value });
    }
    const id = path.split('/')[4], value = sessions.get(id);
    if (!value) return route.fulfill({ status: 404, json: { detail: '不存在' } });
    if (path.endsWith('/model') && request.method() === 'PUT') {
      value.model_selection = request.postDataJSON();
      state.provider = value.model_selection.provider;
      state[state.provider].model = value.model_selection.model;
    }
    return route.fulfill({ json: value });
  });
  let delayCatalog = false, releaseCatalog, catalogStarted;
  await page.route('**/api/model-connections**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (delayCatalog && path.endsWith('/chatgpt/models')) {
      const stale = structuredClone(state);
      await new Promise(resolve => { releaseCatalog = resolve; catalogStarted(); });
      return route.fulfill({ json: stale }).catch(() => {}); // The settings mutation aborts this request
    }
    if (path.endsWith('/deepseek/key') && request.method() === 'PUT') {
      if (request.postDataJSON().key === 'invalid') return route.fulfill({ status: 400, json: { detail: 'API Key 无效' } });
      state.deepseek = { configured: true, model: '', models: [{ id: 'deepseek-test', name: 'DeepSeek Test' }], catalog_updated_at: stamp() };
    }
    return route.fulfill({ json: state });
  });
  await page.goto(origin + '/settings?category=models');
  await page.getByRole('button', { name: '配置 DeepSeek', exact: true }).click();
  await page.getByLabel('API Key', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: '验证并保存' }).click();
  await page.getByText('API Key 无效', { exact: true }).waitFor();
  await page.getByLabel('API Key', { exact: true }).fill('test-only-key');
  await page.getByRole('button', { name: '验证并保存' }).click();
  await page.getByRole('button', { name: '管理 DeepSeek', exact: true }).waitFor();
  if (await page.getByRole('textbox').count()) throw new Error('configured key field should be collapsed');
  if (await page.getByRole('radio').count()) throw new Error('connections must not be mutually exclusive');
  if (await page.getByRole('button', { name: '使用此模型' }).count()) throw new Error('model selection belongs in conversation');
  await page.getByRole('link', { name: '节奏助手', exact: true }).click();
  await page.getByRole('button', { name: '选择模型', exact: true }).click();
  const search = page.getByRole('combobox', { name: '模型', exact: true });
  await search.fill('DeepSeek');
  await search.press('Enter');
  await page.getByRole('dialog', { name: '选择模型', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'DeepSeek Test', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'DeepSeek Test', exact: true }).click();
  await search.fill('GPT');
  await search.press('Enter');
  await page.getByRole('dialog', { name: '选择模型', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'GPT Test', exact: true }).waitFor();
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await page.getByRole('button', { name: 'GPT Test', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('mobile horizontal overflow');
  if (errors.length) throw new Error(errors.join('\n'));
  await page.setViewportSize({ width: 1280, height: 900 });
  // An authorization catalog read must not restore configuration predating a key update
  state.deepseek.configured = false;
  delayCatalog = true;
  const started = new Promise(resolve => { catalogStarted = resolve; });
  const cancelled = page.waitForEvent('requestfailed', {
    predicate: request => request.url().endsWith('/chatgpt/models'), timeout: 5000,
  });
  await page.goto(origin + '/settings?category=models&authorization=success');
  await started;
  await page.getByRole('button', { name: '配置 DeepSeek', exact: true }).click();
  await page.getByLabel('API Key', { exact: true }).fill('replacement-test-key');
  await page.getByRole('button', { name: '验证并保存' }).click();
  await page.getByRole('button', { name: '管理 DeepSeek', exact: true }).waitFor();
  await cancelled;
  releaseCatalog();
  if (errors.length) throw new Error(errors.join('\n'));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return 'connection setup, collapsed credentials, per-conversation search/selection, persistence, new-chat inheritance and stale settings request cancellation passed';
}
