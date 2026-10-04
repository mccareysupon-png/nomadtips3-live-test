import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const input=readFileSync('league-flags-343.asset.js','utf8');
assert(input.includes("img.loading='lazy';"),'EXPECTED_LAZY_LINE_MISSING');
const source=input.replace("img.loading='lazy';","img.loading='eager';");
assert(!source.includes("img.loading='lazy';"),'LAZY_STILL_PRESENT');
assert(source.includes("img.loading='eager';"),'EAGER_PATCH_MISSING');

const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const outDir='audit/league-flags-image-load-proof';
mkdirSync(outDir,{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  const failed=[];
  page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||'failed'}));
  await page.setContent(`<!doctype html><html><head></head><body><div id="root">
    <button data-league-filter="Brazil Serie A"><span>Brazil Serie A</span><b>1</b></button>
    <button data-league-filter="Thailand Premier League"><span>Thailand Premier League</span><b>1</b></button>
    <button data-league-filter="Northern Ireland Championship"><span>Northern Ireland Championship</span><b>1</b></button>
    <button data-league-filter="Senegal Premier League"><span>Senegal Premier League</span><b>1</b></button>
    <button data-league-filter="UEFA Nations League A"><span>UEFA Nations League A</span><b>1</b></button>
  </div></body></html>`,{waitUntil:'domcontentloaded'});
  await page.addScriptTag({content:source});
  await page.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.version==='343-league-flags-menu-143-20261004b',{timeout:10000});
  await page.waitForFunction(()=>document.querySelectorAll('img.league-flag').length===4,{timeout:20000});
  const state=await page.evaluate(()=>[...document.querySelectorAll('[data-league-filter] > span')].map(span=>({
    text:span.querySelector('.league-label')?.textContent||span.textContent,
    code:span.dataset.leagueFlagCode,
    img:span.querySelector('img.league-flag')?.src||null,
    globe:Boolean(span.querySelector('.league-globe'))
  })));
  assert.deepEqual(state.map(x=>x.code),['br','th','gb-nir','sn','WORLD']);
  assert.equal(state.filter(x=>x.img).length,4,'COUNTRY_IMAGES_NOT_4');
  assert.equal(state[4].globe,true,'WORLD_GLOBE_MISSING');
  assert(failed.filter(x=>/flag-icons|flagcdn/i.test(x.url)).length===0,`FLAG_REQUEST_FAILURES:${JSON.stringify(failed)}`);
  writeFileSync(`${outDir}/result.json`,JSON.stringify({result:'PASS',state,failed},null,2));
  await page.screenshot({path:`${outDir}/proof.png`,fullPage:true});
  console.log(JSON.stringify({result:'PASS',state,failed},null,2));
}finally{await browser.close();}
