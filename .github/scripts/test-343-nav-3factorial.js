const { chromium } = require('playwright');

const close=(a,b,tol=.75)=>Math.abs(Number(a)-Number(b))<=tol;
const pages={live:'index.html',signal:'signal.html',statistics:'statistics.html'};
const permutations=[
  ['live','signal','statistics'],
  ['live','statistics','signal'],
  ['signal','live','statistics'],
  ['signal','statistics','live'],
  ['statistics','live','signal'],
  ['statistics','signal','live'],
];

(async()=>{
  const base=process.env.TARGET_URL;
  if(!base) throw new Error('TARGET_URL missing');
  const browser=await chromium.launch({headless:true});
  const viewports=[
    {name:'desktop',width:1366,height:900,mobile:false},
    {name:'desktop-xl',width:1920,height:1000,mobile:false},
    {name:'mobile',width:390,height:844,mobile:true},
  ];

  const snap=async(page,label)=>page.evaluate((label)=>{
    const html=document.documentElement;
    const body=document.body;
    const topbar=document.querySelector('.topbar')?.getBoundingClientRect();
    const inner=document.querySelector('.topbar-inner')?.getBoundingClientRect();
    const shell=document.querySelector('.shell')?.getBoundingClientRect();
    const topnav=document.querySelector('.topnav')?.getBoundingClientRect();
    const mobileNav=document.querySelector('.mobile-nav')?.getBoundingClientRect();
    const hs=getComputedStyle(html),bs=getComputedStyle(body);
    return {
      label,path:location.pathname,
      innerWidth,clientWidth:html.clientWidth,scrollWidth:html.scrollWidth,
      bodyMarginTop:bs.marginTop,bodyMarginLeft:bs.marginLeft,
      overflowY:hs.overflowY,scrollbarGutter:hs.scrollbarGutter,
      topbar:{x:topbar?.x,y:topbar?.y,w:topbar?.width,h:topbar?.height},
      inner:{x:inner?.x,y:inner?.y,w:inner?.width,h:inner?.height},
      shell:{x:shell?.x,y:shell?.y,w:shell?.width},
      topnav:{x:topnav?.x,y:topnav?.y,w:topnav?.width,h:topnav?.height},
      mobileNav:{x:mobileNav?.x,y:mobileNav?.y,w:mobileNav?.width,h:mobileNav?.height},
      active:[...document.querySelectorAll('[data-nav].active')].map(a=>a.dataset.nav),
    };
  },label);

  const compare=(vp,perm,baseline,s)=>{
    const fail=(name)=>{throw new Error(`${vp.name} ${perm.join('>')} ${name} ${JSON.stringify({baseline,s})}`)};
    if(s.bodyMarginTop!=='0px'||s.bodyMarginLeft!=='0px') fail('BODY_MARGIN_SHAKE');
    if(s.clientWidth!==baseline.clientWidth) fail('CLIENT_WIDTH_SHAKE');
    if(s.scrollWidth>s.clientWidth+2) fail('ROOT_HORIZONTAL_OVERFLOW');
    for(const box of ['topbar','inner']){
      for(const k of ['x','y','w','h']) if(!close(s[box][k],baseline[box][k])) fail(`${box.toUpperCase()}_${k.toUpperCase()}_SHAKE`);
    }
    for(const k of ['x','w']) if(!close(s.shell[k],baseline.shell[k])) fail(`SHELL_${k.toUpperCase()}_SHAKE`);
    const navBox=vp.mobile?'mobileNav':'topnav';
    for(const k of ['x','y','w','h']) if(!close(s[navBox][k],baseline[navBox][k])) fail(`${navBox.toUpperCase()}_${k.toUpperCase()}_SHAKE`);
    if(!s.active.includes(s.label)) fail('ACTIVE_NAV_MISMATCH');
  };

  for(const vp of viewports){
    for(const perm of permutations){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      await page.goto(`${base}/${pages[perm[0]]}?factorial=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForTimeout(60);
      const states=[await snap(page,perm[0])];
      for(const target of perm.slice(1)){
        const link=page.locator(`a[data-nav="${target}"]:visible`).first();
        await link.waitFor({state:'visible',timeout:15000});
        await Promise.all([page.waitForLoadState('domcontentloaded'),link.click()]);
        await page.waitForTimeout(60);
        states.push(await snap(page,target));
      }
      const baseline=states[0];
      for(const s of states) compare(vp,perm,baseline,s);
      console.log('3FACTORIAL NAV OK',vp.name,perm.join(' > '),states.map(s=>({label:s.label,topbar:s.topbar,shell:s.shell,nav:vp.mobile?s.mobileNav:s.topnav})));
      await page.close();
    }
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
