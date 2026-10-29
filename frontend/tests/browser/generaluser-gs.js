// Isolated Vite origin + temporary backend. Short real-audio regression by default.
// Open ?validation=full-audio for a full preview.
async page => {
  const entry = new URL(page.url());
  const origin = entry.origin, fullAudio = entry.searchParams.get('validation') === 'full-audio';
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const requests = [], errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (window.gsInstrumentation) return;
    window.gsInstrumentation = true;
    window.gsContexts = []; window.gsWorklets = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args); window.gsContexts.push(this);
        this.meter = this.createAnalyser(); this.meter.fftSize = 2048;
        this.peak = 0; this.energy = 0; this.frames = 0; this.latest = 0;
        const data = new Float32Array(2048);
        this.meterTimer = setInterval(() => {
          this.meter.getFloatTimeDomainData(data); this.latest = 0;
          for (const value of data) {
            this.latest = Math.max(this.latest, Math.abs(value));
            this.energy += value * value;
          }
          this.peak = Math.max(this.peak, this.latest); this.frames += data.length;
        }, 10);
      }
      createGain() {
        const gain = super.createGain(), connect = gain.connect.bind(gain);
        gain.connect = (target, ...args) => {
          if (target === this.destination) connect(this.meter);
          return connect(target, ...args);
        };
        return gain;
      }
      close() { clearInterval(this.meterTimer); return super.close(); }
    };
    const Worklet = window.AudioWorkletNode;
    window.AudioWorkletNode = class extends Worklet {
      constructor(...args) {
        super(...args); const entry = { messages: [], destroyed: false }; window.gsWorklets.push(entry);
        const post = this.port.postMessage.bind(this.port);
        this.port.postMessage = (message, ...rest) => {
          if (message.type === 'destroyWorklet') entry.destroyed = true;
          // Retain metadata only, never transferred sample buffers.
          if (message.type === 'midiMessage') entry.messages.push(message);
          return post(message, ...rest);
        };
      }
    };
  });
  await page.goto(origin + '/game/glimmer');
  const ready = () => page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
  const preview = () => page.getByRole('button', { name: '看示范', exact: true }).click();
  const stage = page.getByRole('region', { name: '节奏游戏区域' });
  await ready();
  check(!requests.some(url => url.endsWith('.sf2') || url.includes('spessasynth')), 'idle page eagerly loads GS');
  // A failed bank is retryable; cancelling a subsequent load must not create a late synth.
  await page.route('**/GeneralUser-GS.sf2', route => route.fulfill({ status: 503, body: 'test' }), { times: 1 });
  await preview(); await page.getByRole('alert').filter({ hasText: 'GS 音色加载失败' }).waitFor(); await ready();
  await page.route('**/GeneralUser-GS.sf2', async route => { await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); }, { times: 1 });
  await preview(); await page.locator('[data-phase="loading"]').waitFor();
  await page.getByRole('button', { name: '停止示范', exact: true }).click(); await ready(); await page.waitForTimeout(1000);
  check(await stage.getAttribute('data-phase') === 'ready', 'cancelled load revived playback');
  check(await page.evaluate(() => window.gsWorklets.every(w => w.destroyed)), 'cancelled initialization left a live worklet');
  if (!fullAudio) {
    await page.getByRole('button', { name: '练习设置', exact: true }).click();
    await page.getByRole('spinbutton', { name: '速度', exact: true }).fill('160');
    await page.getByLabel('起始小节', { exact: true }).selectOption('8');
    await page.getByLabel('结束小节', { exact: true }).selectOption('9');
    await page.getByRole('button', { name: '应用设置', exact: true }).click(); await ready();
  }
  const metrics = [];
  {
    await ready();
    await preview();
    await page.waitForFunction(() => document.querySelector('.orbit-stage')?.dataset.phase === 'count-in');
    await page.waitForFunction(() => document.querySelector('.orbit-stage')?.dataset.phase === 'playing');
    await page.evaluate(() => { const c = window.gsContexts.at(-1); c.peak = 0; c.energy = 0; c.frames = 0; });
    await page.waitForFunction(() => document.querySelector('.orbit-stage')?.dataset.phase === 'completed', null, { timeout: 60000 });
    const metric = await page.evaluate(() => {
      const c = window.gsContexts.at(-1);
      return { peak: c.peak, rms: Math.sqrt(c.energy / c.frames) };
    });
    check(metric.peak > .01 && metric.peak < .95, `GS: silent or clipping ${metric.peak}`);
    metrics.push(metric);
    check(await page.evaluate(() => window.gsWorklets.at(-1).destroyed), 'completed worklet leaked');
  }
  // Fast local playback, stop and retry; covers both sparse and dense passages.
  await ready();
  await page.getByRole('button', { name: '练习设置', exact: true }).click();
  await page.getByRole('spinbutton', { name: '速度', exact: true }).fill('160');
  await page.getByLabel('起始小节', { exact: true }).selectOption('8');
  await page.getByLabel('结束小节', { exact: true }).selectOption('12');
  await page.getByRole('button', { name: '应用设置', exact: true }).click(); await ready();
  await preview();
  await page.waitForFunction(() => document.querySelector('.orbit-stage')?.dataset.phase === 'playing');
  await page.getByRole('button', { name: '停止示范', exact: true }).click();
  await ready(); await preview();
  await page.waitForFunction(() => document.querySelector('.orbit-stage')?.dataset.phase === 'completed', null, { timeout: 20000 });
  // Challenge hits issue immediate lead MIDI, while the backing remains pre-scheduled.
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.orbit-stage')?.dataset.phase === 'playing');
  const before = await page.evaluate(() => window.gsWorklets.at(-1).messages.length);
  await page.keyboard.press('Space');
  check(await page.evaluate(() => document.querySelector('.orbit-progress')?.textContent.trim().startsWith('1')), 'first challenge hit rejected');
  check(await page.evaluate(count => window.gsWorklets.at(-1).messages.length > count, before), 'hit did not send a lead note');
  await page.keyboard.press('Escape'); await ready();
  await page.getByRole('link', { name: '关卡列表', exact: true }).click();
  await page.waitForFunction(() => window.gsContexts.every(c => c.state === 'closed'));
  check(!errors.length, errors.join('\n'));
  return { metrics, worklets: await page.evaluate(() => window.gsWorklets.length), errors };
}
