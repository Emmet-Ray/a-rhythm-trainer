// 使用模拟助手题目检查原生 dialog、Radix 弹层及移动导航的焦点返回。
async page => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const check = (value, message) => { if (!value) throw new Error(message); };
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: [{ kind: 'note', noteValue: 'whole' }] },
    { elements: [{ kind: 'note', noteValue: 'half' }, { kind: 'rest', noteValue: 'half' }] },
  ] };
  const proposal = { id: 'editable-ai', title: '焦点回归练习', mode: 'tapping', description: '', exercise };
  let messages = [];
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/assistant/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/status')) return route.fulfill({ json: { status: 'ready', message: '' } });
    if (url.includes('/cards/')) {
      const state = route.request().postDataJSON();
      return route.fulfill({ json: state });
    }
    if (url.includes('?offset=')) return route.fulfill({ json: { sessions: [], total: 0 } });
    if (url.endsWith('/messages')) {
      const body = route.request().postDataJSON();
      messages = [{ id: body.message_id, role: 'user', parts: [{ type: 'text', text: body.text }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'tool-propose_rhythm_exercise', toolCallId: 'c1', state: 'output-available', input: {}, output: { generated_exercise: proposal } }] }];
      const events = [{ type: 'start', messageId: 'a1' }, { type: 'start-step' },
        { type: 'tool-input-available', toolCallId: 'c1', toolName: 'propose_rhythm_exercise', input: {} },
        { type: 'tool-output-available', toolCallId: 'c1', output: { generated_exercise: proposal } }, { type: 'finish-step' }, { type: 'finish' }];
      return route.fulfill({ contentType: 'text/event-stream', body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n' });
    }
    return route.fulfill({ json: { id: 'edit-session', messages, is_running: false, last_run_status: messages.length ? 'completed' : null, model_selection: { provider: 'deepseek', model: 'test' } } });
  });
  await page.route('**/api/model-connections**', route => route.fulfill({ json: { provider: 'deepseek', deepseek: { configured: true, model: 'test', models: [{ id: 'test', name: 'Test', supports_images: true }] }, chatgpt: { configured: false, models: [] } } }));

  const base = new URL(page.url()).origin;
  await page.goto(base);
  const composer=page.getByRole('textbox', { name: '向助手提问' });
  await composer.waitFor();
  const panel=page.locator('#assistant-panel');
  await panel.click({position:{x:100,y:300}});
  await page.keyboard.press('Escape');
  check(await panel.evaluate(el=>el===document.activeElement),'native dialog receives implicit focus');
  check(await panel.evaluate(el=>getComputedStyle(el).outlineStyle==='none'),'mouse-focused assistant panel must not gain outline on Escape');
  await page.keyboard.press('Tab');
  check(await page.evaluate(()=>!document.activeElement.hasAttribute('data-pointer-focus')),'Tab restores native keyboard focus');
  await composer.fill('生成练习');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const start=page.getByRole('button',{name:'开始击拍',exact:true});
  const overlay=page.locator('.generated-practice-overlay');
  const ring=locator=>locator.evaluate(el=>getComputedStyle(el).outlineStyle!=='none' && getComputedStyle(el).outlineWidth!=='0px');
  await start.click();
  await overlay.getByRole('button',{name:'击拍练习',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  await overlay.waitFor({state:'hidden'});
  check(await start.evaluate(el=>document.activeElement===el),'return focus to card');
  check(!await ring(start),'mouse + Escape should not show ring');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  check(await ring(start),'Tab must restore ring');
  await page.keyboard.press('Enter');
  await overlay.waitFor();
  await page.keyboard.press('Escape');
  await overlay.waitFor({state:'hidden'});
  check(await ring(start),'keyboard-opened overlay keeps return ring');
  await start.click();
  await overlay.waitFor();
  await page.keyboard.press('Tab');
  check(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),'keyboard navigation inside mouse-opened dialog');
  await page.keyboard.press('Escape');
  await overlay.waitFor({state:'hidden'});
  check(await ring(start),'mixed path retains keyboard ring');
  const add=page.getByRole('button',{name:'添加内容',exact:true});
  await add.click();
  await page.keyboard.press('Escape');
  check(!await ring(add),'Radix popover mouse return');
  await page.goto(base+'/random/dictation');
  const settings=page.getByRole('button',{name:'生成设置',exact:true});
  await settings.click();
  const meter=page.getByRole('combobox',{name:'拍号',exact:true});
  await meter.click();
  await page.keyboard.press('Escape');
  check(!await ring(meter),'select pointer return');
  await page.keyboard.press('Tab');
  check(await page.evaluate(()=>document.activeElement.matches(':focus-visible')),'select keyboard navigation');
  await page.keyboard.press('Escape');
  check(await ring(settings),'settings keyboard return');
  await settings.click();
  await page.keyboard.press('Escape');
  check(!await ring(settings),'settings pointer return');
  await page.setViewportSize({width:390,height:844});
  const nav=page.getByRole('button',{name:'打开导航菜单',exact:true});
  await nav.click();
  await page.keyboard.press('Escape');
  check(!await ring(nav),'mobile nav pointer return');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  check(await ring(nav),'mobile nav keyboard return');
  await page.goto(base+'/custom/dictation/new');
  const name=page.getByRole('textbox',{name:'练习名称',exact:true});
  await name.click();
  check(await name.evaluate(el=>!el.hasAttribute('data-pointer-focus')),'text input retains native focus');
  await name.fill('N');
  check(await name.inputValue()==='N','typing is not a practice shortcut');
  check(errors.length===0,errors.join(';'));
  return {passed:true};
}
