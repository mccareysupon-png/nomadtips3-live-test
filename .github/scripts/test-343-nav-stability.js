const { chromium } = require('playwright');

const close = (a,b,tol=0.75) => Math.abs(a-b) <= tol;

(async()=>{
  const base = process.env.TARGET_URL;
  if(!base) throw new Error('TARGET_URL missing');
  const browser = await chromium.launch({headless:true});
  const viewports = [
    {name:'desktop', width:1366, height:900},
    {name:'desktop-xl', width:1920, height:1000},
    {name:'mobile', width:390, height:844},
  ];

  for(const vp of viewports){
    const page = await browser.newPage({viewport:{width:vp.width,height:vp.height}});
    const url = `${base}/index.html?navstable=${Date.now()}`;
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});

    const snap = async(label)=> page.evaluate((label)=>{
      const html = document.documentElement;
      const top = document.querySelector('.topbar-inner')?.getBoundingClientRect();
      const shell = document.querySelector('.shell')?.getBoundingClientRect();
      const cs = getComputedStyle(html);
      return {
        label,
        href: location.pathname,
        innerWidth,
        clientWidth: html.clientWidth,
        scrollWidth: html.scrollWidth,
        overflowY: cs.overflowY,
        scrollbarGutter: cs.scrollbarGutter,
        topLeft: top?.left ?? null,
        topWidth: top?.width ?? null,
        shellLeft: shell?.left ?? null,
        shellWidth: shell?.width ?? null,
      };
    },label);

    const states=[];
    states.push(await snap('live'));

    for(const target of ['signal','statistics','live']){
      const link = page.locator(`a[data-nav="${target}"]:visible`).first();
      await link.waitFor({state:'visible',timeout:15000});
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        link.click(),
      ]);
      states.push(await snap(target));
    }

    const baseline = states[0];
    for(const s of states){
      if(s.overflowY !== 'scroll') throw new Error(`${vp.name} ${s.label} overflowY=${s.overflowY}`);
      if(!String(s.scrollbarGutter).includes('stable')) throw new Error(`${vp.name} ${s.label} gutter=${s.scrollbarGutter}`);
      if(!close(s.topLeft,baseline.topLeft) || !close(s.topWidth,baseline.topWidth)){
        throw new Error(`${vp.name} TOPBAR_SHAKE ${JSON.stringify(states)}`);
      }
      if(!close(s.shellLeft,baseline.shellLeft) || !close(s.shellWidth,baseline.shellWidth)){
        throw new Error(`${vp.name} SHELL_SHAKE ${JSON.stringify(states)}`);
      }
      if(s.clientWidth !== baseline.clientWidth){
        throw new Error(`${vp.name} VIEWPORT_WIDTH_SHAKE ${JSON.stringify(states)}`);
      }
      if(s.scrollWidth > s.clientWidth + 2){
        throw new Error(`${vp.name} ROOT_HORIZONTAL_OVERFLOW ${JSON.stringify(s)}`);
      }
    }
    console.log('NAV STABLE OK',vp.name,states);
    await page.close();
  }

  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
