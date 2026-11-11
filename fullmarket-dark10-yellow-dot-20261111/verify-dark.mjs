import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('https://ball46.com/?dark10-specific-qa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{state:'attached',timeout:90000});
await page.waitForTimeout(1200);
const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
let expanded=null;
for(let i=0;i<Math.min(await rows.count(),12);i++){
  await rows.nth(i).evaluate(el=>el.click());
  const e=page.locator('.match-expanded[data-expanded-match]').last();
  if(await e.count()){try{await e.locator('[data-full-market-card] [data-b46-fmb-shade]').waitFor({state:'attached',timeout:8000});expanded=e;break}catch{}}
}
if(!expanded)throw new Error('DARK_NO_EXPANDED_FULLMARKET');
const host=expanded.locator('[data-full-market-card]');
const shade=host.locator('[data-b46-fmb-shade]');
const dot=host.locator('[data-b46-fmb-dot]');
const bg=await shade.evaluate(el=>getComputedStyle(el).backgroundColor);
const dotBg=await dot.evaluate(el=>getComputedStyle(el).backgroundColor);
const text=((await host.locator('[data-b46-fmb-copy]').textContent())||'').trim();
if(bg!=='rgba(0, 0, 0, 0.1)')throw new Error('DARK10_SHADE_'+bg);
if(dotBg!=='rgb(246, 201, 69)')throw new Error('DARK_DOT_'+dotBg);
if(text!=='Select a bookmaker to view the latest odds.')throw new Error('DARK_COPY_'+text);
console.log('DARK_MODE_PASS=1 SHADE='+bg+' DOT='+dotBg);
await browser.close();
