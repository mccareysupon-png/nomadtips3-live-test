import { chromium } from 'playwright';
import fs from 'node:fs';

const lazy=fs.readFileSync('fullmarket-lazy-preview-20261110/lazy-preview.js','utf8');
const css=fs.readFileSync('fullmarket-lazy-preview-20261110/lazy-preview.css','utf8');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1200},deviceScaleFactor:1});
await page.goto('https://ball46.com/?lazy-preview='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForSelector('[data-board-sections] .match-row[data-match-id]',{timeout:90000});

await page.addStyleTag({content:css});
await page.addScriptTag({content:lazy});

// Open the first fixture card that can produce expanded content.
const rows=page.locator('[data-board-sections] .match-row[data-match-id]');
let opened=false;
for(let i=0;i<Math.min(await rows.count(),15);i++){
  const row=rows.nth(i);
  await row.scrollIntoViewIfNeeded();
  await row.click({timeout:10000}).catch(()=>{});
  const exp=page.locator('.match-expanded[data-expanded-match]');
  if(await exp.count()){
    try{
      await page.waitForSelector('.match-expanded [data-full-market-card] [data-fmb-tabs] [data-fmb-book]',{timeout:12000});
      opened=true;break;
    }catch{}
  }
}
if(!opened)throw new Error('NO_EXPANDED_FULL_MARKET_CARD');

const expanded=page.locator('.match-expanded[data-expanded-match]').last();
await expanded.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);

await page.screenshot({path:'fullmarket-lazy-preview-20261110/01-bookmakers-only.png',fullPage:false});
await expanded.screenshot({path:'fullmarket-lazy-preview-20261110/01-card-bookmakers-only.png'});

const firstBook=expanded.locator('[data-fmb-book]').filter({has:page.locator('b')}).first();
await firstBook.click({timeout:10000});
await page.waitForFunction(()=>document.querySelector('.match-expanded [data-fmb-panel] .fmb-market, .match-expanded [data-fmb-panel] table'),null,{timeout:15000});
await page.waitForTimeout(500);

await page.screenshot({path:'fullmarket-lazy-preview-20261110/02-bookmaker-prices.png',fullPage:false});
await expanded.screenshot({path:'fullmarket-lazy-preview-20261110/02-card-bookmaker-prices.png'});

console.log('SCREENSHOTS_OK=1');
await browser.close();
