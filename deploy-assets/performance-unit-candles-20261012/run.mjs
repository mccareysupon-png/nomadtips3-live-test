import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='singlepage-workspace-343.css';
const INDEX='index.html';
const JSMARK='/* B46_CUMULATIVE_UNIT_CANDLES_V1_20261012 */';
const CSSMARK='/* B46_CUMULATIVE_UNIT_CANDLES_STYLE_V1_20261012 */';
const CACHE='cumulative-unit-candles-v1-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={
  run:process.env.GITHUB_RUN_ID,
  scope:'Statistics Long-term Performance visualization only. One settled priced result = one Unit candle. Open=cumulative before; Close=cumulative after; body height=actual Unit P/L. No volume, no fake wick/high/low, no Engine/API/Data/Settlement changes.'
};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function exampleCheck(){
  const profits=[.17,-.80,1.80,2.80],expected=[[0,.17],[.17,-.63],[-.63,1.17],[1.17,3.97]];
  let net=0;
  const actual=profits.map(p=>{const open=net;net=Number((net+p).toFixed(10));return [Number(open.toFixed(2)),Number(net.toFixed(2))]});
  assert.deepEqual(actual,expected,'UNIT_EXAMPLE_MISMATCH');
  report.example={profits,actual,final:net};
}
exampleCheck();

function patchJs(src){
  assert(src.includes('function unitBarsSvg(points,geo)'), 'UNIT_BARS_FUNCTION_MISSING');
  const start=src.indexOf('function unitBarsSvg(points,geo)');
  const end=src.indexOf('function chartHtml(s)',start);
  assert(start>=0&&end>start,'UNIT_BARS_BOUNDARY_MISSING');
  const fn=`function unitBarsSvg(points,geo){/* B46_CUMULATIVE_UNIT_CANDLES_V1_20261012 */
 const W=geo.W,L=geo.L,R=geo.R,H=126,T=10,B=18,n=points.length;
 const candles=points.map((p,i)=>{const close=Number(p.value),profit=Number.isFinite(p.profit)?p.profit:0,open=close-profit;return{open,close,profit,i}});
 const vals=[];for(const c of candles){if(Number.isFinite(c.open))vals.push(c.open);if(Number.isFinite(c.close))vals.push(c.close)}vals.push(0);
 let min=Math.min(...vals),max=Math.max(...vals);if(!Number.isFinite(min)||!Number.isFinite(max)){min=-1;max=1}if(min===max){min-=1;max+=1}
 const rawSpan=max-min,pad=Math.max(.25,rawSpan*.06);min-=pad;max+=pad;const span=Math.max(.0001,max-min),ph=H-T-B;
 const y=v=>T+(max-v)/span*ph;
 const step=n>1?geo.pw/(n-1):geo.pw;
 const bw=Math.max(.18,Math.min(4,step*.72));
 let posD='',negD='',neutralD='',posCount=0,negCount=0,neutralCount=0;
 for(const c of candles){
   const x=L+(n===1?geo.pw/2:c.i/(n-1)*geo.pw),yo=y(c.open),yc=y(c.close);
   if(c.close>c.open){posD+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);posCount++}
   else if(c.close<c.open){negD+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);negCount++}
   else{const half=Math.max(.16,bw*.48);neutralD+='M'+(x-half).toFixed(3)+' '+yc.toFixed(3)+'H'+(x+half).toFixed(3);neutralCount++}
 }
 const zy=y(0),top=max,bottom=min;
 return '<div class="b46-perf-unit-panel cumulative-open-close" data-b46-pl-mode="cumulative-open-close" data-b46-signal-count="'+n+'" data-b46-pos-count="'+posCount+'" data-b46-neg-count="'+negCount+'" data-b46-neutral-count="'+neutralCount+'"><div class="b46-perf-unit-head"><span class="b46-perf-unit-label">UNIT CANDLES · SETTLED RESULT</span><span class="b46-perf-unit-note">OPEN = PRIOR NET · CLOSE = NEW NET · 1 RESULT = 1 CANDLE</span></div><svg class="b46-perf-unit-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="Cumulative Unit candles by settled result"><line class="b46-perf-unit-guide" x1="'+L+'" y1="'+T+'" x2="'+(W-R)+'" y2="'+T+'"></line><line class="b46-perf-unit-zero" x1="'+L+'" y1="'+zy+'" x2="'+(W-R)+'" y2="'+zy+'"></line><line class="b46-perf-unit-guide" x1="'+L+'" y1="'+(T+ph)+'" x2="'+(W-R)+'" y2="'+(T+ph)+'"></line><text class="b46-perf-unit-axis" x="'+(L-10)+'" y="'+(T+3)+'" text-anchor="end">'+(top>=0?'+':'')+top.toFixed(2)+'U</text><text class="b46-perf-unit-axis zero" x="'+(L-10)+'" y="'+(zy+3)+'" text-anchor="end">0U</text><text class="b46-perf-unit-axis" x="'+(L-10)+'" y="'+(T+ph+3)+'" text-anchor="end">'+(bottom>=0?'+':'')+bottom.toFixed(2)+'U</text><path class="b46-perf-unit-candles b46-perf-unit-candles-pos" d="'+posD+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candles b46-perf-unit-candles-neg" d="'+negD+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candles b46-perf-unit-candles-neutral" d="'+neutralD+'" style="stroke-width:'+Math.max(.55,bw).toFixed(3)+'px"></path></svg></div>'
}
`;
  const out=src.slice(0,start)+fn+src.slice(end);
  const block=out.slice(start,start+fn.length+40);
  assert(!/VOLUME/i.test(block),'VOLUME_TEXT_FORBIDDEN');
  assert(!/\b(high|low|wick)\b/i.test(block),'FAKE_OHLC_WICK_FORBIDDEN');
  return out;
}

