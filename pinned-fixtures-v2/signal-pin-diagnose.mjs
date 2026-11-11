import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await ctx.newPage();

await page.goto('https://ball46.com/?signal-pin-diag='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
await page.waitForTimeout(1000);

const candidates=await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('[data-board-sections] .match-row[data-match-id]')];
  return rows.map(r=>{
    const nodes=[...r.querySelectorAll('*')].filter(el=>{
      const s=((el.className||'')+' '+[...el.attributes].map(a=>a.name+'='+a.value).join(' ')+' '+(el.textContent||'')).toLowerCase();
      return /signal|alert|warning|notify|badge/.test(s);
    }).map(el=>({
      tag:el.tagName,
      cls:typeof el.className==='string'?el.className:'',
      attrs:[...el.attributes].reduce((o,a)=>(o[a.name]=a.value,o),{}),
      text:(el.textContent||'').trim().slice(0,160)
    }));
    return {id:r.dataset.matchId,section:r.closest('[data-status-section]')?.getAttribute('data-status-section'),nodes};
  }).filter(x=>x.nodes.length);
});
console.log('SIGNAL_CANDIDATES='+JSON.stringify(candidates.slice(0,20)));

if(!candidates.length)throw new Error('NO_SIGNAL_CANDIDATE_FOUND');
const target=candidates[0];
const id=target.id;

async function snap(tag){
  const v=await page.locator('.match-row[data-match-id="'+id+'"]').evaluate(r=>({
    section:r.closest('[data-status-section]')?.getAttribute('data-status-section'),
    html:r.outerHTML,
    signalNodes:[...r.querySelectorAll('*')].filter(el=>{
      const s=((el.className||'')+' '+[...el.attributes].map(a=>a.name+'='+a.value).join(' ')+' '+(el.textContent||'')).toLowerCase();
      return /signal|alert|warning|notify|badge/.test(s);
    }).map(el=>({
      tag:el.tagName,
      cls:typeof el.className==='string'?el.className:'',
      attrs:[...el.attributes].reduce((o,a)=>(o[a.name]=a.value,o),{}),
      text:(el.textContent||'').trim().slice(0,160),
      display:getComputedStyle(el).display,
      visibility:getComputedStyle(el).visibility,
      opacity:getComputedStyle(el).opacity
    }))
  }));
  console.log(tag+'='+JSON.stringify(v));
  return v;
}

await snap('BEFORE');
await page.locator('.match-row[data-match-id="'+id+'"] [data-b46-pin-v2]').click();
await page.waitForTimeout(500);
await snap('AFTER');

console.log('TARGET_ID='+id);
await page.screenshot({path:'pinned-fixtures-v2/signal-pin-after.png',fullPage:false});
await browser.close();
