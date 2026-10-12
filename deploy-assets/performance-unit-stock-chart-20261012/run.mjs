import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js',CSS='singlepage-workspace-343.css',INDEX='index.html';
const OLD_JSMARK='/* B46_CUMULATIVE_UNIT_CANDLES_V2_20261012 */';
const JSMARK='/* B46_UNIT_STOCK_CHART_V3_20261012 */';
const CSSMARK='/* B46_UNIT_STOCK_CHART_STYLE_V3_20261012 */';
const CACHE='unit-stock-chart-v3-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics chart renderer only. UNITS becomes an interactive stock-style candle viewport with drag pan, wheel zoom, navigator and visible-window Y autoscale. One settled priced result remains one candle. 7D/30D/90D/ALL remain data ranges. ROI/WIN RATE keep existing line/area renderer. No Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function exampleCheck(){
 const profits=[.17,-.80,1.80,2.80],expected=[[0,.17],[.17,-.63],[-.63,1.17],[1.17,3.97]];let net=0;
 const actual=profits.map(p=>{const open=net;net=Number((net+p).toFixed(10));return[Number(open.toFixed(2)),Number(net.toFixed(2))]});
 assert.deepEqual(actual,expected,'UNIT_EXAMPLE_MISMATCH');report.example={profits,actual,final:net};
}
exampleCheck();

