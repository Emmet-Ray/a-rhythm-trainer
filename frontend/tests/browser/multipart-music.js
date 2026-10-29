// Isolated Vite origin with actual GS bank. Synthetic score; no private/local songs required.
async page => {
  const origin = new URL(page.url()).origin, errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  try {
    await page.goto(origin + '/game/glimmer');
    await page.waitForFunction(() => document.querySelector('.orbit-start')?.disabled === false);
    // A real user gesture permits audio on browsers that enforce autoplay restrictions.
    await page.getByRole('button', { name: '练习设置', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    const result = await page.evaluate(async () => {
      const { prepareGameMusic } = await import('/src/game/audio/GameMusic.ts');
      const { createOrbitTrack } = await import('/src/game/core/OrbitTrack.ts');
      const { hitsFromParts } = await import('/src/game/core/MultipartScore.ts');
      const parts = Array.from({length:24}, (_, i) => ({
        id:`staff-${i}`, name:`Staff ${i}`, preset:{kind:'melodic',program:24}, gain:.04,
        notes:[{id:'a',beat:0,duration:1,midi:48+i,velocity:.5}],
      }));
      const score = {title:'24 independent parts',recommendedBpm:160,
        soundFont:{file:'/assets/game/shared/audio/generaluser-gs/GeneralUser-GS.sf2',gain:1},
        bars:[4],parts,hits:hitsFromParts(parts),sections:[]};
      const context = new AudioContext(), meter = context.createAnalyser(), data = new Float32Array(2048);
      meter.fftSize = data.length;
      const createGain = context.createGain.bind(context);
      context.createGain = () => {
        const gain = createGain(), connect = gain.connect.bind(gain);
        gain.connect = (target, ...args) => { if (target === context.destination) connect(meter); return connect(target, ...args); };
        return gain;
      };
      let peak = 0, player;
      const timer = setInterval(() => { meter.getFloatTimeDomainData(data); for (const value of data) peak = Math.max(peak, Math.abs(value)); }, 10);
      try {
        await context.resume();
        player = await prepareGameMusic(context, score, createOrbitTrack(score), 160);
        const start = context.currentTime + .1;
        player.start({audioTimeAt:ms=>start+ms/1000}, 'automatic');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('24-part completion timed out')), 10000);
          player.finish(() => { clearTimeout(timeout); resolve(); });
        });
        if (!(peak > .001 && peak < .95)) throw Error('Silent or clipping multi-part output: ' + peak);
        return {parts:parts.length,targets:score.hits.length,peak};
      } finally {
        player?.stop(); clearInterval(timer); meter.disconnect(); await context.close();
      }
    });
    if (errors.length) throw Error(errors.join('\n'));
    return result;
  } finally { page.off('pageerror', onError); }
}
