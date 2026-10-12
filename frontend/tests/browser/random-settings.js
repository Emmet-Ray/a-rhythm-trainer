// 在临时后端运行；验证跨题设置保留及题目状态隔离，不播放音频或调用模型。
async page => {
  const origin = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const identities = [];
  await page.route('**/api/local-data/records/lookup', route => {
    identities.push(route.request().postDataJSON().exerciseId);
    return route.fulfill({ json: null });
  });
  await page.goto(origin + '/random/tapping');
  const bpm = page.getByRole('spinbutton', { name: '速度 BPM' });
  const metronome = page.getByRole('button', { name: '节拍器', exact: true });
  await bpm.fill('95'); await bpm.press('Enter');
  await metronome.click();
  await page.getByRole('button', { name: '换一题', exact: true }).click();
  check(await bpm.inputValue() === '95', '击拍换题重置 BPM');
  check(await metronome.getAttribute('aria-pressed') === 'false', '击拍换题重置节拍器');
  await page.locator('.exercise-edit').click();
  const name = page.getByRole('textbox', { name: '练习名称', exact: true });
  await name.waitFor();
  check(await bpm.inputValue() === '95', '切换编辑丢失训练设置');
  await bpm.fill('105'); await bpm.press('Enter');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.exercise-edit').waitFor();
  check(await bpm.inputValue() === '105', '编辑速度未返回训练');
  await page.getByRole('button', { name: '换一题', exact: true }).click();
  check(await bpm.inputValue() === '105', '编辑后换题丢失设置');
  await page.getByRole('button', { name: '节奏听写', exact: true }).click();
  await page.waitForURL('**/random/dictation');
  await page.getByRole('button', { name: '播放题目', exact: true }).waitFor();
  check(await bpm.inputValue() === '60', '不同模式错误共享设置');
  await bpm.fill('80'); await bpm.press('Enter');
  await metronome.click();
  await page.getByRole('button', { name: '全音符', exact: true }).click();
  check(await page.getByRole('button', { name: '删除末尾', exact: true }).isEnabled(), '未成功填写旧题答案');
  await page.getByRole('button', { name: '查看答案', exact: true }).click();
  await page.getByRole('button', { name: '返回作答', exact: true }).waitFor();
  await page.getByRole('button', { name: '换一题', exact: true }).click();
  await page.getByRole('button', { name: '查看答案', exact: true }).waitFor();
  check(await bpm.inputValue() === '80', '听写换题重置 BPM');
  check(await metronome.getAttribute('aria-pressed') === 'false', '听写换题重置节拍器');
  check(await page.getByRole('button', { name: '删除末尾', exact: true }).isDisabled(), '换题沿用了旧答案');
  await page.waitForFunction(() => !document.querySelector('[data-navigation-pending]'));
  check(identities.length >= 5 && new Set(identities).size >= 5, '换题沿用了旧记录身份');
  return '随机击拍／听写换题保留设置，编辑与训练共享设置，作答、答案显露和记录身份隔离通过';
}