function patchJs(src){
 assert(src.includes('function chartHtml(s){/* B46_PERFORMANCE_MARKET_CHART_V3_20261012 */'),'CURRENT_CHART_V3_MISSING');
 assert(src.includes(OLD_JSMARK),'CURRENT_UNIT_CANDLE_V2_MISSING');
 assert(!src.includes(JSMARK),'JS_ALREADY_PATCHED');

 const helperStart=src.indexOf('function unitCandlesSvg(points,geo){'+OLD_JSMARK);
 const chartStart=src.indexOf('function chartHtml(s){/* B46_PERFORMANCE_MARKET_CHART_V3_20261012 */');
 const ensureStart=src.indexOf('function ensureCard(){',chartStart);
 assert(helperStart>=0&&chartStart>helperStart&&ensureStart>chartStart,'UNIT_CHART_BOUNDARY_MISSING');

 const helper=`let b46UnitView={start:null,count:null,total:0};let currentPointOffset=0,currentPointTotal=0;/* B46_UNIT_STOCK_CHART_V3_20261012 */
function unitViewFor(all){
 const total=all.length,minCount=Math.min(20,total),def=Math.min(total,range==='d7'?120:range==='d30'?160:range==='d90'?180:220);
 if(b46UnitView.total!==total||!Number.isFinite(b46UnitView.count)){b46UnitView={start:Math.max(0,total-def),count:def,total}}
 b46UnitView.total=total;b46UnitView.count=Math.max(minCount,Math.min(total,Math.round(b46UnitView.count||def)));
 b46UnitView.start=Math.max(0,Math.min(total-b46UnitView.count,Math.round(Number.isFinite(b46UnitView.start)?b46UnitView.start:total-b46UnitView.count)));
 return b46UnitView
}
function unitCandlesSvg(points,geo){
 const n=points.length,step=n>1?geo.pw/(n-1):geo.pw,bw=Math.max(1.15,Math.min(8.5,step*.62));
 let posD='',negD='',neutralD='',pos=0,neg=0,neutral=0;
 const scale=yScale(points),span=Math.max(.0001,scale.max-scale.min),y=v=>geo.T+(scale.max-v)/span*geo.ph;
 for(let i=0;i<n;i++){
  const p=points[i],close=Number(p.value),profit=Number.isFinite(p.profit)?p.profit:0,open=close-profit;
  const x=geo.L+(n===1?geo.pw/2:i/(n-1)*geo.pw),yo=y(open),yc=y(close);
  if(close>open){posD+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);pos++}
  else if(close<open){negD+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);neg++}
  else{const h=Math.max(.8,bw*.48);neutralD+='M'+(x-h).toFixed(3)+' '+yc.toFixed(3)+'H'+(x+h).toFixed(3);neutral++}
 }
 return '<g class="b46-perf-unit-candles" data-b46-candle-mode="cumulative-open-close" data-b46-candle-count="'+n+'" data-b46-candle-pos="'+pos+'" data-b46-candle-neg="'+neg+'" data-b46-candle-neutral="'+neutral+'"><path class="b46-perf-unit-candle b46-perf-unit-candle-pos" d="'+posD+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-neg" d="'+negD+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-neutral" d="'+neutralD+'" style="stroke-width:'+Math.max(1,bw*.8).toFixed(3)+'px"></path></g>'
}
function unitNavHtml(total,start,count){
 const left=total?start/total*100:0,width=total?count/total*100:100,end=Math.min(total,start+count);
 return '<div class="b46-perf-unit-nav" data-b46-unit-nav><div class="b46-perf-unit-nav-track" data-b46-unit-nav-track><span class="b46-perf-unit-nav-window" data-b46-unit-nav-window style="left:'+left.toFixed(4)+'%;width:'+Math.max(2,width).toFixed(4)+'%"></span></div><div class="b46-perf-unit-nav-meta"><span>SETTLED '+(start+1)+'–'+end+' / '+total+'</span><span>DRAG TO PAN · WHEEL TO ZOOM</span></div></div>'
}
`;
 const chart=`function chartHtml(s){/* B46_PERFORMANCE_MARKET_CHART_V3_20261012 */const all=getPoints(s);if(!all.length){currentPoints=[];currentPointOffset=0;currentPointTotal=0;return'<div class="b46-perf-empty">No priced settled signals in this range.</div>'}if(metric==='units'){const v=unitViewFor(all),points=all.slice(v.start,v.start+v.count);currentPoints=points;currentPointOffset=v.start;currentPointTotal=all.length;const scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo);return '<svg class="b46-perf-svg b46-perf-unit-stock" data-b46-unit-stock="1" data-b46-unit-total="'+all.length+'" data-b46-unit-start="'+v.start+'" data-b46-unit-count="'+v.count+'" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="Net Units candle chart">'+axes+'<line class="b46-perf-zero-line" x1="'+geo.L+'" y1="'+geo.baseY+'" x2="'+(geo.W-geo.R)+'" y2="'+geo.baseY+'"></line>'+unitCandlesSvg(points,geo)+'<line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="'+geo.T+'" x2="0" y2="'+(geo.T+geo.ph)+'" hidden></line><line data-b46-hover-hline class="b46-perf-hover-line b46-perf-hover-hline" x1="'+geo.L+'" y1="0" x2="'+(geo.W-geo.R)+'" y2="0" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="3" hidden></circle></svg><div class="b46-perf-tip" data-b46-perf-tip hidden></div><div class="b46-perf-ybadge" data-b46-perf-ybadge hidden></div><div class="b46-perf-xbadge" data-b46-perf-xbadge hidden></div>'+unitNavHtml(all.length,v.start,v.count)}currentPoints=all;currentPointOffset=0;currentPointTotal=all.length;const points=all,scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo),zeroPct=Math.max(0,Math.min(100,(geo.baseY-geo.T)/geo.ph*100));return \\\`<svg class="b46-perf-svg" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="\${esc(modeLabel())} chart"><defs><linearGradient id="b46PerfLineGradient" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-line-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-line-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-line-neg"></stop><stop offset="100%" class="b46-perf-line-neg"></stop></linearGradient><linearGradient id="b46PerfAreaGradient" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-area-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-area-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-area-neg"></stop><stop offset="100%" class="b46-perf-area-neg"></stop></linearGradient></defs>\${axes}<line class="b46-perf-zero-line" x1="\${geo.L}" y1="\${geo.baseY}" x2="\${geo.W-geo.R}" y2="\${geo.baseY}"></line><path class="b46-perf-area" d="\${geo.area}"></path><path class="b46-perf-line" d="\${geo.line}"></path><line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" hidden></line><line data-b46-hover-hline class="b46-perf-hover-line b46-perf-hover-hline" x1="\${geo.L}" y1="0" x2="\${geo.W-geo.R}" y2="0" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="3" hidden></circle></svg><div class="b46-perf-tip" data-b46-perf-tip hidden></div><div class="b46-perf-ybadge" data-b46-perf-ybadge hidden></div><div class="b46-perf-xbadge" data-b46-perf-xbadge hidden></div>\\\`}`;

 let out=src.slice(0,helperStart)+helper+chart+src.slice(ensureStart);
 out=out.replace("range=b.dataset.b46Range||'all';render()","range=b.dataset.b46Range||'all';b46UnitView={start:null,count:null,total:0};render()");
 out=out.replace('SIGNAL #\${idx+1} / \${total}','SIGNAL #\${currentPointOffset+idx+1} / \${currentPointTotal||total}');

 const bindStart=out.indexOf('function bindChart(){');
 const loadStart=out.indexOf('async function load(){',bindStart);
 assert(bindStart>=0&&loadStart>bindStart,'BIND_CHART_BOUNDARY_MISSING');
 const bind=`function bindChart(){/* B46_UNIT_STOCK_INTERACTION_V3_20261012 */const svg=$('.b46-perf-svg'),wrap=$('[data-b46-chart-wrap]'),tip=$('[data-b46-perf-tip]'),line=$('[data-b46-hover-line]'),hline=$('[data-b46-hover-hline]'),dot=$('[data-b46-hover-dot]'),yBadge=$('[data-b46-perf-ybadge]'),xBadge=$('[data-b46-perf-xbadge]');if(!svg||!wrap||!tip||!line||!hline||!dot||!yBadge||!xBadge||!currentPoints.length)return;wrap.dataset.b46MarketNav='1';dot.setAttribute('r','3');const hide=()=>{line.hidden=true;hline.hidden=true;dot.hidden=true;tip.hidden=true;yBadge.hidden=true;xBadge.hidden=true};const move=e=>{const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;const scale=yScale(currentPoints),geo=pathData(currentPoints,scale.min,scale.max),rawX=(e.clientX-rect.left)/rect.width*geo.W,rawY=(e.clientY-rect.top)/rect.height*geo.H,vx=Math.max(geo.L,Math.min(geo.W-geo.R,rawX)),vy=Math.max(geo.T,Math.min(geo.T+geo.ph,rawY)),pr=Math.max(0,Math.min(1,(vx-geo.L)/geo.pw)),fi=pr*Math.max(0,currentPoints.length-1),lo=Math.floor(fi),hi=Math.min(currentPoints.length-1,Math.ceil(fi)),mix=fi-lo,a=currentPoints[lo],b=currentPoints[hi]||a,lineValue=a.value+(b.value-a.value)*mix,lineY=geo.T+(scale.max-lineValue)/Math.max(.0001,scale.max-scale.min)*geo.ph,idx=Math.max(0,Math.min(currentPoints.length-1,Math.round(fi))),cursorValue=scale.max-(vy-geo.T)/geo.ph*(scale.max-scale.min),cursorDate=(a.date||0)+((b.date||a.date||0)-(a.date||0))*mix;line.hidden=false;hline.hidden=false;dot.hidden=false;line.setAttribute('x1',vx);line.setAttribute('x2',vx);hline.setAttribute('y1',vy);hline.setAttribute('y2',vy);dot.setAttribute('cx',vx);dot.setAttribute('cy',lineY);dot.classList.toggle('positive',lineValue>=0);dot.classList.toggle('negative',lineValue<0);tip.innerHTML=tipMarkup(currentPoints[idx],idx,currentPoints.length);tip.hidden=false;yBadge.textContent='≈ '+valueText(cursorValue);yBadge.classList.toggle('positive',cursorValue>=0);yBadge.classList.toggle('negative',cursorValue<0);yBadge.hidden=false;xBadge.textContent=fmtDate(cursorDate);xBadge.hidden=false;const px=vx/geo.W*rect.width,py=vy/geo.H*rect.height,linePy=lineY/geo.H*rect.height;tip.style.left=Math.max(112,Math.min(rect.width-112,px))+'px';tip.style.top=Math.max(100,Math.min(rect.height-36,linePy))+'px';yBadge.style.top=Math.max(15,Math.min(rect.height-28,py))+'px';xBadge.style.left=Math.max(48,Math.min(rect.width-48,px))+'px'};
 svg.addEventListener('pointermove',move);svg.addEventListener('pointerleave',hide);svg.addEventListener('pointercancel',hide);
 if(metric!=='units'){svg.addEventListener('pointerdown',move);return}
 const clampStart=n=>Math.max(0,Math.min(b46UnitView.total-b46UnitView.count,Math.round(n)));
 svg.addEventListener('wheel',e=>{e.preventDefault();const rect=svg.getBoundingClientRect(),frac=Math.max(0,Math.min(1,(e.clientX-rect.left)/Math.max(1,rect.width))),oldCount=b46UnitView.count,minCount=Math.min(20,b46UnitView.total),next=Math.max(minCount,Math.min(b46UnitView.total,Math.round(oldCount*(e.deltaY<0?.82:1.22))));if(next===oldCount)return;const anchor=b46UnitView.start+frac*Math.max(0,oldCount-1);b46UnitView.count=next;b46UnitView.start=clampStart(anchor-frac*Math.max(0,next-1));render()},{passive:false});
 const beginDrag=(clientX,sourceWidth)=>{const startX=clientX,start0=b46UnitView.start,count=b46UnitView.count,total=b46UnitView.total;const onMove=ev=>{const delta=Math.round((startX-ev.clientX)/Math.max(1,sourceWidth)*count),next=Math.max(0,Math.min(total-count,start0+delta));if(next!==b46UnitView.start){b46UnitView.start=next;render()}};const stop=()=>{window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop)};window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',stop,{once:true});window.addEventListener('pointercancel',stop,{once:true})};
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;hide();e.preventDefault();beginDrag(e.clientX,svg.getBoundingClientRect().width)});
 const track=$('[data-b46-unit-nav-track]'),win=$('[data-b46-unit-nav-window]');if(track){track.addEventListener('pointerdown',e=>{e.preventDefault();const r=track.getBoundingClientRect();if(e.target===win){beginDrag(e.clientX,r.width);return}const frac=Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width)));b46UnitView.start=clampStart(frac*b46UnitView.total-b46UnitView.count/2);render()})}
}`;
 out=out.slice(0,bindStart)+bind+out.slice(loadStart);
 const block=out.slice(out.indexOf(JSMARK)-100,out.indexOf(JSMARK)+12000);
 assert(!/VOLUME/i.test(block),'VOLUME_TEXT_FORBIDDEN');assert(!/\\b(wick|high|low)\\b/i.test(block),'FAKE_WICK_HIGH_LOW_FORBIDDEN');
 return out;
}

