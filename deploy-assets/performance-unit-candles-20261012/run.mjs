import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='singlepage-workspace-343.css';
const INDEX='index.html';
const JSMARK='/* B46_UNIT_CANDLES_V1_20261012 */';
const CSSMARK='/* B46_UNIT_CANDLES_STYLE_V1_20261012 */';
const CACHE='unit-candles-v1-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Long-term Performance chart presentation only: per-signal Unit Candles (not volume), crisp semantic cumulative line, stock-style crosshair and clean chart typography. No API, data formula, engine or settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function patchJs(src){
  assert(src.includes('function unitBarsSvg(points,geo)'), 'UNIT_BARS_FUNCTION_MISSING');
  const start=src.indexOf('function unitBarsSvg(points,geo)');
  const end=src.indexOf('function chartHtml(s)',start);
  assert(start>=0&&end>start,'UNIT_BARS_BOUNDARY_MISSING');
  const fn=`function unitBarsSvg(points,geo){/* B46_UNIT_CANDLES_V1_20261012 */
 const W=geo.W,L=geo.L,R=geo.R,H=108,C=54,A=40,n=points.length;
 const profits=points.map(p=>Number.isFinite(p.profit)?p.profit:0);
 const maxAbs=Math.max(1,...profits.map(v=>Math.abs(v)));
 const step=n>1?geo.pw/(n-1):geo.pw;
 const sw=Math.max(.22,Math.min(3.8,step*.70));
 let posD='',negD='',posCount=0,negCount=0,nonZero=0;
 for(let i=0;i<n;i++){
   const v=profits[i]; if(!v)continue; nonZero++;
   const x=L+(n===1?geo.pw/2:i/(n-1)*geo.pw);
   const y=C-(v/maxAbs)*A;
   const seg='M'+x.toFixed(3)+' '+C.toFixed(3)+'V'+y.toFixed(3);
   if(v>0){posD+=seg;posCount++}else{negD+=seg;negCount++}
 }
 return '<div class="b46-perf-unit-panel individual-all" data-b46-pl-mode="individual-all" data-b46-signal-count="'+n+'" data-b46-nonzero-count="'+nonZero+'" data-b46-pos-count="'+posCount+'" data-b46-neg-count="'+negCount+'"><div class="b46-perf-unit-head"><span class="b46-perf-unit-label">UNIT CANDLES · SIGNAL RESULT</span><span class="b46-perf-unit-note">1 SIGNAL = 1 BAR · HEIGHT = P/L UNIT</span></div><svg class="b46-perf-unit-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="Per-signal profit and loss unit candles"><line class="b46-perf-unit-guide" x1="'+L+'" y1="'+(C-A)+'" x2="'+(W-R)+'" y2="'+(C-A)+'"></line><line class="b46-perf-unit-zero" x1="'+L+'" y1="'+C+'" x2="'+(W-R)+'" y2="'+C+'"></line><line class="b46-perf-unit-guide" x1="'+L+'" y1="'+(C+A)+'" x2="'+(W-R)+'" y2="'+(C+A)+'"></line><text class="b46-perf-unit-axis positive" x="'+(L-10)+'" y="'+(C-A+3)+'" text-anchor="end">+'+maxAbs.toFixed(2)+'U</text><text class="b46-perf-unit-axis zero" x="'+(L-10)+'" y="'+(C+3)+'" text-anchor="end">0U</text><text class="b46-perf-unit-axis negative" x="'+(L-10)+'" y="'+(C+A+3)+'" text-anchor="end">-'+maxAbs.toFixed(2)+'U</text><path class="b46-perf-unit-candles b46-perf-unit-candles-pos" d="'+posD+'" style="stroke-width:'+sw.toFixed(3)+'px"></path><path class="b46-perf-unit-candles b46-perf-unit-candles-neg" d="'+negD+'" style="stroke-width:'+sw.toFixed(3)+'px"></path><line data-b46-unit-hover-line class="b46-perf-unit-hover-line" x1="0" y1="8" x2="0" y2="'+(H-8)+'" hidden></line></svg></div>'
}
`;
  return src.slice(0,start)+fn+src.slice(end);
}

