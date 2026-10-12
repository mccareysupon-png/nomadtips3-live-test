import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='singlepage-workspace-343.css';
const INDEX='index.html';
const JSMARK='/* B46_SIGNAL_PL_BARS_V4_20261012 */';
const CSSMARK='/* B46_MARKET_CHART_V4_20261012 */';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Long-term performance presentation only: thin semantic line, stock-style crosshair/value badges, adaptive per-signal P/L unit pane. No statistics formula/API/settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function patchJs(src){
  assert(src.includes('function unitBarsSvg(points,geo)'), 'UNIT_BARS_FUNCTION_MISSING');
  const start=src.indexOf('function unitBarsSvg(points,geo)');
  const end=src.indexOf('function chartHtml(s)',start);
  assert(start>=0&&end>start,'UNIT_BARS_BOUNDARY_MISSING');
  const fn=`function unitBarsSvg(points,geo){/* B46_SIGNAL_PL_BARS_V4_20261012 */
 const W=geo.W,L=geo.L,R=geo.R,H=104,C=52,A=38,n=points.length;
 const profits=points.map(p=>Number.isFinite(p.profit)?p.profit:0);
 const maxAbs=Math.max(1,...profits.map(Math.abs));
 const maxSlots=360,compressed=n>maxSlots,slots=compressed?maxSlots:n;
 const pos=[],neg=[];
 const bar=(x,v,w,cls)=>{const y=C-(v/maxAbs)*A,h=Math.max(1,Math.abs(C-y)),top=v>=0?C-h:C;return '<rect class="'+cls+'" x="'+(x-w/2).toFixed(2)+'" y="'+top.toFixed(2)+'" width="'+w.toFixed(2)+'" height="'+h.toFixed(2)+'" rx="'+Math.min(.8,w/2).toFixed(2)+'"></rect>'};
 if(compressed){
   for(let s=0;s<slots;s++){
     const a=Math.floor(s*n/slots),b=Math.max(a+1,Math.floor((s+1)*n/slots));
     let pv=0,nv=0;
     for(let i=a;i<b;i++){const v=profits[i];if(v>pv)pv=v;if(v<nv)nv=v}
     const x=L+(slots===1?geo.pw/2:s/(slots-1)*geo.pw),w=Math.max(1.15,Math.min(2.2,geo.pw/slots*.72));
     if(pv>0)pos.push(bar(x,pv,w,'b46-perf-unit-bar b46-perf-unit-pos'));
     if(nv<0)neg.push(bar(x,nv,w,'b46-perf-unit-bar b46-perf-unit-neg'));
   }
 }else{
   const step=n>1?geo.pw/(n-1):geo.pw,w=Math.max(1.2,Math.min(5,step*.58));
   for(let i=0;i<n;i++){const v=profits[i];if(!v)continue;const x=L+(n===1?geo.pw/2:i/(n-1)*geo.pw);(v>0?pos:neg).push(bar(x,v,w,v>0?'b46-perf-unit-bar b46-perf-unit-pos':'b46-perf-unit-bar b46-perf-unit-neg'))}
 }
 const note=compressed?'OVERVIEW · UNIT HEIGHT, NOT VOLUME':'EACH BAR = 1 SETTLED SIGNAL';
 return '<div class="b46-perf-unit-panel '+(compressed?'compressed':'individual')+'" data-b46-pl-mode="'+(compressed?'compressed':'individual')+'"><div class="b46-perf-unit-head"><span class="b46-perf-unit-label">SIGNAL P/L · UNIT</span><span class="b46-perf-unit-note">'+note+'</span></div><svg class="b46-perf-unit-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-label="Per-signal unit profit and loss, not volume"><line class="b46-perf-unit-guide" x1="'+L+'" y1="'+(C-A)+'" x2="'+(W-R)+'" y2="'+(C-A)+'"></line><line class="b46-perf-unit-zero" x1="'+L+'" y1="'+C+'" x2="'+(W-R)+'" y2="'+C+'"></line><line class="b46-perf-unit-guide" x1="'+L+'" y1="'+(C+A)+'" x2="'+(W-R)+'" y2="'+(C+A)+'"></line><text class="b46-perf-unit-axis" x="'+(L-10)+'" y="'+(C-A+3)+'" text-anchor="end">+'+maxAbs.toFixed(2)+'U</text><text class="b46-perf-unit-axis zero" x="'+(L-10)+'" y="'+(C+3)+'" text-anchor="end">0U</text><text class="b46-perf-unit-axis" x="'+(L-10)+'" y="'+(C+A+3)+'" text-anchor="end">-'+maxAbs.toFixed(2)+'U</text>'+pos.join('')+neg.join('')+'<line data-b46-unit-hover-line class="b46-perf-unit-hover-line" x1="0" y1="10" x2="0" y2="'+(H-10)+'" hidden></line></svg></div>'
}
`;
  return src.slice(0,start)+fn+src.slice(end);
}

