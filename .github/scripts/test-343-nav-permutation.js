const { chromium } = require('playwright');

const PAGES={live:'index.html',signal:'signal.html',statistics:'statistics.html'};
const ORDERS=[
  ['live','signal','statistics'],['live','statistics','signal'],
  ['signal','live','statistics'],['signal','statistics','live'],
  ['statistics','live','signal'],['statistics','signal','live'],
];
const VIEWPORTS=[
  {name:'desktop',width:1366,height:900},
  {name:'desktop-xl',width:1920,height:1000},
  {name:'mobile',width:390,height:844},
];
const close=(a,b,tol=.75)=>a!==null&&b!==null&&Math.abs(a-b)<=tol;

(async()=>{
  const base=process.env.TARGET_URL;
  if(!base)throw new Error('TARGET_URL missing');
  const browser=await chromium.launch({headless:true});

  for(const vp of VIEWPORTS){
    for(const order of ORDERS){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const states=[];

      const snap=async(label)=>page.evaluate((label)=>{
        const html=document.documentElement,body=document.body;
        const topEl=document.querySelector('.topbar-inner');
        const shellEl=document.querySelector('.shell');
        const navEl=[...document.querySelectorAll('.topnav,.mobile-nav')].find(el=>getComputedStyle(el).display!=='none');
        const odds=document.querySelector('.odds-format-control');
        const lang=document.querySelector('.nomad343-language');
        const rect=el=>el?.getBoundingClientRect();
        const top=rect(topEl),shell=rect(shellEl),nav=rect(navEl),oddsRect=rect(odds),langRect=rect(lang);
        return {
          label,path:location.pathname,bodyMargin:getComputedStyle(body).margin,
          critical:document.querySelector('style[data-nomad-nav-stability]')?.getAttribute('data-nomad-nav-stability')||'',
          appHref:document.querySelector('link[href^="app.css"]')?.getAttribute('href')||'',
          clientWidth:html.clientWidth,scrollWidth:html.scrollWidth,
          topLeft:top?.left??null,topTop:top?.top??null,topWidth:top?.width??null,topHeight:top?.height??null,
          shellLeft:shell?.left??null,shellTop:shell?.top??null,shellWidth:shell?.width??null,
          navLeft:nav?.left??null,navTop:nav?.top??null,navWidth:nav?.width??null,navHeight:nav?.height??null,
          oddsPosition:odds?getComputedStyle(odds).position:null,oddsLeft:oddsRect?.left??null,
          langPosition:lang?getComputedStyle(lang).position:null,langLeft:langRect?.left??null,
          desktopNavCount:document.querySelectorAll('.topnav').length,mobileNavCount:document.querySelectorAll('.mobile-nav').length,
        };
      },label);

      const settleAndCheck=async(label)=>{
        await page.waitForFunction(()=>document.querySelector('.topbar-inner')&&document.querySelector('.shell'),null,{timeout:15000});
        const a=await snap(label);
        await page.waitForTimeout(80);
        const b=await snap(label);
        await page.waitForTimeout(140);
        const c=await snap(label);
        for(const [x,y,name] of [
          [a.topLeft,c.topLeft,'topLeft'],[a.topWidth,c.topWidth,'topWidth'],[a.topHeight,c.topHeight,'topHeight'],
          [a.shellLeft,c.shellLeft,'shellLeft'],[a.shellTop,c.shellTop,'shellTop'],[a.shellWidth,c.shellWidth,'shellWidth'],
          [a.navLeft,c.navLeft,'navLeft'],[a.navTop,c.navTop,'navTop'],[a.navWidth,c.navWidth,'navWidth'],[a.navHeight,c.navHeight,'navHeight'],
        ]){
          if(!close(x,y))throw new Error(`${vp.name} ${order.join('>')} ${label} LATE_SHAKE ${name} ${x} -> ${y} INITIAL=${JSON.stringify(a)} MID=${JSON.stringify(b)} FINAL=${JSON.stringify(c)}`);
        }
        if(c.bodyMargin!=='0px')throw new Error(`${vp.name} ${label} bodyMargin=${c.bodyMargin}`);
        if(c.critical!=='343-nav-stable-v5')throw new Error(`${vp.name} ${label} critical=${c.critical}`);
        if(!c.appHref.includes('343-nav-stable-v5'))throw new Error(`${vp.name} ${label} appHref=${c.appHref}`);
        if(c.desktopNavCount!==1||c.mobileNavCount!==1)throw new Error(`${vp.name} ${label} noncanonical nav DOM d=${c.desktopNavCount} m=${c.mobileNavCount}`);
        if(c.scrollWidth>c.clientWidth+2)throw new Error(`${vp.name} ${label} ROOT_HORIZONTAL_OVERFLOW ${JSON.stringify(c)}`);
        if(vp.width>760){
          await page.waitForFunction(()=>document.querySelector('.odds-format-control')&&document.querySelector('.nomad343-language'),null,{timeout:5000});
          const after=await snap(label);
          if(after.oddsPosition!=='absolute'||after.langPosition!=='absolute')throw new Error(`${vp.name} ${label} CONTROLS_STILL_IN_NAV_FLOW ${JSON.stringify(after)}`);
          if(!close(after.navLeft,c.navLeft)||!close(after.navWidth,c.navWidth))throw new Error(`${vp.name} ${label} CONTROL_INJECTION_MOVED_NAV ${JSON.stringify({c,after})}`);
        }
        states.push(c);return c;
      };

      await page.goto(`${base}/${PAGES[order[0]]}?perm=${Date.now()}-${Math.random()}`,{waitUntil:'domcontentloaded',timeout:45000});
      await settleAndCheck(order[0]);
      for(let i=1;i<order.length;i++){
        const target=order[i],link=page.locator(`a[data-nav="${target}"]:visible`).first();
        await link.waitFor({state:'visible',timeout:15000});
        await Promise.all([page.waitForLoadState('domcontentloaded'),link.click()]);
        await settleAndCheck(target);
      }

      const first=states[0];
      for(const s of states){
        if(!close(s.topLeft,first.topLeft)||!close(s.topWidth,first.topWidth)||!close(s.topHeight,first.topHeight))throw new Error(`${vp.name} ${order.join('>')} TOPBAR_SHAKE ${JSON.stringify(states)}`);
        if(!close(s.shellLeft,first.shellLeft)||!close(s.shellTop,first.shellTop)||!close(s.shellWidth,first.shellWidth))throw new Error(`${vp.name} ${order.join('>')} SHELL_SHAKE ${JSON.stringify(states)}`);
        if(!close(s.navLeft,first.navLeft)||!close(s.navTop,first.navTop)||!close(s.navWidth,first.navWidth)||!close(s.navHeight,first.navHeight))throw new Error(`${vp.name} ${order.join('>')} NAV_SHAKE ${JSON.stringify(states)}`);
      }
      console.log(`PERMUTATION OK ${vp.name} ${order.join(' -> ')}`);
      await page.close();
    }
    console.log(`ALL 3! NAV ORDERS OK ${vp.name}`);
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
