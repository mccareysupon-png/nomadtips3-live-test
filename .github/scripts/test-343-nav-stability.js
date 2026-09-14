const { chromium } = require('playwright');

const close = (a,b,tol=0.75) => Math.abs(a-b) <= tol;
const paths = { signal:'/signal.html', statistics:'/statistics.html', live:'/index.html' };

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

    const settle = async()=>{
      await page.waitForLoadState('load');
      await page.locator('.shell').waitFor({state:'visible',timeout:15000});
      await page.waitForFunction(()=>{
        const critical = document.querySelector('style[data-nomad-nav-stability="343-nav-stable-v2"]');
        return !!critical && getComputedStyle(document.body).margin === '0px';
      },null,{timeout:15000});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    };

    await page.goto(`${base}/index.html?navstable=${Date.now()}`,{waitUntil:'load',timeout:45000});
    await settle();

    const snap = async(label)=> page.evaluate((label)=>{
      const html = document.documentElement;
      const top = document.querySelector('.topbar-inner')?.getBoundingClientRect();
      const shell = document.querySelector('.shell')?.getBoundingClientRect();
      const visibleNav = [...document.querySelectorAll('nav')].find(n=>{
        const r=n.getBoundingClientRect();
        const cs=getComputedStyle(n);
        return cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0;
      })?.getBoundingClientRect();
      return {
        label,
        href: location.pathname,
        innerWidth,
        clientWidth: html.clientWidth,
        scrollWidth: html.scrollWidth,
        bodyMargin:getComputedStyle(document.body).margin,
        topLeft: top?.left ?? null,
        topWidth: top?.width ?? null,
        shellLeft: shell?.left ?? null,
        shellWidth: shell?.width ?? null,
        navTop: visibleNav?.top ?? null,
        navHeight: visibleNav?.height ?? null,
      };
    },label);

    const states=[await snap('live')];

    for(const target of ['signal','statistics','live']){
      const link = page.locator(`a[data-nav="${target}"]:visible`).first();
      await link.waitFor({state:'visible',timeout:15000});
      await Promise.all([
        page.waitForURL(url=>url.pathname.endsWith(paths[target]),{timeout:45000}),
        link.click(),
      ]);
      await settle();
      states.push(await snap(target));
    }

    const baseline = states[0];
    for(const s of states){
      if(s.bodyMargin !== '0px') throw new Error(`${vp.name} ${s.label} BODY_MARGIN ${JSON.stringify(s)}`);
      if(!close(s.topLeft,baseline.topLeft) || !close(s.topWidth,baseline.topWidth)){
        throw new Error(`${vp.name} TOPBAR_SHAKE ${JSON.stringify(states)}`);
      }
      if(!close(s.shellLeft,baseline.shellLeft) || !close(s.shellWidth,baseline.shellWidth)){
        throw new Error(`${vp.name} SHELL_SHAKE ${JSON.stringify(states)}`);
      }
      if(!close(s.navTop,baseline.navTop) || !close(s.navHeight,baseline.navHeight)){
        throw new Error(`${vp.name} NAV_SHAKE ${JSON.stringify(states)}`);
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
