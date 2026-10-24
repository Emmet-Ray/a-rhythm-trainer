// Isolated Vite origin with mocked APIs. Poster pixels must follow route changes.
async page => {
 const origin=new URL(page.url()).origin;
 await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:route.request().url().includes('sessions')?[]:route.request().url().includes('model-connections')?{provider:'deepseek',deepseek:{configured:true,models:['deepseek-chat']},chatgpt:{configured:false,models:[]}}:{status:'ready'}}));
 await page.setViewportSize({width:1440,height:900});
 const ids=['quarter','eighth','quarter-eighth','sixteenth','eighth-sixteenth','eighth-sixteenths','sixteenths-eighth','dotted-eighth','reverse-dotted-eighth','small-syncopation','triplet','eighth-triplet','comprehensive'];
 const images=[];
 for(const id of ids){
  await page.goto(origin+'/game/'+id);
  await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
  images.push((await page.screenshot({clip:{x:280,y:82,width:465,height:135}})).toString('base64'));
 }
 if(new Set(images).size!==13)throw Error('Some level posters are identical or stale');
 await page.goto(origin+'/game/quarter');await page.waitForFunction(()=>document.querySelector('.orbit-start')?.disabled===false);
 const repeat=(await page.screenshot({clip:{x:280,y:82,width:465,height:135}})).toString('base64');
 if(repeat!==images[0])throw Error('Returning to quarter retained another level poster');
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 return '13 different poster pairs; route return restores original pair; no mobile overflow';
}
