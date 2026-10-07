// playwright-cli run-code --filename; all assistant requests are mocked
async page => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const origin = new URL(page.url()).origin;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=', 'base64');
  const image = { name: 'score.png', mimeType: 'image/png', buffer: png };
  const choice = { provider: 'deepseek', model: 'deepseek-flash' };
  let session = { id: 'image-test', messages: [], is_running: false, last_run_status: null, model_selection: choice };
  let reject = true, requests = 0;
  let releaseFailure;
  const failureGate = new Promise(resolve => { releaseFailure = resolve; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek',
    deepseek: { configured: true, model: 'deepseek-flash', models: [
      { id: 'deepseek-flash', name: 'DeepSeek Flash', supports_images: true },
      { id: 'deepseek-v4-pro', name: 'DeepSeek Pro', supports_images: false }], catalog_updated_at: Date.now() / 1000 },
    chatgpt: { configured: false, model: '', models: [] } } }));
  await page.route('**/api/assistant/sessions**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/sessions')) return route.fulfill({ json: req.method() === 'GET' ? { sessions: [], total: 0 } : session });
    if (path.endsWith('/messages')) {
      requests++;
      const body = req.postDataJSON();
      if (body.text || body.images.length !== 1 || body.images[0].media_type !== 'image/png') throw new Error('image-only request lost attachment');
      if (reject) { await failureGate; return route.fulfill({ status: 503, json: { detail: 'test failure' } }); }
      session = { ...session, last_run_status: 'completed', messages: [{ id: body.message_id, role: 'user', metadata: { created_at: '2026-10-07T12:00:00Z' }, parts: [{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,' + body.images[0].data }] }] };
      return route.fulfill({ contentType: 'text/event-stream', headers: { 'x-vercel-ai-ui-message-stream': 'v1' }, body: 'data: {"type":"start","messageId":"a1"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n' });
    }
    return route.fulfill({ json: session });
  });
  await page.goto(origin);
  await page.getByRole('button', { name: 'DeepSeek Flash', exact: true }).waitFor();
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  const box = await page.locator('.assistant-input-box').boundingBox();
  const menu = await page.getByRole('dialog', { name: '添加内容', exact: true }).boundingBox();
  if (!box || !menu || Math.abs(box.width - menu.width) > 2 || Math.abs(box.x - menu.x) > 2 || menu.y + menu.height > box.y) throw new Error('add menu must align above composer');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', { name: '向助手提问' });
  if (!(await input.inputValue()).includes('击拍练习')) throw new Error('practice template not filled');
  await input.fill('');
  await page.getByRole('button', { name: '添加内容', exact: true }).click();
  await page.getByRole('option', { name: '添加图片', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const file = page.getByLabel('选择图片文件');
  await file.setInputFiles(image);
  const thumbnail = page.getByRole('button', { name: '预览图片 1', exact: true });
  await thumbnail.waitFor();
  if (!await thumbnail.evaluate(el => !!el.closest('.assistant-input-box'))) throw new Error('image outside composer');
  const size = await thumbnail.boundingBox();
  if (!size || size.width > 100 || size.height > 100) throw new Error('draft thumbnail is not compact');
  await thumbnail.click();
  await page.getByRole('dialog', { name: '图片预览' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '图片预览' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'DeepSeek Flash', exact: true }).click();
  const pro = page.getByRole('option', { name: /DeepSeek Pro/ });
  if (await pro.getAttribute('aria-disabled') !== 'true') throw new Error('incompatible model enabled');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await thumbnail.waitFor({ state: 'hidden' });
  await input.fill('下一条消息');
  await file.setInputFiles([image, image, image]);
  await page.getByRole('button', { name: '预览图片 3', exact: true }).waitFor();
  releaseFailure();
  await page.getByRole('button', { name: '预览图片 4', exact: true }).waitFor();
  await page.getByText('恢复的草稿超过 3 张图片，请移除部分图片后发送', { exact: true }).waitFor();
  if (await input.inputValue() !== '下一条消息' || !await page.getByRole('button', { name: '发送', exact: true }).isDisabled()) throw new Error('failed send discarded new draft or allowed excess images');
  if (requests !== 1) throw new Error('unexpected resend');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '移除图片 1', exact: true }).click();
  await input.fill('');
  // Exercise the actual paste event rather than the file-picker path again
  await page.getByRole('textbox', { name: '向助手提问' }).evaluate((element, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'pasted.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, [...png]);
  await page.getByRole('button', { name: '预览图片 1', exact: true }).waitFor();
  await file.setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await page.getByText('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片', { exact: true }).waitFor();
  reject = false;
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '查看图片', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: '查看图片', exact: true }).click();
  await page.getByRole('button', { name: '关闭图片预览' }).click();
  const userMessage = page.getByRole('article', { name: '你的消息', exact: true });
  if (await userMessage.locator('time').count() !== 1) throw new Error('image-only timestamp missing');
  if (await userMessage.getByRole('button', { name: '复制消息' }).count()) throw new Error('image-only copy action');
  const imagePart = session.messages[0].parts[0];
  session.messages[0].parts = [{ type: 'text', text: '根据图片创建练习' }, imagePart, imagePart];
  await page.reload();
  await userMessage.getByText('根据图片创建练习').waitFor();
  if (await userMessage.getByRole('button', { name: '查看图片' }).count() !== 2 || await userMessage.locator('time').count() !== 1) throw new Error('attachments must share one message and timestamp');
  async function checkMessageOrder() {
    const pictures = await userMessage.locator('.assistant-message-images').boundingBox();
    const text = await userMessage.locator('.assistant-message-text').boundingBox();
    const time = await userMessage.locator('time').boundingBox();
    if (pictures.y + pictures.height > text.y || text.y + text.height > time.y || text.y - pictures.y - pictures.height > 12) throw new Error('message order or spacing');
  }
  await checkMessageOrder();
  session.messages.push({ id: 'copy-answer', role: 'assistant', parts: [
    { type: 'text', text: '**第一段**', state: 'done' }, { type: 'text', text: '第二段', state: 'done' }
  ] });
  await page.reload();
  await userMessage.getByRole('button', { name: '复制消息' }).waitFor();
  await page.evaluate(() => {
    window.copiedText = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.copiedText = text; }
    } });
  });
  await userMessage.getByRole('button', { name: '复制消息' }).click();
  await userMessage.getByRole('button', { name: '已复制' }).waitFor();
  if (await page.evaluate(() => window.copiedText) !== '根据图片创建练习') throw new Error('user copy contains non-text content');
  const answer = page.locator('.assistant-turn').last();
  if (await answer.getByRole('button', { name: '复制消息' }).count() !== 1) throw new Error('one copy action per answer');
  await answer.getByRole('button', { name: '复制消息' }).click();
  await answer.getByRole('button', { name: '已复制' }).waitFor();
  if (await page.evaluate(() => window.copiedText) !== '**第一段**\n\n第二段') throw new Error('assistant copy incomplete');
  await answer.getByRole('button', { name: '复制消息' }).waitFor();
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await answer.getByRole('button', { name: '复制消息' }).click();
  await answer.getByRole('status').getByText('复制失败，请重试').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await checkMessageOrder();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('mobile overflow');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  await file.setInputFiles(image);
  await page.getByRole('button', { name: '预览图片 1', exact: true }).waitFor();
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  if (await page.getByRole('button', { name: '预览图片 1', exact: true }).count()) throw new Error('draft not cleared');
  await input.fill('服务恢复后继续发送');
  await file.setInputFiles(image);
  await page.getByRole('button', { name: '预览图片 1', exact: true }).waitFor();
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'unconfigured', message: 'test unavailable' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('model-connections-changed')));
  await input.waitFor({ state: 'hidden' });
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { status: 'ready', message: '' } }));
  await page.evaluate(() => window.dispatchEvent(new Event('model-connections-changed')));
  await input.waitFor({ state: 'visible' });
  if (await input.inputValue() !== '服务恢复后继续发送') throw new Error('service availability discarded text draft');
  await page.getByRole('button', { name: '预览图片 1', exact: true }).waitFor();
  if (errors.length) throw new Error(errors.join('\n'));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return 'image upload, preview, paste, validation, failed-send draft recovery, model compatibility, refresh and mobile passed';
}
