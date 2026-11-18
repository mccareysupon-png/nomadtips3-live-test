import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const dir='candidate';
const finance=fs.readFileSync(dir+'/finance.test.js','utf8');
const visual=fs.readFileSync(dir+'/visual.test.js','utf8');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:950});
 await page.setCacheEnabled(false);
 const served=new Set(),errors=[],graphs=[];
 await page.setRequestInterception(true);
 page.on('request',r=>{const p=new URL(r.url()).pathname;let body=p==='/longterm-performance-343.js'?finance:p==='/b46-statistics-card-20261116.js'?visual:null;if(body){served.add(p);void r.respond({status:200,contentType:'application/javascript; charset=utf-8',body})}else void r.continue()});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(new URL(r.url()).pathname==='/b46-receiver-v1/graph'&&r.ok())void r.json().then(g=>graphs.push(g)).catch(()=>{})});
 await page.evaluateOnNewDocument(()=>{
  window.__totalFrames=[];
  let last='';
  function tick(){
   const c=document.querySelector('#b46-finance-chart-card'),o=c?.querySelector('.f46-overview');
   const old=o?.querySelector('.f46-metrics'),grid=o?.querySelector('.b46-stage-summary-grid');
   const visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
   const f={owner:c?.dataset.b46TotalOwner??null,overview:!!o,old:visible(old),new:visible(grid),outcomes:visible(o?.querySelector('.b46-stage-outcomes'))};
   const key=JSON.stringify(f);if(key!==last){window.__totalFrames.push({t:Math.round(performance.now()),...f});last=key}
   requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
 });
 await page.goto('https://ball46.com/statistics.html?b46TotalTest='+Date.now(),{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('#b46-finance-chart-card[data-b46-total-owner="receiver"] .b46-stage-summary-grid',{timeout:25000});
 const first=await page.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card');window.__firstTotalOverview=c.querySelector('.f46-overview');return {t:Math.round(performance.now()),tiles:[...c.querySelectorAll('.b46-stage-summary-item')].map(e=>[e.dataset.key,e.querySelector('strong').textContent]),frames:window.__totalFrames}});
 await new Promise(r=>setTimeout(r,16500));
 const later=await page.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card');return {sameOverview:c.querySelector('.f46-overview')===window.__firstTotalOverview,tiles:[...c.querySelectorAll('.b46-stage-summary-item')].map(e=>[e.dataset.key,e.querySelector('strong').textContent]),frames:window.__totalFrames,outcomes:[...c.querySelectorAll('.b46-stage-outcomes-segment')].map(e=>[e.dataset.result,Number(e.dataset.count)]),oldVisible:!!c.querySelector('.f46-metrics')?.getBoundingClientRect().width}});
 await page.screenshot({path:dir+'/TOTAL-test.png'});
 const g=graphs.filter(g=>g.market==='all'&&g.range==='all').at(-1);
 const report={first,later,served:[...served],errors,graph:g?{sequence:g.sequence,summary:g.summary,counts:g.counts}:null};
 fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));
 console.log('TEST_REPORT '+JSON.stringify(report));
 assert.equal(served.size,2);assert.equal(later.tiles.length,8);assert(g,'receiver graph not captured');
 assert.deepEqual(Object.fromEntries(later.outcomes),{win:g.summary.wins,push:g.summary.pushes,loss:g.summary.losses});
 assert.equal(Object.fromEntries(later.tiles).rate,g.series.rate.at(-1).value.toFixed(1)+'%');
 assert(!later.frames.some(f=>f.owner==='receiver'&&f.old),'old metrics visible while receiver owns TOTAL');
 assert(!later.oldVisible,'old metric row still visible');
 console.log('TEST_ONLY_PASS');
}finally{await browser.close()}