const cssAdd=`
/* B46_CUMULATIVE_UNIT_CANDLES_STYLE_V1_20261012 */
body[data-workspace-view="statistics"] .b46-perf-line{
  stroke-width:.85!important;stroke-linecap:butt!important;stroke-linejoin:round!important;
  vector-effect:non-scaling-stroke!important;filter:none!important;shape-rendering:geometricPrecision!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-panel{position:relative;margin-top:8px;padding-top:24px;border-top:1px solid transparent!important}
body[data-workspace-view="statistics"] .b46-perf-unit-head{position:absolute;inset:2px 0 auto 0;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}
body[data-workspace-view="statistics"] .b46-perf-unit-label,
body[data-workspace-view="statistics"] .b46-perf-unit-note,
body[data-workspace-view="statistics"] .b46-perf-unit-axis{font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important}
body[data-workspace-view="statistics"] .b46-perf-unit-label{font-size:9px!important;font-weight:900!important;letter-spacing:.08em!important}
body[data-workspace-view="statistics"] .b46-perf-unit-note{font-size:8px!important;font-weight:700!important;letter-spacing:.025em!important}
body[data-workspace-view="statistics"] .b46-perf-unit-svg{display:block;width:100%!important;height:126px!important;overflow:visible!important;shape-rendering:auto!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candles{fill:none!important;stroke-linecap:butt!important;stroke-linejoin:miter!important;vector-effect:non-scaling-stroke!important;opacity:.94!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candles-pos{stroke:#27c77a!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candles-neg{stroke:#e55364!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candles-neutral{stroke:#8a9baa!important}
body[data-workspace-view="statistics"] .b46-perf-unit-zero{stroke-width:1!important;stroke-dasharray:3 3!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-unit-guide{stroke-width:.55!important;stroke-dasharray:2 5!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-unit-axis{font-size:8px!important;font-weight:750!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-zero{stroke:rgba(212,224,234,.44)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-guide{stroke:rgba(142,164,184,.12)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-axis{fill:#8097aa!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-label{color:#dce7ef!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-note{color:#7f95a7!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-zero{stroke:rgba(38,56,72,.42)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-guide{stroke:rgba(44,67,87,.10)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-axis{fill:#607486!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-label{color:#203648!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-note{color:#607486!important}
`;

