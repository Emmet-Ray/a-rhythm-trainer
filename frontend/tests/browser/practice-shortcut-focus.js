// Run on /random/dictation with an isolated app and temporary backend.
async page => {
 const check=(ok,msg)=>{if(!ok)throw Error(msg)};
 const settings=page.getByRole('button',{name:'生成设置',exact:true});
 const score=page.locator('.rhythm-draft-viewport');
 await settings.click();
 await page.getByRole('combobox',{name:'拍号',exact:true}).click();
 await page.getByRole('option',{name:'2/4',exact:true}).click();
 const original=await score.elementHandle();
 await page.keyboard.press('n');
 check(await original.evaluate(el=>el.isConnected),'dialog should block N');
 await page.getByRole('button',{name:'关闭生成设置',exact:true}).click();
 await page.waitForTimeout(250);
 check(await settings.evaluate(el=>el===document.activeElement),'close restores trigger focus');
 await page.keyboard.press('n');
 await page.waitForTimeout(100);
 check(!await original.evaluate(el=>el.isConnected),'N must replace question');
 check(!await settings.evaluate(el=>el.matches(':focus-visible')),'no stale focus ring');
 await settings.focus();
 await page.keyboard.press('Tab');
 check(await page.evaluate(()=>document.activeElement.matches(':focus-visible')),'Tab retains focus indication');
 await settings.focus();
 await page.keyboard.press('Enter');
 check(await page.locator('dialog:modal').count()===1,'Enter opens dialog');
 await page.keyboard.press('Escape');
 await page.waitForTimeout(250);
 const next=await score.elementHandle();
 await page.keyboard.press('n');
 await page.waitForTimeout(100);
 check(!await next.evaluate(el=>el.isConnected),'N after Escape works');
 await page.getByRole('button',{name:'换一题',exact:true}).click();
 const afterClick=await score.elementHandle();
 await page.keyboard.press('n');
 await page.waitForTimeout(100);
 check(!await afterClick.evaluate(el=>el.isConnected),'N after ordinary button click works');
 return {passed:true};
}
