import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const html=fs.readFileSync('/tmp/b46page.html','utf8');
const scripts=Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),m=>m[1]).filter(s=>s.includes('function layout(chart,s)')&&s.includes('.b46-eventflow-signal-annotation'));
assert.equal(scripts.length,1,'PRODUCTION_PRESENTATION_HOOK_NOT_UNIQUE');
const styles=Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),m=>m[1]).filter(s=>s.includes('b46-flow-lane')||s.includes('b46-flow-space'));
assert(styles.length,'PRODUCTION_LANE_CSS_MISSING');
const fixture=fs.readFileSync('qa-output/expanded-match-343.candidate.js.preview.html','utf8');
const svg=fixture.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
assert(svg,'FIXTURE_SVG_MISSING');
const make=(width)=>'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+styles.join('\n')+'</style><style>body{margin:20px;background:#071b16;color:#eef5ef;font-family:system-ui}.expand-flow-card{width:min(100%,'+width+'px);position:relative}.expand-card-head{height:43px}.expand-flow-legend{height:23.5px}.expand-flow-chart{height:199px;width:100%;position:relative}.expand-flow-chart>svg{display:block;height:100%;width:100%;}</style></head><body><h2>BALL46 · Event Flow isolated test</h2><p>Replay only — not a live match. Current production card presentation, patched annotations.</p><div class="expand-flow-card"><div class="expand-card-head">Adana Demirspor — Kastamonuspor</div><div class="expand-flow-legend">48′ / 63′ / 63′ · 3 signals</div><div class="expand-flow-chart" data-b46-flow="1">'+svg+'</div></div><script>'+scripts[0]+'</script></body></html>';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const reports=[];
try{
 for(const t of [{width:1440,chart:1000},{width:1090,chart:750},{width:900,chart:700}]){
 const page=await browser.newPage();
 try{
 await page.setViewport({width:t.width,height:800});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setContent(make(t.chart),{waitUntil:'load'});
 await page.waitForFunction(()=>document.querySelectorAll('.b46-flow-signal').length===3,{timeout:5000});
 const result=await page.evaluate(()=>{
  const buttons=Array.from(document.querySelectorAll('.b46-flow-signal'));
  const cards=buttons.map(e=>{const r=e.getBoundingClientRect();return {label:e.innerText,title:e.title,x:r.x,y:r.y,w:r.width,h:r.height};});
  const overlap=cards.some((a,i)=>cards.slice(i+1).some(b=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y));
  return {cards,overlap,connectors:document.querySelectorAll('.b46-flow-connectors path').length,svgEntries:document.querySelectorAll('.b46-eventflow-signal-annotation').length};
 });
 assert.equal(result.cards.length,3);assert.equal(result.svgEntries,3);assert.equal(result.connectors,3);
 assert(result.cards.every(x=>x.w>0&&x.h>0));
 assert.equal(result.cards.filter(x=>x.label.includes('63')).length,2);
 assert(result.cards.some(x=>x.label.includes('2.10'))&&result.cards.some(x=>x.label.includes('2.03')));
 assert(!result.overlap,'VISIBLE_CARD_OVERLAP');assert.deepEqual(errors,[]);
 reports.push({...t,...result});
 await page.screenshot({path:'qa-output/desktop-'+t.width+'.png'});
 }finally{await page.close()}
 }
}finally{await browser.close()}
fs.writeFileSync('qa-output/eventflow-browser-preview.html',make(750));
fs.writeFileSync('qa-output/browser-report.json',JSON.stringify(reports,null,2));
console.log('PRODUCTION_PRESENTATION_REPLAY_PASS '+JSON.stringify(reports));