const cssAdd=`
/* B46_MARKET_CHART_V4_20261012 */
body[data-workspace-view="statistics"] .b46-perf-svg{overflow:visible;shape-rendering:geometricPrecision}
body[data-workspace-view="statistics"] .b46-perf-line{
  fill:none!important;
  stroke:url(#b46PerfLineGradient)!important;
  stroke-width:1!important;
  stroke-linecap:butt!important;
  stroke-linejoin:round!important;
  vector-effect:non-scaling-stroke!important;
  filter:none!important;
}
body[data-workspace-view="statistics"] .b46-perf-area{fill:url(#b46PerfAreaGradient)!important;stroke:none!important}
body[data-workspace-view="statistics"] .b46-perf-line-pos{stop-color:#36d38a!important}
body[data-workspace-view="statistics"] .b46-perf-line-neg{stop-color:#ec5d6f!important}
body[data-workspace-view="statistics"] .b46-perf-area-pos{stop-color:#36d38a!important;stop-opacity:.09!important}
body[data-workspace-view="statistics"] .b46-perf-area-neg{stop-color:#ec5d6f!important;stop-opacity:.07!important}
body[data-workspace-view="statistics"] .b46-perf-grid,
body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke-width:.7!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-zero-line{stroke-width:1!important;stroke-dasharray:3 4!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-hover-line,
body[data-workspace-view="statistics"] .b46-perf-unit-hover-line{
  stroke-width:.85!important;
  stroke-dasharray:5 5!important;
  vector-effect:non-scaling-stroke!important;
  pointer-events:none!important;
}
body[data-workspace-view="statistics"] .b46-perf-hover-dot{stroke-width:1.2!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-axis-text,
body[data-workspace-view="statistics"] .b46-perf-axis-title,
body[data-workspace-view="statistics"] .b46-perf-unit-axis,
body[data-workspace-view="statistics"] .b46-perf-unit-label,
body[data-workspace-view="statistics"] .b46-perf-unit-note,
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge,
body[data-workspace-view="statistics"] .b46-perf-tip{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
body[data-workspace-view="statistics"] .b46-perf-axis-text{font-size:10px!important;font-weight:650!important}
body[data-workspace-view="statistics"] .b46-perf-axis-title{font-size:9px!important;font-weight:800!important;letter-spacing:.04em!important}
body[data-workspace-view="statistics"] .b46-perf-unit-panel{position:relative;margin-top:7px;padding-top:22px;border-top:1px solid transparent}
body[data-workspace-view="statistics"] .b46-perf-unit-head{position:absolute;inset:2px 0 auto 0;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}
body[data-workspace-view="statistics"] .b46-perf-unit-label{font-size:9px!important;font-weight:850!important;letter-spacing:.075em!important}
body[data-workspace-view="statistics"] .b46-perf-unit-note{font-size:8px!important;font-weight:700!important;letter-spacing:.035em!important}
body[data-workspace-view="statistics"] .b46-perf-unit-svg{display:block;width:100%;height:104px;overflow:visible;shape-rendering:crispEdges}
body[data-workspace-view="statistics"] .b46-perf-unit-bar{vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-unit-pos{fill:#36d38a!important;stroke:none!important}
body[data-workspace-view="statistics"] .b46-perf-unit-neg{fill:#ec5d6f!important;stroke:none!important}
body[data-workspace-view="statistics"] .b46-perf-unit-zero{stroke-width:1!important;stroke-dasharray:3 3!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-unit-guide{stroke-width:.55!important;stroke-dasharray:2 5!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-unit-axis{font-size:8px!important;font-weight:700!important}
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge{font-size:9px!important;font-weight:850!important;letter-spacing:.02em!important}
body[data-workspace-view="statistics"] .b46-perf-tip{font-size:10px!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-grid,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke:rgba(142,164,184,.13)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-zero-line,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-zero{stroke:rgba(212,224,234,.44)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-guide{stroke:rgba(142,164,184,.12)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-hover-line,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-hover-line{stroke:rgba(210,224,236,.62)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#9fb3c4!important;color:#9fb3c4!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#c6d4df!important;color:#c6d4df!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-axis{fill:#8097aa!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-label{color:#dce7ef!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-unit-note{color:#7890a3!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-grid,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke:rgba(44,67,87,.12)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-zero-line,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-zero{stroke:rgba(38,56,72,.42)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-guide{stroke:rgba(44,67,87,.10)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-hover-line,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-hover-line{stroke:rgba(41,62,80,.55)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#526779!important;color:#526779!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#293d4f!important;color:#293d4f!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-axis{fill:#607486!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-label{color:#22384a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-note{color:#607486!important}
`;

