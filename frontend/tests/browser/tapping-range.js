// All API traffic mocked; real Web Audio exercises scheduling and playback lifecycle.
async page => {
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  const exercise = { timeSignature: { beats: 4, beatType: 4 }, measures: [
    { elements: Array.from({ length: 4 }, () => ({ kind: 'note', noteValue: 'quarter' })) },
    { elements: [{ kind: 'rest', noteValue: 'quarter' }, { kind: 'note', noteValue: 'quarter' }, { kind: 'rest', noteValue: 'half' }] },
    { elements: [{ kind: 'note', noteValue: 'whole' }] },
  ] };
  await page.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    let json = { status: 'unavailable' };
    if (url.pathname.includes('model-connections')) json = { provider: 'deepseek', deepseek: { configured: false, models: [] }, chatgpt: { configured: false, models: [] } };
    if (url.pathname.includes('/custom-exercises/')) json = { id: url.pathname.split('/').at(-1), name: '范围测试', mode: 'tapping',
      created_at: '2026-10-13T00:00:00Z', exercise: url.pathname.endsWith('/one') ? { ...exercise, measures: exercise.measures.slice(0, 1) } : exercise };
    if (url.pathname.endsWith('/lookup')) json = null;
    if (url.pathname.endsWith('/records') && route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON()); json = { id: 'record-test' };
    }
    return route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/custom/tapping/range');
  const measure = n => page.getByRole('button', { name: `第 ${n} 小节，设为练习起点`, exact: true });
  await measure(1).waitFor();
  const only = page.getByRole('checkbox', { name: '只练习当前小节' });
  const bpm = page.getByRole('spinbutton');
  await bpm.fill('240'); await bpm.blur();
  await page.locator('.rhythm-score svg').evaluate(el => { window.originalScore = el; });
  await measure(2).click();
  if (await measure(2).getAttribute('aria-pressed') !== 'true') throw Error('selection not reflected');
  await page.getByText('第 2 小节 — 第 3 小节', { exact: true }).waitFor();
  await page.keyboard.press('Space');
  if (await measure(2).evaluate(el => el === document.activeElement)) throw Error('pointer selection retained keyboard focus');
  const summaryTop = await page.locator('.tapping-range-summary').evaluate(el => el.offsetTop);
  await only.check();
  if (await page.locator('.tapping-range-summary').evaluate(el => el.offsetTop) !== summaryTop) throw Error('scope selection moved summary');
  if (await page.locator('.score-start-label').count()) throw Error('obsolete start label');

  await page.getByText('第 2 小节', { exact: true }).waitFor();
  if (!await page.locator('.rhythm-score svg').evaluate(el => el === window.originalScore)) throw Error('selection rebuilt score');
  await page.getByRole('button', { name: '试听', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.score-measure-select')?.disabled);
  if (!await only.isDisabled()) throw Error('scope editable during playback');
  await page.getByRole('button', { name: '试听', exact: true }).waitFor({ timeout: 6000 });
  if (writes.length) throw Error('listen wrote record');
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.getByText('本次未通过', { exact: true }).waitFor({ timeout: 6000 });
  if (writes.length) throw Error('partial attempt wrote record');
  await measure(1).focus(); await page.keyboard.press('Enter');
  await page.getByText('第 1 小节', { exact: true }).waitFor();
  if (await page.locator('.practice-result').textContent()) throw Error('old result survived range change');
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.getByText('本次未通过', { exact: true }).waitFor({ timeout: 6000 });
  if (writes.length) throw Error('first measure counted as whole exercise');
  await only.uncheck();
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  // Stop after count-in; normal full-exercise interrupted recording must remain intact.
  await page.waitForTimeout(1450);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await page.waitForTimeout(150);
  if (writes.length !== 1 || writes[0].attempts[0].targetCount !== 6 || writes[0].attempts[0].passed) throw Error('full attempt recording changed');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('mobile overflow');
  await page.screenshot({ path: '/tmp/tapping-range-mobile.png', fullPage: true });
  // Dragging a measure must not select it; keyboard selection of a later row remains available.
  await measure(2).scrollIntoViewIfNeeded();
  const box = await measure(2).boundingBox();
  await page.mouse.move(box.x + 30, box.y + 50); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 90, { steps: 5 }); await page.mouse.up();
  if (await measure(1).getAttribute('aria-pressed') !== 'true') throw Error('drag selected a measure');
  await measure(3).focus(); await page.keyboard.press('Space');
  await page.getByText('第 3 小节', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/tmp/tapping-range-desktop.png', fullPage: true });
  await page.goto(origin + '/random/tapping');
  await measure(2).waitFor(); await measure(2).click(); await only.check();
  await page.getByRole('button', { name: '换一题', exact: true }).click();
  if (await only.isChecked() || await measure(1).getAttribute('aria-pressed') !== 'true') throw Error('new question inherited scope');
  await page.goto(origin + '/custom/tapping/one');
  await page.getByRole('button', { name: '击拍练习', exact: true }).waitFor();
  if (await only.count()) throw Error('single-measure exercise has unnecessary scope toggle');
  await page.getByRole('spinbutton').fill('240'); await page.getByRole('spinbutton').blur();
  await page.getByRole('button', { name: '击拍练习', exact: true }).click();
  await page.getByText('本次未通过', { exact: true }).waitFor({ timeout: 6000 });
  await page.waitForTimeout(150);
  if (writes.length !== 2 || writes[1].attempts[0].targetCount !== 4) throw Error('single-measure full exercise was not recorded');
  if (errors.length) throw Error(errors.join('\n'));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  return 'selection, stable score, shared playback scope, keyboard, lock/reset, partial exclusion and full recording passed';
}
