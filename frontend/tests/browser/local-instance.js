// 在独立测试后端上运行：会创建题目、记录，不使用真实模型
async page => {
  const origin = new URL(page.url()).origin;
  const name = `实例回归-${Date.now()}`;
  const check = (value, message) => { if (!value) throw Error(message); };
  await page.unrouteAll({behavior:"ignoreErrors"});
  await page.goto(`${origin}/custom/tapping/new`);
  await page.getByRole('textbox', {name:'练习名称'}).fill(name);
  await page.getByRole('button', {name:'全音符',exact:true}).click();
  await page.getByRole('button', {name:'跳到小节 2',exact:true}).click();
  await page.getByRole('button', {name:'全音符',exact:true}).click();
  await page.route('**/api/custom-exercises', route => route.fulfill({status:503,json:{detail:'测试保存失败'}}));
  await page.getByRole('button', {name:'保存练习',exact:true}).click();
  await page.getByRole('alert').waitFor();
  check(await page.getByRole('textbox',{name:'练习名称'}).inputValue()===name,'失败保留草稿');
  await page.unroute('**/api/custom-exercises');
  await page.getByRole('button', {name:'保存练习',exact:true}).click();
  await page.waitForURL(`${origin}/custom/tapping`);
  await page.reload();
  const row=page.locator('li').filter({hasText:name});
  await row.getByRole('link',{name:/编辑/}).click();
  await page.getByRole('textbox',{name:'练习名称'}).fill(`${name}-修改`);
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.getByText('修改已保存',{exact:true}).waitFor();
  await page.reload();
  check(await page.getByRole('textbox',{name:'练习名称'}).inputValue()===`${name}-修改`,'编辑持久化');
  await page.getByRole('link',{name:'题目列表',exact:true}).click();
  await page.locator('li').filter({hasText:`${name}-修改`}).getByRole('link',{name:/开始练习/}).click();
  await page.getByRole('button',{name:'击拍练习',exact:true}).click();
  await page.locator('.trainer-countdown').waitFor();
  await page.locator('.trainer-countdown').waitFor({state:'detached'});
  await page.getByRole('button',{name:'停止',exact:true}).click();
  await page.getByRole('link',{name:'练习记录',exact:true}).click();
  await page.getByText(`${name}-修改`,{exact:true}).waitFor();
  await page.reload();
  await page.getByText(`${name}-修改`,{exact:true}).waitFor();
  await page.goto(`${origin}/settings?category=local-data`);
  check(await page.getByRole('button',{name:'账号',exact:true}).count()===0,'移除账号分类');
  check(await page.getByRole('button',{name:/导入/}).count()===0,'移除临时导入入口');
  const id=`听写回归-${Date.now()}`;
  await page.goto(`${origin}/custom/dictation/new`);
  await page.getByRole('textbox',{name:'练习名称'}).fill(id);
  await page.getByRole('button',{name:'全音符',exact:true}).click();
  await page.getByRole('button',{name:'跳到小节 2',exact:true}).click();
  await page.getByRole('button',{name:'全音符',exact:true}).click();
  await page.getByRole('button',{name:'保存练习',exact:true}).click();
  await page.waitForURL(`${origin}/custom/dictation`);
  await page.locator('li').filter({hasText:id}).getByRole('link',{name:/开始练习/}).click();
  await page.getByRole('button',{name:'播放题目',exact:true}).click();
  await page.getByRole('button',{name:'停止',exact:true}).click();
  await page.getByRole('button',{name:'全音符',exact:true}).click();
  await page.getByRole('button',{name:'验证当前小节',exact:true}).click();
  await page.getByRole('link',{name:'练习记录',exact:true}).click();
  await page.getByText(id,{exact:true}).waitFor();
  await page.reload();
  await page.getByText(id,{exact:true}).waitFor();
 const read=path=>page.evaluate(async path=>(await fetch(path)).json(),path);
 const readRecords=async()=>{
   const list=await read('/api/local-data/records?page_size=100');
   return {records: await Promise.all(list.records.map(async record=>{
     const details=await read('/api/local-data/records/'+record.id+'?page_size=100');
     return {...record,attempts:details.attempts};
   }))};
 };
 const isRecordWrite=r=>['POST','PUT'].includes(r.request().method()) &&
   (/\/records$/.test(new URL(r.request().url()).pathname)||r.request().url().includes('/attempts'));

 const tapping=(await read('/api/custom-exercises?mode=tapping')).items[0];
 const dictation=(await read('/api/custom-exercises?mode=dictation')).items[0];
 await page.route('**/api/custom-exercises?*',r=>r.fulfill({status:503,json:{detail:'读取失败'}}));
 await page.goto(origin+'/custom/tapping');
 await page.getByRole('button',{name:'重试读取'}).waitFor();
 await page.unroute('**/api/custom-exercises?*');
 await page.getByRole('button',{name:'重试读取'}).click();
 await page.getByRole('heading',{name:tapping.name,exact:true}).waitFor();
 const detail='**/api/custom-exercises/'+tapping.id;
 await page.route(detail,r=>r.fulfill({status:503,json:{detail:'读取失败'}}));
 await page.locator('li').filter({hasText:tapping.name}).getByRole('link',{name:/开始练习/}).click();
 const tappingUrl=page.url();
 await page.getByRole('heading',{name:'无法读取练习'}).waitFor();
 await page.unroute(detail);
 await page.getByRole('button',{name:'重试读取'}).click();
 await page.getByRole('button',{name:'击拍练习',exact:true}).waitFor();
 await page.goto(tappingUrl.replace('/tapping/','/dictation/'));
 await page.getByRole('heading',{name:'未找到该练习'}).waitFor();
 await page.goto(tappingUrl.replace(tapping.id,'missing-test-id'));
 await page.getByRole('heading',{name:'无法读取练习'}).waitFor();
 check(await page.getByRole('button',{name:'击拍练习',exact:true}).count()===0,'不存在题目不能进入训练');
 await page.goto(origin+'/custom/dictation');
 await page.locator('li').filter({hasText:dictation.name}).getByRole('link',{name:/开始练习/}).click();
 let failed=false;
 await page.route('**/api/local-data/records**',async r=>{
  if(isRecordWrite(r)&&!failed){failed=true;await r.fulfill({status:503,json:{detail:'测试记录保存失败'}})}else await r.continue();
 });
 await page.getByRole('button',{name:'播放题目',exact:true}).click();
 await page.getByRole('button',{name:'停止',exact:true}).click();
 await page.getByRole('button',{name:'重试保存'}).waitFor();
 await page.getByRole('button',{name:'重试保存'}).click();
 await page.getByRole('button',{name:'重试保存'}).waitFor({state:'detached'});
 await page.unroute('**/api/local-data/records**');
 // 后端已提交，但浏览器没有收到响应；重试必须按尝试 ID 覆盖累计值
 const playCount=state=>state.records.filter(r=>r.exerciseId===dictation.id)
   .flatMap(r=>r.attempts).reduce((sum,a)=>sum+a.measures[0].questionPlayCount,0);
 const beforeLost=playCount(await readRecords());
 let lost=false;
 await page.route('**/api/local-data/records**',async r=>{
   if(isRecordWrite(r)&&!lost){lost=true;await r.fetch();await r.abort('failed')}
   else await r.continue();
 });
 await page.getByRole('button',{name:'播放题目',exact:true}).click();
 await page.getByRole('button',{name:'停止',exact:true}).click();
 await page.getByRole('button',{name:'重试保存'}).waitFor();
 check(playCount(await readRecords())===beforeLost+1,'响应丢失前后端已保存');
 await page.getByRole('button',{name:'重试保存'}).click();
 await page.getByRole('button',{name:'重试保存'}).waitFor({state:'detached'});
 await page.unroute('**/api/local-data/records**');
 check(playCount(await readRecords())===beforeLost+1,'响应丢失重试不重复计数');
 let saved=JSON.stringify(await readRecords());
 await page.getByRole('link',{name:'练习记录',exact:true}).click();
 await page.goBack();
 await page.getByRole('button',{name:'播放题目',exact:true}).waitFor();
 check(JSON.stringify(await readRecords())===saved,'重返练习不可重复计数');
 // 两个独立页面同时保存，必须归入同一档案并保留双方的尝试
 const beforeTabs=playCount(await readRecords());
 const tabs=await Promise.all([page.context().newPage(),page.context().newPage()]);
 let arrivals=0,releaseTabs;
 const bothSaving=new Promise(resolve=>releaseTabs=resolve);
 try {
   await Promise.all(tabs.map(async tab=>{
     let first=true;
     await tab.route('**/api/local-data/records**',async r=>{
       if(isRecordWrite(r)&&first){
         first=false;arrivals++;if(arrivals===2)releaseTabs();await bothSaving;
       }
       await r.continue();
     });
     await tab.goto(origin+'/custom/dictation/'+dictation.id);
     await tab.getByRole('button',{name:'播放题目',exact:true}).click();
     await tab.getByRole('button',{name:'停止',exact:true}).click();
   }));
   await page.waitForFunction(async ({id,count})=>{
     const list=await (await fetch('/api/local-data/records?page_size=100')).json();
     const records=await Promise.all(list.records.filter(r=>r.exerciseId===id).map(async r=>
       (await (await fetch('/api/local-data/records/'+r.id+'?page_size=100')).json()).attempts));
     return records.flat().reduce((sum,a)=>sum+a.measures[0].questionPlayCount,0)===count;
   },{id:dictation.id,count:beforeTabs+2});
 } finally {
   releaseTabs();
   await Promise.all(tabs.map(tab=>tab.close()));
 }
 saved=JSON.stringify(await readRecords());
 await page.goto(origin+'/custom/tapping');
 const deleteRow=page.locator('li').filter({hasText:tapping.name});
 await page.evaluate(()=>{window.confirm=()=>false});
 await deleteRow.getByRole('button',{name:/删除/}).click();
 check(await deleteRow.count()===1,'取消删除保留题目');
 await page.evaluate(()=>{window.confirm=()=>true});
 await deleteRow.getByRole('button',{name:/删除/}).click();
 await deleteRow.waitFor({state:'detached'});
 await page.reload();
 check(!(await read('/api/custom-exercises?mode=tapping')).items.some(x=>x.id===tapping.id),'删除持久化');
 await page.goto(origin+'/settings?category=local-data');
 await page.getByRole('button',{name:'清空记录',exact:true}).waitFor();
 await page.evaluate(()=>{window.confirm=()=>false});
 await page.getByRole('button',{name:'清空记录',exact:true}).click();
 check(JSON.stringify(await readRecords())===saved,'取消清空记录');
 await page.route('**/api/local-data/records**',r=>r.request().method()==='DELETE'?r.fulfill({status:503,json:{detail:'测试清空失败'}}):r.continue());
 await page.evaluate(()=>{window.confirm=()=>true});
 await page.getByRole('button',{name:'清空记录',exact:true}).click();
 await page.getByRole('alert').waitFor();
 check(JSON.stringify(await readRecords())===saved,'清空失败保留记录');
 await page.unroute('**/api/local-data/records**');
 await page.evaluate(()=>{window.confirm=()=>true});
 await page.getByRole('button',{name:'清空记录',exact:true}).click();
 await page.getByText('练习记录已清空，自定义题库未修改',{exact:true}).waitFor();
 check((await readRecords()).records.length===0,'清空记录');
 check((await read('/api/custom-exercises?mode=dictation')).items.length>0,'保留题库');
 await page.evaluate(()=>{window.confirm=()=>false});
 await page.getByRole('button',{name:'清空题库',exact:true}).click();
 check((await read('/api/custom-exercises?mode=dictation')).items.length>0,'取消清空题库');
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/api/local-data/exercises',async r=>{if(r.request().method()==='DELETE')await gate;await r.continue()});
 await page.evaluate(()=>{window.confirm=()=>true});
 await page.getByRole('button',{name:'清空题库',exact:true}).click();
 check(await page.getByRole('button',{name:'清空题库',exact:true}).isDisabled(),'清空期间按钮禁用');
 release();
 await page.getByText('题库已清空',{exact:true}).waitFor();
 await page.unrouteAll({behavior:'wait'});
 await page.reload();
 check((await read('/api/custom-exercises?mode=dictation')).items.length===0,'题库清空持久化');

  console.log('PASS: 本地实例创建、编辑、记录、读取失败恢复、模式隔离、重试去重、删除与清空');
}
