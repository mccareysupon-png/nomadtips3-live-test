import { chromium } from 'playwright';

async function verify(viewport,label){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport,deviceScaleFactor:1});
  let apiCount=0;
  page.on('request',req=>{if(req.url().includes('/api/full-market/'))apiCount++});
  await page.goto('https://ball46.com/?compact-prod-qa='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{timeout:90000});

  const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
  let expanded=null;
  for(let i=0;i<Math.min(await rows.count(),20);i++){
    const row=rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    await row.click({timeout:10000}).catch(()=>{});
    const exp=page.locator('.match-expanded[data-expanded-match]').last();
    try{
      await exp.locator('[data-full-market-card] [data-fmb-book]').first().waitFor({state:'visible',timeout:12000});
      expanded=exp;
      break;
    }catch{}
  }
  if(!expanded)throw new Error(label+'_NO_EXPANDED_FULL_MARKET');

  const host=expanded.locator('[data-full-market-card]');
  const head=host.locator('.fmb-head');
  const panel=host.locator('[data-fmb-panel]');
  const headText=(await head.innerText()).trim();
  if(headText!=='Select a bookmaker to view prices.')throw new Error(label+'_HEAD_TEXT_'+JSON.stringify(headText));

  const collapsedVisible=await panel.isVisible().catch(()=>false);
  if(collapsedVisible)throw new Error(label+'_EMPTY_PANEL_VISIBLE');

  const before=apiCount;
  const first=host.locator('[data-fmb-book]').first();
  await first.click({timeout:10000});
  await page.waitForFunction(()=>{
    const p=document.querySelector('.match-expanded [data-fmb-panel]');
    return p && getComputedStyle(p).display!=='none' && (p.querySelector('.fmb-market')||p.querySelector('table')||p.textContent.trim().length>0);
  },null,{timeout:15000});
  await page.waitForTimeout(500);
  const deltaOpen=apiCount-before;
  if(deltaOpen!==0)throw new Error(label+'_API_DELTA_OPEN_'+deltaOpen);

  await first.click({timeout:10000});
  await page.waitForFunction(()=>{
    const p=document.querySelector('.match-expanded [data-fmb-panel]');
    return p && getComputedStyle(p).display==='none';
  },null,{timeout:10000});
  const deltaCollapse=apiCount-before;
  if(deltaCollapse!==0)throw new Error(label+'_API_DELTA_COLLAPSE_'+deltaCollapse);

  console.log(label+'_PASS=1 FULLMARKET_API_DELTA_ON_CLICK=0');
  await browser.close();
}

await verify({width:1440,height:1000},'DESKTOP');
await verify({width:390,height:844},'MOBILE');
