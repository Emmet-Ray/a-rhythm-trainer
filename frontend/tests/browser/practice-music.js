// Isolated Vite origin, mocked APIs. Decode actual samples and render every basic score.
async page => page.evaluate(async () => {
  const {gameLevels,sampleBank}=await import('/src/game/catalog.ts');
  const {loadGameSamples,playMusicVoice}=await import('/src/game/audio/GameInstruments.ts');
  const {arrangeMusic,melodyGain}=await import('/src/game/audio/MusicArrangement.ts');
  const context=new AudioContext(),samples=await loadGameSamples(context,sampleBank),results=[];
  try {
    for(const level of gameLevels.filter(l=>l.category==='rhythm')) for(const bpm of [60,120,240]) {
      const score=level.music,beat=60/bpm;
      const render=new OfflineAudioContext(2,Math.ceil((score.chords.length*4*beat+2)*44100),44100);
      const master=render.createGain();master.gain.value=.75;master.connect(render.destination);
      for(const n of arrangeMusic(score))playMusicVoice(render,master,samples,n.instrument,n.beat*beat,n.duration*beat,n.midi,n.gain);
      for(const n of score.melody)playMusicVoice(render,master,samples,'piano',n.beat*beat,n.duration*beat,n.midi,n.gain*melodyGain);
      const buffer=await render.startRendering();let peak=0,sum=0;
      for(let c=0;c<2;c++)for(const v of buffer.getChannelData(c)){if(!Number.isFinite(v))throw Error('Nonfinite PCM');peak=Math.max(peak,Math.abs(v));sum+=v*v;}
      if(peak<.01||peak>.95)throw Error(`${level.id}: silent or clipping ${peak}`);
      results.push({id:level.id,bpm,peak,rms:Math.sqrt(sum/(buffer.length*2))});
    }
    return results;
  } finally {await context.close();}
})
