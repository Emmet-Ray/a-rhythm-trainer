// 用 playwright-cli run-code --filename 执行；模拟配置状态，不调用模型。
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto(new URL('/', page.url()).href);
  let status = { status: 'unconfigured', message: '助手尚未配置 API Key。请在部署环境中设置 AI_API_KEY，并重启后端服务。' };
  let calls = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { auth_enabled: false } }));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: status }));
  await page.route('**/api/assistant/sessions', route => { calls++; return route.abort(); });
  await page.reload();
  await page.getByText(status.message, { exact: true }).waitFor();
  if (await page.getByRole('textbox', { name: '向助手提问' }).count()) throw new Error('unconfigured chat input rendered');
  await page.getByRole('heading', { name: '未配置 API Key', exact: true }).waitFor();
  if (await page.getByRole('button', { name: '新对话', exact: true }).count()) throw new Error('new conversation rendered');
  if (await page.locator('.assistant-shell a').count()) throw new Error('fallback links rendered');
  status = { status: 'ready', message: '' };
  await page.getByRole('button', { name: '重新检查配置' }).click();
  await page.waitForFunction(() => document.querySelector('#assistant-input') && !document.querySelector('#assistant-input').disabled);
  await page.getByRole('textbox', { name: '向助手提问' }).fill('测试草稿');
  if (!await page.getByRole('button', { name: '发送', exact: true }).isEnabled()) throw new Error('ready send disabled');
  if (calls) throw new Error('status check created session');
  await page.route('**/api/assistant/status', route => route.fulfill({ status: 503, json: {} }));
  await page.reload();
  await page.getByRole('button', { name: '重新检查配置' }).waitFor();
  if (await page.getByRole('textbox', { name: '向助手提问' }).count()) throw new Error('failed check rendered input');
  if (errors.length) throw new Error(errors.join('\n'));
  return 'unconfigured, recovery, failed check and no paid requests: passed';
}