const cssAdd=`
/* B46_UNIT_CANDLES_STYLE_V1_20261012 */
body[data-workspace-view="statistics"] .b46-perf-line{
  stroke-width:.85!important;
  stroke-linecap:butt!important;
  stroke-linejoin:round!important;
  vector-effect:non-scaling-stroke!important;
  filter:none!important;
  shape-rendering:geometricPrecision!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-panel{
  margin-top:8px!important;
  padding-top:23px!important;
  border-top:1px solid transparent!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-head{
  inset:2px 0 auto 0!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-label{
  font-size:9px!important;
  font-weight:900!important;
  letter-spacing:.08em!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-note{
  font-size:8px!important;
  font-weight:700!important;
  letter-spacing:.035em!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-svg{
  display:block!important;
  width:100%!important;
  height:108px!important;
  overflow:visible!important;
  shape-rendering:auto!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-candles{
  fill:none!important;
  stroke-linecap:butt!important;
  stroke-linejoin:miter!important;
  vector-effect:non-scaling-stroke!important;
  opacity:.92!important;
}
body[data-workspace-view="statistics"] .b46-perf-unit-candles-pos{stroke:#27c77a!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candles-neg{stroke:#e55364!important}
body[data-workspace-view="statistics"] .b46-perf-unit-axis.positive{fill:#27a969!important}
body[data-workspace-view="statistics"] .b46-perf-unit-axis.negative{fill:#c94455!important}
body[data-workspace-view="statistics"] .b46-perf-unit-axis.zero{font-weight:850!important}
body[data-workspace-view="statistics"] .b46-perf-hover-line,
body[data-workspace-view="statistics"] .b46-perf-unit-hover-line{
  stroke-dasharray:4 4!important;
  stroke-width:.8!important;
  vector-effect:non-scaling-stroke!important;
}
body[data-workspace-view="statistics"] .b46-perf-hover-hline{
  stroke-dasharray:4 4!important;
  stroke-width:.8!important;
  vector-effect:non-scaling-stroke!important;
}
body[data-workspace-view="statistics"] .b46-perf-axis-text{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-size:9px!important;
  font-weight:700!important;
  letter-spacing:.005em!important;
}
body[data-workspace-view="statistics"] .b46-perf-axis-title{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-size:9px!important;
  font-weight:850!important;
  letter-spacing:.035em!important;
}
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-size:9px!important;
  font-weight:900!important;
}
body[data-workspace-view="statistics"] .b46-perf-tip{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-size:10px!important;
  font-weight:700!important;
}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#9aafbf!important;color:#9aafbf!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#d4dfe7!important;color:#d4dfe7!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-label{color:#dce7ef!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-note{color:#7f95a7!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#4f6475!important;color:#4f6475!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#24394a!important;color:#24394a!important}
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
  await page.goto('https://ball46.com/?view=statistics&unitCandlesVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(4500);
  const before=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),cs=e=>e?getComputedStyle(e):null;
   const panel=q('.b46-perf-unit-panel'),pos=q('.b46-perf-unit-candles-pos'),neg=q('.b46-perf-unit-candles-neg'),line=q('.b46-perf-line');
   return {
    lineWidth:cs(line)?.strokeWidth,
    lineStroke:cs(line)?.stroke,
    mode:panel?.dataset.b46PlMode,
    signalCount:Number(panel?.dataset.b46SignalCount||0),
    nonZero:Number(panel?.dataset.b46NonzeroCount||0),
    posCount:Number(panel?.dataset.b46PosCount||0),
    negCount:Number(panel?.dataset.b46NegCount||0),
    posD:(pos?.getAttribute('d')||'').length,
    negD:(neg?.getAttribute('d')||'').length,
    label:q('.b46-perf-unit-label')?.textContent,
    note:q('.b46-perf-unit-note')?.textContent,
    hDash:cs(q('[data-b46-hover-hline]'))?.strokeDasharray,
    vDash:cs(q('[data-b46-hover-line]'))?.strokeDasharray,
    unitDash:cs(q('[data-b46-unit-hover-line]'))?.strokeDasharray,
    tableSpacing:cs(q('.sp-results .sp-table'))?.borderSpacing
   };
  });
  const box=await page.$eval('.b46-perf-svg',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
  await page.mouse.move(box.x+box.w*.63,box.y+box.h*.42);await delay(300);
  const hover=await page.evaluate(()=>{const q=s=>document.querySelector(s);return{
    tipHidden:q('[data-b46-perf-tip]')?.hidden,
    yHidden:q('[data-b46-perf-ybadge]')?.hidden,
    xHidden:q('[data-b46-perf-xbadge]')?.hidden,
    hHidden:q('[data-b46-hover-hline]')?.hidden,
    vHidden:q('[data-b46-hover-line]')?.hidden,
    yText:q('[data-b46-perf-ybadge]')?.textContent,
    xText:q('[data-b46-perf-xbadge]')?.textContent
  }});
  report.runtime={before,hover};save();
  assert(before.signalCount>100,'SIGNAL_COUNT_TOO_SMALL');
  assert.equal(before.mode,'individual-all','UNIT_CANDLES_NOT_INDIVIDUAL');
  assert(before.nonZero===before.posCount+before.negCount,'UNIT_COUNTS_INCONSISTENT');
  assert(before.posCount>0,'NO_POSITIVE_UNIT_CANDLES');
  assert(before.negCount>0,'NO_NEGATIVE_UNIT_CANDLES');
  assert(before.posD>1000&&before.negD>1000,'CANDLE_PATHS_TOO_SMALL');
  assert(!/VOLUME/i.test((before.label||'')+' '+(before.note||'')),'VOLUME_LABEL_STILL_PRESENT');
  assert(/1 SIGNAL = 1 BAR/i.test(before.note||''),'ONE_SIGNAL_ONE_BAR_NOTE_MISSING');
  assert(parseFloat(before.lineWidth)<=1,'LINE_NOT_CRISP_THIN');
  assert(before.hDash&&before.hDash!=='none'&&before.vDash&&before.vDash!=='none'&&before.unitDash&&before.unitDash!=='none','DASHED_CROSSHAIR_MISSING');
  assert.equal(hover.tipHidden,false,'TOOLTIP_NOT_VISIBLE');
  assert.equal(hover.yHidden,false,'Y_BADGE_NOT_VISIBLE');
  assert.equal(hover.xHidden,false,'X_BADGE_NOT_VISIBLE');
  assert.equal(hover.hHidden,false,'HORIZONTAL_CROSSHAIR_NOT_VISIBLE');
  assert.equal(hover.vHidden,false,'VERTICAL_CROSSHAIR_NOT_VISIBLE');
  assert.equal(before.tableSpacing,'2px','UNRELATED_TABLE_LAYOUT_CHANGED');
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;
 const a=await activeVersion();if(a===current.restore.version)return;if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
 current=await inspect();const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX);
 const js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes('B46_SIGNAL_PL_BARS_V4_20261012'),'EXPECTED_MARKET_CHART_V4_BASE_MISSING');
 assert(!js0.includes(JSMARK),'JS_ALREADY_PATCHED');
 assert(!css0.includes(CSSMARK),'CSS_ALREADY_PATCHED');
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
  report.finalVersion=candidate;report.result='SUCCESS';save();
  console.log('BALL46_UNIT_CANDLES_V1_SUCCESS '+JSON.stringify({base,candidate,changed:[JS,CSS,INDEX],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
