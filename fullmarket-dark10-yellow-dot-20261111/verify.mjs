import {chromium,devices} from 'playwright';

async function verify(contextOptions,label){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(contextOptions);
  const page=await ctx.newPage();
  let fullMarketApiCalls=0;
  page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/full-market/'))fullMarketApiCalls++});
  await page.goto('https://ball46.com/?dark10-dot-qa='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
  await page.waitForTimeout(1800);

  let expanded=null;
  const mobileCards=page.locator('[data-b46gn-fixture]');
  if(await mobileCards.count()){
    for(let i=0;i<Math.min(await mobileCards.count(),12);i++){
      await mobileCards.nth(i).click({timeout:10000}).catch(()=>{});
      const e=page.locator('.match-expanded[data-expanded-match]').last();
      if(await e.count()){try{await e.locator('[data-full-market-card] .fmb-head').waitFor({state:'attached',timeout:8000});expanded=e;break}catch{}}
      await page.locator('[data-b46gn-dismiss]').click({timeout:2000}).catch(()=>{});
    }
  }else{
    const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
    for(let i=0;i<Math.min(await rows.count(),12);i++){
      await rows.nth(i).evaluate(el=>el.click());
      const e=page.locator('.match-expanded[data-expanded-match]').last();
      if(await e.count()){try{await e.locator('[data-full-market-card] .fmb-head').waitFor({state:'attached',timeout:8000});expanded=e;break}catch{}}
    }
  }
  if(!expanded)throw new Error(label+'_NO_EXPANDED_FULLMARKET');

  const host=expanded.locator('[data-full-market-card]');
  const head=host.locator('.fmb-head');
  const txt=((await head.locator('[data-b46-fmb-copy]').textContent())||'').trim();
  if(txt!=='Select a bookmaker to view the latest odds.')throw new Error(label+'_HEAD_TEXT_'+JSON.stringify(txt));

  const style=await head.evaluate(el=>({
    size:el.style.fontSize,
    weight:getComputedStyle(el).fontWeight,
    gap:getComputedStyle(el).gap
  }));
  if(style.size!=='90%')throw new Error(label+'_FONT_SIZE_'+style.size);
  if(style.weight!=='700')throw new Error(label+'_FONT_WEIGHT_'+style.weight);

  const dot=host.locator('[data-b46-fmb-dot]');
  if(!await dot.count())throw new Error(label+'_DOT_MISSING');
  const dotStyle=await dot.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,w:getComputedStyle(el).width,h:getComputedStyle(el).height,shadow:getComputedStyle(el).boxShadow,animations:el.getAnimations().length}));
  if(dotStyle.bg!=='rgb(246, 201, 69)')throw new Error(label+'_DOT_COLOR_'+dotStyle.bg);
  if(dotStyle.w!=='7px'||dotStyle.h!=='7px')throw new Error(label+'_DOT_SIZE_'+dotStyle.w+'x'+dotStyle.h);
  if(dotStyle.shadow==='none')throw new Error(label+'_DOT_SHADOW_NONE');

  const shade=host.locator('[data-b46-fmb-shade]');
  if(!await shade.count())throw new Error(label+'_SHADE_MISSING');
  const shadeBg=await shade.evaluate(el=>getComputedStyle(el).backgroundColor);
  const theme=await page.evaluate(()=>document.documentElement.getAttribute('data-theme'));
  if(theme==='light'){
    if(shadeBg!=='rgba(0, 0, 0, 0)')throw new Error(label+'_LIGHT_SHADE_'+shadeBg);
  }else{
    if(shadeBg!=='rgba(0, 0, 0, 0.1)')throw new Error(label+'_DARK_SHADE_'+shadeBg);
  }

  const panel=host.locator('[data-fmb-panel]');
  if(await panel.isVisible().catch(()=>false))throw new Error(label+'_PANEL_VISIBLE_BEFORE_CLICK');
  const btn=host.locator('[data-fmb-book].has-data').first();
  if(await btn.count()){
    const before=fullMarketApiCalls;
    await btn.evaluate(el=>el.click());
    await panel.locator('.fmb-market,table').first().waitFor({state:'attached',timeout:15000});
    await page.waitForTimeout(350);
    if(fullMarketApiCalls!==before)throw new Error(label+'_ADDED_FULLMARKET_API_CALL');
  }

  console.log(label+'_PASS=1 '+JSON.stringify({style,dotStyle,shadeBg,theme}));
  await browser.close();
}

await verify({viewport:{width:1440,height:1000}},'DESKTOP');
await verify({...devices['Pixel 7']},'MOBILE');
