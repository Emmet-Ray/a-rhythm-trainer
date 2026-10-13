// Run against an isolated Vite origin; all API traffic is mocked.
async page => {
  const origin = new URL(page.url()).origin;
  await page.unrouteAll({behavior:'ignoreErrors'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const exercise={timeSignature:{beats:4,beatType:4},measures:Array.from({length:2},()=>({elements:Array.from({length:4},()=>({kind:'note',noteValue:'quarter'}))}))};
  await page.route(url=>url.pathname.startsWith('/api/'),route=>{
    const url=new URL(route.request().url());
    let json={status:'unavailable'};
    if(url.pathname.includes('model-connections')) json={provider:'deepseek',deepseek:{configured:false,models:[]},chatgpt:{configured:false,models:[]}};
    if(url.pathname.includes('/custom-exercises/')) json={id:url.pathname.split('/').at(-1),name:'四分音符',mode:url.pathname.endsWith('dictation')?'dictation':'tapping',created_at:'2026-10-13T00:00:00Z',exercise};
    if(url.pathname.endsWith('/lookup'))json=null;
    if(url.pathname.endsWith('/records') && route.request().method()==='POST')json={id:'layout-record'};
    return route.fulfill({json});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/custom/tapping/tapping');
  await page.getByRole('checkbox',{name:'只练习当前小节'}).waitFor();
  const help=page.locator('.practice-heading-actions').getByRole('button',{name:'查看快捷键'});
  await help.click();
  await page.getByRole('dialog',{name:'快捷键',exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭快捷键'}).click();
  const assertAligned = async selector => {
    const content = await page.locator('.practice-content').boundingBox();
    const measure = await page.locator(selector).first().boundingBox();
    if(Math.abs(content.x - measure.x) > 1) throw Error('measure background is inset from content');
  };
  await assertAligned('.score-measure-select');
  await page.screenshot({path:'/tmp/layout-tapping.png',fullPage:true});
  for(const width of [1440,800,600,390]){
    await page.setViewportSize({width,height:1000});
    if(width===1440){
      const boxes=await page.locator('.practice-toolbar, .practice-settings-row').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}}));
      if(boxes[1].top>=boxes[0].bottom || boxes[1].left<boxes[0].right)throw Error('desktop actions and settings are not side by side');
    }
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow tapping '+width);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/custom/dictation/dictation');
  await page.getByRole('button',{name:'跳到小节 2',exact:true}).click();
  const nav=page.locator('.practice-content').getByRole('group',{name:'小节导航'});
  if(await nav.getByRole('button',{name:'跳到小节 2',exact:true}).getAttribute('aria-pressed')!=='true')throw Error('navigation did not select answer');
  await page.getByRole('button',{name:'四分音符',exact:true}).click();
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'四分音符',exact:true}).click();
  await page.getByRole('button',{name:'验证当前小节',exact:true}).click();
  await nav.getByRole('button',{name:'跳到小节 2，正确',exact:true}).waitFor();
  await nav.getByRole('button',{name:'跳到小节 2，正确',exact:true}).click();
  await page.getByRole('checkbox',{name:'仅播放当前小节'}).check();
  await page.getByRole('button',{name:'查看答案',exact:true}).click();
  await nav.getByRole('button',{name:'跳到小节 1',exact:true}).click();
  const hide=page.getByRole('button',{name:'返回作答',exact:true});
  await hide.click();
  if(await nav.getByRole('button',{name:'跳到小节 2，正确',exact:true}).getAttribute('aria-pressed')!=='true')throw Error('reference navigation altered answer selection');
  await assertAligned('.rhythm-measure-selection');
  await page.screenshot({path:'/tmp/layout-dictation.png',fullPage:true});
  for(const width of [800,600,390]){
    await page.setViewportSize({width,height:1000});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('overflow dictation '+width);
  }
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await page.screenshot({path:'/tmp/layout-dictation-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/custom/tapping/tapping');
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByRole('button',{name:'增加小节',exact:true}).click();
  await page.getByRole('button',{name:'跳到小节 3',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/layout-editor.png',fullPage:true});
  await page.getByRole('button',{name:'减少小节',exact:true}).click();
  if(errors.length)throw Error(errors.join('\n'));
  return 'one toolbar, header shortcut help, responsive widths, answer selection and independent reference browsing passed';
}
