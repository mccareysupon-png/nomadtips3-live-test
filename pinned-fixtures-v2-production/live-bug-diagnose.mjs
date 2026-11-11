import {chromium,devices} from 'playwright';

async function run(label,opts){
  const browser=await chromium.launch({headless:true});
  const ctx=await browser.newContext(opts);
  const page=await ctx.newPage();
  await page.goto('https://ball46.com/?pin-live-bug='+label+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.BALL46_PIN_V2?.version==='fresh-v2-20261111',null,{timeout:90000});
  await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
  await page.evaluate(()=>window.BALL46_PIN_V2.clear());
  await page.waitForTimeout(500);

  async function snapshot(tag){
    const s=await page.evaluate(()=>{
      const sections=[...document.querySelectorAll('[data-board-sections] [data-status-section]')].map(sec=>({
        key:sec.getAttribute('data-status-section'),
        title:sec.querySelector('.status-head h2')?.textContent?.trim()||'',
        count:sec.querySelectorAll('.match-row[data-match-id]').length,
        ids:[...sec.querySelectorAll('.match-row[data-match-id]')].map(r=>r.dataset.matchId)
      }));
      return {
        sections,
        totalRows:document.querySelectorAll('[data-board-sections] .match-row[data-match-id]').length,
        liveRows:[...document.querySelectorAll('[data-board-sections] [data-status-section="live"] .match-row[data-match-id]')].map(r=>r.dataset.matchId),
        pinnedRows:[...document.querySelectorAll('[data-board-sections] [data-status-section="pinned"] .match-row[data-match-id]')].map(r=>r.dataset.matchId),
        stored:window.BALL46_PIN_V2.getIds()
      };
    });
    console.log(tag+'='+JSON.stringify(s));
    return s;
  }

  const before=await snapshot(label+'_BEFORE');
  const targetSel='[data-board-sections] [data-status-section="live"] .match-row[data-match-id]';
  const liveCount=await page.locator(targetSel).count();
  if(liveCount===0){
    console.log(label+'_NO_LIVE_MATCHES=1');
    await ctx.close();await browser.close();return;
  }
  const target=page.locator(targetSel).nth(Math.min(1,liveCount-1));
  const id=await target.getAttribute('data-match-id');
  await target.locator('[data-b46-pin-v2]').click();
  await page.waitForTimeout(500);
  const after=await snapshot(label+'_AFTER');
  console.log(label+'_TARGET='+id);
  console.log(label+'_LIVE_COUNT_DELTA='+(after.liveRows.length-before.liveRows.length));
  console.log(label+'_TOTAL_COUNT_DELTA='+(after.totalRows-before.totalRows));
  await page.screenshot({path:'pinned-fixtures-v2-production/'+label.toLowerCase()+'-live-bug.png',fullPage:false});
  await ctx.close();await browser.close();
}
await run('DESKTOP',{viewport:{width:1440,height:1000}});
await run('MOBILE',{...devices['Pixel 7']});
