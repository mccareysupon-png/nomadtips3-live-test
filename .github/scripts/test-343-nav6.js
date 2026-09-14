const { chromium } = require('playwright');
const pages={live:'index.html',signal:'signal.html',statistics:'statistics.html'};
const perms=[['live','signal','statistics'],['live','statistics','signal'],['signal','live','statistics'],['signal','statistics','live'],['statistics','live','signal'],['statistics','signal','live']];
const viewports=[{name:'desktop',width:1366,height:900,mobile:false},{name:'desktop-xl',width:1920,height:1000,mobile:false},{name:'mobile',width:390,height:844,mobile:true}];
const close=(a,b,t=.75)=>Math.abs(a-b)<=t;
(async()=>{
  const base=process.env.TARGET_URL;if(!base)throw new Error('TARGET_URL missing');
  const browser=await chromium.launch({headless:true});
  for(const vp of viewports){
    for(const perm of perms){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const snap=async(label)=>page.evaluate(({label,mobile})=>{
        const r=e=>{const x=e?.getBoundingClientRect();return x?{left:x.left,top:x.top,width:x.width,height:x.height}:null};
        return {label,path:location.pathname,topbar:r(document.querySelector('.topbar')),inner:r(document.querySelector('.topbar-inner')),nav:r(document.querySelector(mobile?'.mobile-nav':'.topnav')),app:[...document.styleSheets].map(s=>s.href||'').some(x=>x.includes('app.css'))};
      },{label,mobile:vp.mobile});
      await page.goto(`${base}/${pages[perm[0]]}?nav6=${Date.now()}`,{waitUntil:'load',timeout:45000});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const states=[await snap(perm[0])];
      for(const target of perm.slice(1)){
        const selector=`${vp.mobile?'.mobile-nav':'.topnav'} a[data-nav="${target}"]`;
        const link=page.locator(selector).first();
        await link.waitFor({state:'visible',timeout:15000});
        await Promise.all([page.waitForLoadState('load'),link.click()]);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        states.push(await snap(target));
      }
      const b=states[0];
      for(const s of states){
        if(!s.app||!s.topbar||!s.inner||!s.nav)throw new Error(`${vp.name} ${perm.join('>')} MISSING ${JSON.stringify(states)}`);
        for(const k of ['left','top','width','height']){
          if(!close(s.topbar[k],b.topbar[k]))throw new Error(`${vp.name} ${perm.join('>')} TOPBAR_${k} ${JSON.stringify(states)}`);
          if(!close(s.inner[k],b.inner[k]))throw new Error(`${vp.name} ${perm.join('>')} INNER_${k} ${JSON.stringify(states)}`);
          if(!close(s.nav[k],b.nav[k]))throw new Error(`${vp.name} ${perm.join('>')} NAV_${k} ${JSON.stringify(states)}`);
        }
      }
      console.log('NAV6_OK',vp.name,perm.join('>'));
      await page.close();
    }
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
