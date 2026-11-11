import {chromium,devices} from 'playwright';

async function verify(contextOptions,label){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(contextOptions);
  const page=await ctx.newPage();
  await page.goto('https://ball46.com/?latest-odds-copy-qa='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
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

  const head=expanded.locator('[data-full-market-card] .fmb-head');
  const txt=((await head.textContent())||'').trim();
  if(txt!=='Select a bookmaker to view the latest odds.')throw new Error(label+'_HEAD_TEXT_'+JSON.stringify(txt));
  const style=await head.evaluate(el=>({
    inlineSize:el.style.fontSize,
    weight:getComputedStyle(el).fontWeight,
    shadow:getComputedStyle(el).textShadow
  }));
  if(style.inlineSize!=='90%')throw new Error(label+'_FONT_SIZE_'+style.inlineSize);
  if(style.weight!=='700')throw new Error(label+'_FONT_WEIGHT_'+style.weight);
  if(style.shadow==='none')throw new Error(label+'_TEXT_SHADOW_NONE');
  console.log(label+'_PASS=1 '+JSON.stringify(style));
  await browser.close();
}

await verify({viewport:{width:1440,height:1000}},'DESKTOP');
await verify({...devices['Pixel 7']},'MOBILE');
