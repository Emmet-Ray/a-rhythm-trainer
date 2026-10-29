// Real bank and Worklet, densest two-bar excerpt of every registered level.
// Local songs participate only when enabled by the isolated Vite server.
async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('/game/glimmer',page.url()).href);
  await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  await page.getByRole('button',{name:'练习设置',exact:true}).click();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  const results=await page.evaluate(async()=>{
    const {gameLevels}=await import('/src/game/catalog.ts');
    const {prepareGameMusic}=await import('/src/game/audio/GameMusic.ts');
    const {selectOrbitRange}=await import('/src/game/core/OrbitTrack.ts');
    const {createLevelTrack}=await import('/src/game/core/GameLevel.ts');
    const {compileMultipartScore}=await import('/src/game/core/MultipartScore.ts');
    const context=new AudioContext(),meter=context.createAnalyser(),data=new Float32Array(2048),results=[];
    meter.fftSize=data.length;
    const create=context.createGain.bind(context);
    context.createGain=()=>{const gain=create(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>{if(target===context.destination)connect(meter);return connect(target,...args);};return gain;};
    await context.resume();
    try {
      for(const level of gameLevels){
        if(!level.music)continue;
        const score=compileMultipartScore(level.music),starts=score.measureStarts;
        let first=0,max=-1;
        for(let i=0;i<starts.length-1;i++){
          const end=starts[Math.min(i+2,starts.length-1)];
          const count=score.notes.filter(n=>n.beat>=starts[i]&&n.beat<end).length;
          if(count>max){first=i;max=count;}
        }
        const track=selectOrbitRange(createLevelTrack(level),{startMeasure:first,endMeasure:Math.min(first+2,starts.length-1)});
        let peak=0,energy=0,frames=0,player;
        const timer=setInterval(()=>{meter.getFloatTimeDomainData(data);for(const v of data){peak=Math.max(peak,Math.abs(v));energy+=v*v;}frames+=data.length;},10);
        try {
          player=await prepareGameMusic(context,level.music,track,160);
          const start=context.currentTime+.1;
          player.start({audioTimeAt:ms=>start+ms/1000},'automatic');
          await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(level.id+': completion timeout')),12000);player.finish(()=>{clearTimeout(timeout);resolve();});});
          results.push({id:level.id,parts:level.music.parts.length,firstBar:first+1,peak,rms:Math.sqrt(energy/frames)});
        }finally{player?.stop();clearInterval(timer);}
      }
      return results;
    }finally{meter.disconnect();await context.close();}
  });
  const invalid=results.filter(r=>!(r.peak>.001&&r.peak<.95));
  if(errors.length||invalid.length)throw Error(JSON.stringify({errors,invalid,results}));
  return results;
}