const cssAdd=`
/* B46_UNIT_STOCK_CHART_STYLE_V3_20261012 */
body[data-workspace-view="statistics"] .b46-perf-unit-stock{cursor:grab;touch-action:none}
body[data-workspace-view="statistics"] .b46-perf-unit-stock:active{cursor:grabbing}
body[data-workspace-view="statistics"] .b46-perf-unit-candles{pointer-events:none}
body[data-workspace-view="statistics"] .b46-perf-unit-candle{fill:none!important;stroke-linecap:butt!important;stroke-linejoin:miter!important;vector-effect:non-scaling-stroke!important;opacity:.96!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-pos{stroke:#27c77a!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neg{stroke:#e55364!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neutral{stroke:#8a9baa!important;opacity:.78!important}
body[data-workspace-view="statistics"] .b46-perf-unit-nav{margin:3px 54px 0 58px;user-select:none}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-track{height:12px;position:relative;border-radius:999px;cursor:pointer;overflow:hidden;background:rgba(127,151,170,.12);border:1px solid rgba(127,151,170,.14)}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-window{position:absolute;top:1px;bottom:1px;border-radius:999px;min-width:12px;background:rgba(77,174,222,.36);border:1px solid rgba(111,204,245,.55);box-shadow:0 0 10px rgba(60,170,225,.12);cursor:grab}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-window:active{cursor:grabbing}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-meta{display:flex;justify-content:space-between;gap:12px;margin-top:4px;font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif;font-size:8px;font-weight:700;letter-spacing:.04em;opacity:.68}
@media(max-width:720px){body[data-workspace-view="statistics"] .b46-perf-unit-nav{margin-left:48px;margin-right:44px}.b46-perf-unit-nav-meta span:last-child{display:none}}
`;

