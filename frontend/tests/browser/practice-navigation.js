// Run on an isolated frontend/backend with temporary data.
async page => {
  const origin = new URL(page.url()).origin;
  const check = (value, message) => { if (!value) throw Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width:1440, height:1000 });
  await page.goto(origin + '/practice');
  const hub = page.locator('.practice-hub');
  await hub.waitFor();
  check(await hub.locator('li a').count() === 4, 'four entry points');
  await page.screenshot({path:'/tmp/ia-hub-desktop.png'});
  for (const [path, selector] of [['preset','.preset-library'],['random','.random-page'],['custom','.custom-catalog'],['records','.practice-records-page']]) {
    await hub.locator('a[href="/' + path + '"]').click();
    await page.locator(selector).waitFor();
    check(await page.locator('.site-sidebar a[href="/practice"]').getAttribute('aria-current') === 'location', 'child highlight');
    check(await page.getByRole('navigation',{name:'练习来源'}).count() === 0, 'old tabs remain');
    await page.screenshot({path:'/tmp/ia-hub-' + path + '.png'});
    await page.getByRole('link',{name:'返回练习',exact:true}).click();
    await hub.waitFor();
  }
  await hub.locator('a[href="/preset"]').click();
  await page.locator('.preset-library').waitFor();
  await page.locator('.site-sidebar a[href="/practice"]').click();
  await hub.waitFor();
  await page.reload();
  await hub.waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/ia-hub-mobile.png'});
  check(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
  await page.getByRole('button',{name:'打开导航菜单'}).click();
  check(await page.getByRole('dialog',{name:'导航菜单'}).getByRole('link',{name:'练习',exact:true}).getAttribute('href') === '/practice', 'mobile entry');
  await page.getByRole('button',{name:'关闭导航菜单'}).click();
  await page.getByRole('dialog',{name:'导航菜单'}).waitFor({state:'hidden'});
  check(!errors.length, errors.join('\n'));
  return 'Practice hub, four destinations, child return links, sidebar, refresh and mobile navigation passed';
}