function patchIndex(src){
  let out=src;
  out=out.replace(/longterm-performance-343\.js\?v=[^"'<>\s]+/g,'longterm-performance-343.js?v=market-chart-v4-20261012');
  out=out.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v=market-chart-v4-20261012');
  assert(out.includes('longterm-performance-343.js?v=market-chart-v4-20261012'),'LONGTERM_CACHE_BUST_MISSING');
  return out;
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1100});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&marketChartV4='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(4500);
  const before=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],cs=e=>e?getComputedStyle(e):null;
   const line=q('.b46-perf-line'),panel=q('.b46-perf-unit-panel'),svg=q('.b46-perf-svg'),h=q('.b46-perf-hover-hline'),v=q('[data-b46-hover-line]');
   return {lineWidth:cs(line)?.strokeWidth,lineStroke:cs(line)?.stroke,plMode:panel?.dataset.b46PlMode,pos:qa('.b46-perf-unit-pos').length,neg:qa('.b46-perf-unit-neg').length,zeroDash:cs(q('.b46-perf-unit-zero'))?.strokeDasharray,hDash:cs(h)?.strokeDasharray,vDash:cs(v)?.strokeDasharray,svgBox:svg?.getBoundingClientRect().toJSON?.()||null};
  });
  const box=await page.$eval('.b46-perf-svg',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
  await page.mouse.move(box.x+box.w*.55,box.y+box.h*.45);
  await delay(300);
  const hover=await page.evaluate(()=>{const cs=e=>e?getComputedStyle(e):null,q=s=>document.querySelector(s);return{tipHidden:q('[data-b46-perf-tip]')?.hidden,yHidden:q('[data-b46-perf-ybadge]')?.hidden,xHidden:q('[data-b46-perf-xbadge]')?.hidden,yText:q('[data-b46-perf-ybadge]')?.textContent,xText:q('[data-b46-perf-xbadge]')?.textContent,hHidden:q('[data-b46-hover-hline]')?.hidden,vHidden:q('[data-b46-hover-line]')?.hidden,hDash:cs(q('[data-b46-hover-hline]'))?.strokeDasharray}}); 
  report.runtime={before,hover};save();
  assert.equal(before.lineWidth,'1px','LINE_NOT_THIN');
  assert(before.pos>0,'NO_POSITIVE_PL_BARS');
  assert(before.neg>0,'NO_NEGATIVE_PL_BARS');
  assert(before.zeroDash&&before.zeroDash!=='none','PL_ZERO_NOT_DISTINCT');
  assert(before.hDash&&before.hDash!=='none'&&before.vDash&&before.vDash!=='none','CROSSHAIR_NOT_DASHED');
  assert.equal(hover.tipHidden,false,'TOOLTIP_NOT_VISIBLE');
  assert.equal(hover.yHidden,false,'Y_BADGE_NOT_VISIBLE');
  assert.equal(hover.xHidden,false,'X_BADGE_NOT_VISIBLE');
  assert(/^≈ /.test(hover.yText||''),'Y_BADGE_NOT_APPROX_VALUE');
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
   wrangler(staged);for(let x=0;x<30;x++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
   let live=false;for(let x=0;x<40;x++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),b=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(JSMARK)&&b.includes(CSSMARK)&&d.includes('market-chart-v4-20261012')){live=true;break}}catch{}await delay(1000)}assert(live,'PATCH_NOT_LIVE');
   for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
   await runtimeCheck();
   const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
   assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
   assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
   assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
   report.finalVersion=candidate;report.result='SUCCESS';save();
   console.log('BALL46_MARKET_CHART_V4_SUCCESS '+JSON.stringify({base,candidate,changed:[JS,CSS,INDEX],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