function patchIndex(src){
 let out=src;
 out=out.replace(/longterm-performance-343\.js\?v=[^"'<>\s]+/g,'longterm-performance-343.js?v='+CACHE);
 out=out.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v='+CACHE);
 assert(out.includes('longterm-performance-343.js?v='+CACHE),'LONGTERM_CACHE_BUST_MISSING');return out;
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1050});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&unitStockV3Verify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const before=await page.evaluate(()=>{const q=s=>document.querySelector(s),g=q('.b46-perf-unit-stock'),c=q('.b46-perf-unit-candles');return{
   stock:Boolean(g),total:Number(g?.dataset.b46UnitTotal||0),start:Number(g?.dataset.b46UnitStart||0),count:Number(g?.dataset.b46UnitCount||0),
   candleCount:Number(c?.dataset.b46CandleCount||0),line:Boolean(q('.b46-perf-line')),area:Boolean(q('.b46-perf-area')),nav:Boolean(q('[data-b46-unit-nav]')),
   ranges:[...document.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim())
  }});
  assert(before.stock&&before.nav,'UNIT_STOCK_UI_MISSING');assert(before.total>before.count&&before.count>=20,'UNIT_VIEWPORT_NOT_WINDOWED');assert.equal(before.candleCount,before.count,'ONE_VISIBLE_RESULT_ONE_CANDLE_MISMATCH');assert(!before.line&&!before.area,'UNITS_MUST_NOT_RENDER_LINE_AREA');assert.deepEqual(before.ranges,['7D','30D','90D','ALL'],'RANGES_CHANGED');
  const box=await page.$eval('.b46-perf-unit-stock',e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width*.55,y:r.top+r.height*.5}});
  await page.mouse.move(box.x,box.y);await page.mouse.wheel({deltaY:-480});await delay(350);
  const zoomed=await page.$eval('.b46-perf-unit-stock',e=>({start:Number(e.dataset.b46UnitStart),count:Number(e.dataset.b46UnitCount),total:Number(e.dataset.b46UnitTotal)}));
  assert(zoomed.count<before.count,'WHEEL_ZOOM_DID_NOT_ZOOM_IN');
  const box2=await page.$eval('.b46-perf-unit-stock',e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width*.65,y:r.top+r.height*.45,w:r.width}});
  await page.mouse.move(box2.x,box2.y);await page.mouse.down();await page.mouse.move(box2.x-box2.w*.18,box2.y,{steps:5});await page.mouse.up();await delay(350);
  const panned=await page.$eval('.b46-perf-unit-stock',e=>({start:Number(e.dataset.b46UnitStart),count:Number(e.dataset.b46UnitCount)}));
  assert.notEqual(panned.start,zoomed.start,'DRAG_PAN_DID_NOT_MOVE_VIEWPORT');
  await page.click('[data-b46-mode="roi"]');await delay(250);
  const roi=await page.evaluate(()=>({stock:Boolean(document.querySelector('.b46-perf-unit-stock')),line:Boolean(document.querySelector('.b46-perf-line')),area:Boolean(document.querySelector('.b46-perf-area')),nav:Boolean(document.querySelector('[data-b46-unit-nav]'))}));
  assert(!roi.stock&&!roi.nav&&roi.line&&roi.area,'ROI_RENDERER_CHANGED');
  await page.click('[data-b46-mode="units"]');await delay(250);
  const restored=await page.evaluate(()=>Boolean(document.querySelector('.b46-perf-unit-stock')));assert(restored,'UNITS_STOCK_NOT_RESTORED');
  report.runtime={before,zoomed,panned,roi,restored};save();
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;const a=await readRetry('rollback-active',()=>activeVersion());if(a===current.restore.version)return;if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await readRetry('rollback-confirm',()=>activeVersion()),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
 current=await readRetry('inspect',()=>inspect());const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await readRetry('settings-before',()=>api('/scripts/'+script+'/settings')),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await readRetry('schedules-before',()=>schedules());
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes('B46_PERFORMANCE_MARKET_CHART_V3_20261012'),'CURRENT_RENDERER_BASE_CHANGED');assert(js0.includes(OLD_JSMARK),'CURRENT_UNIT_CANDLE_V2_MISSING');assert(!js0.includes(JSMARK),'JS_ALREADY_PATCHED');assert(!css0.includes(CSSMARK),'CSS_ALREADY_PATCHED');
 const j1=Buffer.from(patchJs(js0)),c1=Buffer.from(css0+'\n'+cssAdd+'\n'),i1=Buffer.from(patchIndex(idx0));
 writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',j1);writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
 const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));
 assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');assert.equal(staged.hashes[CSS],sha(cb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),j1);writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),b=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(JSMARK)&&!a.includes(OLD_JSMARK)&&b.includes(CSSMARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[JS,CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_UNIT_STOCK_CHART_V3_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,example:report.example,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