function patchIndex(src){
 let out=src;
 out=out.replace(/longterm-performance-343\.js\?v=[^"'<>\s]+/g,'longterm-performance-343.js?v='+CACHE);
 out=out.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v='+CACHE);
 assert(out.includes('longterm-performance-343.js?v='+CACHE),'LONGTERM_CACHE_BUST_MISSING');
 return out;
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1100});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&unitCandleVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const r=await page.evaluate(()=>{const q=s=>document.querySelector(s),cs=e=>e?getComputedStyle(e):null;const p=q('.b46-perf-unit-panel'),pos=q('.b46-perf-unit-candles-pos'),neg=q('.b46-perf-unit-candles-neg'),neu=q('.b46-perf-unit-candles-neutral'),line=q('.b46-perf-line');return{
    mode:p?.dataset.b46PlMode,count:Number(p?.dataset.b46SignalCount||0),pos:Number(p?.dataset.b46PosCount||0),neg:Number(p?.dataset.b46NegCount||0),neutral:Number(p?.dataset.b46NeutralCount||0),
    posD:(pos?.getAttribute('d')||'').length,negD:(neg?.getAttribute('d')||'').length,neutralD:(neu?.getAttribute('d')||'').length,
    label:q('.b46-perf-unit-label')?.textContent||'',note:q('.b46-perf-unit-note')?.textContent||'',lineWidth:cs(line)?.strokeWidth,
    ranges:[...document.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim()),tableSpacing:cs(q('.sp-results .sp-table'))?.borderSpacing
  }});
  report.runtime=r;save();
  assert(r.count>100,'SETTLED_CANDLE_COUNT_TOO_SMALL');
  assert.equal(r.mode,'cumulative-open-close','CANDLE_MODE_WRONG');
  assert.equal(r.count,r.pos+r.neg+r.neutral,'ONE_RESULT_ONE_CANDLE_COUNT_MISMATCH');
  assert(r.pos>0&&r.neg>0,'MISSING_GREEN_OR_RED_CANDLES');
  assert(r.posD>100&&r.negD>100,'CANDLE_PATHS_TOO_SMALL');
  assert(!/VOLUME/i.test(r.label+' '+r.note),'VOLUME_VISIBLE');
  assert(/OPEN = PRIOR NET/i.test(r.note)&&/CLOSE = NEW NET/i.test(r.note),'OPEN_CLOSE_NOTE_MISSING');
  assert.deepEqual(r.ranges,['7D','30D','90D','ALL'],'RANGE_CONTROLS_CHANGED');
  assert(parseFloat(r.lineWidth)<=1,'CUMULATIVE_LINE_CHANGED');
  assert.equal(r.tableSpacing,'2px','UNRELATED_TABLE_LAYOUT_CHANGED');
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX);
 const js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes('B46_SIGNAL_PL_BARS_V4_20261012'),'EXPECTED_CURRENT_CHART_V4_BASE_MISSING');
 assert(!js0.includes(JSMARK),'JS_ALREADY_PATCHED');assert(!css0.includes(CSSMARK),'CSS_ALREADY_PATCHED');
 const js1=patchJs(js0),css1=css0+'\n'+cssAdd+'\n',idx1=patchIndex(idx0);
 const j1=Buffer.from(js1),c1=Buffer.from(css1),i1=Buffer.from(idx1);
 writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',j1);writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');assert.equal(staged.hashes[CSS],sha(cb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),j1);writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),b=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(JSMARK)&&b.includes(CSSMARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[JS,CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_CUMULATIVE_UNIT_CANDLES_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,example:report.example,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
