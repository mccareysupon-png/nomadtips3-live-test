import {chromium,devices} from 'playwright';

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();
const calls=[];
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/full-market/'))calls.push(r.url())});

await page.goto('https://ball46.com/?compact-mobile-qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
await page.waitForTimeout(2500);

let expanded=null;
const mobileCards=page.locator('[data-b46gn-fixture]');
if(await mobileCards.count()){
  for(let i=0;i<Math.min(await mobileCards.count(),12);i++){
    await mobileCards.nth(i).click({timeout:10000}).catch(()=>{});
    const e=page.locator('.match-expanded[data-expanded-match]').last();
    if(await e.count()){
      try{
        await e.locator('[data-full-market-card] [data-fmb-book]').first().waitFor({state:'attached',timeout:8000});
        expanded=e;break;
      }catch{}
    }
    await page.locator('[data-b46gn-dismiss]').click({timeout:2000}).catch(()=>{});
  }
}else{
  const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
  for(let i=0;i<Math.min(await rows.count(),12);i++){
    await rows.nth(i).evaluate(el=>el.click());
    const e=page.locator('.match-expanded[data-expanded-match]').last();
    if(await e.count()){
      try{
        await e.locator('[data-full-market-card] [data-fmb-book]').first().waitFor({state:'attached',timeout:8000});
        expanded=e;break;
      }catch{}
    }
  }
}
if(!expanded)throw new Error('MOBILE_NO_EXPANDED_FULLMARKET');

const host=expanded.locator('[data-full-market-card]');
const headText=((await host.locator('.fmb-head').textContent())||'').trim();
if(headText!=='Select a bookmaker to view prices.')throw new Error('MOBILE_HEAD_TEXT_'+JSON.stringify(headText));

const panel=host.locator('[data-fmb-panel]');
if(await panel.locator('.fmb-market,table').count())throw new Error('MOBILE_TABLE_RENDERED_BEFORE_CLICK');
if(await panel.isVisible().catch(()=>false))throw new Error('MOBILE_EMPTY_PANEL_VISIBLE');

const btn=host.locator('[data-fmb-book].has-data').first();
if(!await btn.count())throw new Error('MOBILE_NO_BOOK_WITH_DATA');

const before=calls.length;
await btn.evaluate(el=>el.click());
await panel.locator('.fmb-market,table').first().waitFor({state:'attached',timeout:15000});
await page.waitForFunction(()=> {
  const p=document.querySelector('.match-expanded [data-fmb-panel]');
  return p && getComputedStyle(p).display!=='none';
},null,{timeout:10000});
await page.waitForTimeout(500);
const after=calls.length;
if(after!==before)throw new Error('MOBILE_CLICK_ADDED_FULLMARKET_API_CALL');

await btn.evaluate(el=>el.click());
await page.waitForFunction(()=> {
  const p=document.querySelector('.match-expanded [data-fmb-panel]');
  return p && getComputedStyle(p).display==='none';
},null,{timeout:10000});
if(await panel.locator('.fmb-market,table').count())throw new Error('MOBILE_SAME_BOOK_DID_NOT_COLLAPSE');

console.log('MOBILE_PASS=1 FULLMARKET_API_DELTA_ON_CLICK='+(after-before));
await browser.close();
