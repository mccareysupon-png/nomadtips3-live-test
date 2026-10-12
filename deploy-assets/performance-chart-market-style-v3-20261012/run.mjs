import assert from 'node:assert/strict';
import * as acorn from 'acorn';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='longterm-performance-343.css';
const JMARK='B46_PERFORMANCE_MARKET_CHART_V3_20261012';
const CMARK='/* B46_PERFORMANCE_MARKET_CHART_V3_STYLE_20261012 */';

const CSS_PATCH=`
/* B46_PERFORMANCE_MARKET_CHART_V3_STYLE_20261012 */
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line{
  stroke-width:1px!important;vector-effect:non-scaling-stroke!important;
  stroke-linejoin:round!important;stroke-linecap:round!important;shape-rendering:geometricPrecision!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-area{opacity:.10!important}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-hover-line,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-hover-line{
  stroke-dasharray:4 4!important;stroke-width:.8px!important;vector-effect:non-scaling-stroke!important;pointer-events:none!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-panel{position:relative;margin-top:2px;padding-top:2px}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-label{
  position:absolute;left:72px;top:2px;z-index:2;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif;
  font-size:9px;font-weight:850;letter-spacing:.07em;line-height:1;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-svg{
  display:block;width:100%;height:72px;overflow:visible;shape-rendering:geometricPrecision;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-pos,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-neg{
  fill:none!important;stroke-width:.65px!important;vector-effect:non-scaling-stroke!important;opacity:.84!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-zero{
  stroke-width:.7px!important;vector-effect:non-scaling-stroke!important;
}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-pos{stop-color:#42dc93!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-neg{stop-color:#f06473!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-pos{stroke:#42dc93!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-neg{stroke:#f06473!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-zero{stroke:rgba(174,193,209,.34)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-label{color:#c8d5e0!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-pos{stop-color:#16875a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-neg{stop-color:#c23a4a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-pos{stroke:#16875a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-neg{stroke:#c23a4a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-zero{stroke:rgba(58,78,96,.30)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-unit-label{color:#263746!important}
`;

function patchJs(before){
  assert(before.includes('B46_MARKET_CHART_INTERACTION_20261012_MARKET_V2'),'V2_MARKER_MISSING');
  assert(!before.includes(JMARK),'V3_ALREADY_PRESENT');
  const apiBefore=[...before.matchAll(/\/api\/[A-Za-z0-9_?=&./-]+/g)].map(m=>m[0]).sort();
  let out=before;

  const axisRe=/function axisSvg\(points,min,max,geo\)\{[\s\S]*?\}\nfunction chartHtml/;
  assert(axisRe.test(out),'AXIS_FUNCTION_MISSING');
  const axisNew=`function axisSvg(points,min,max,geo){/* B46_MULTI_YEAR_AXIS_20261012 */const yTicks=[];for(let i=0;i<5;i++){const value=max-(max-min)*i/4,y=geo.T+geo.ph*i/4;yTicks.push(\`<line x1="\${geo.L}" y1="\${y}" x2="\${geo.W-geo.R}" y2="\${y}" class="b46-perf-grid \${Math.abs(value)<1e-9?'zero':''}"></line><text x="\${geo.L-10}" y="\${y+4}" text-anchor="end" class="b46-perf-axis-text">\${esc(valueText(value))}</text>\`)}const xIdx=[],n=points.length,spanMs=Math.max(0,(points[n-1]?.date||0)-(points[0]?.date||0)),slots=Math.min(5,n);for(let i=0;i<slots;i++){const idx=slots===1?0:Math.round(i*(n-1)/(slots-1));if(xIdx.includes(idx))continue;xIdx.push(idx)}const axisDate=ms=>{if(!ms)return'—';try{return new Intl.DateTimeFormat(navigator.language||'en-GB',spanMs>330*86400000?{month:'short',year:'2-digit'}:{day:'2-digit',month:'short'}).format(new Date(ms))}catch{return fmtShort(ms)}};const xTicks=xIdx.map(idx=>{const p=geo.xy[idx],label=axisDate(points[idx]?.date);return\`<line x1="\${p.x}" y1="\${geo.T}" x2="\${p.x}" y2="\${geo.T+geo.ph}" class="b46-perf-vgrid"></line><text x="\${p.x}" y="\${geo.H-17}" text-anchor="middle" class="b46-perf-axis-text">\${esc(label)}</text>\`}).join('');return\`\${yTicks.join('')}\${xTicks}<text x="\${geo.L}" y="11" class="b46-perf-axis-title">\${esc(modeLabel())}</text><text x="\${geo.W-geo.R}" y="\${geo.H-3}" text-anchor="end" class="b46-perf-axis-title">Settled signal timeline</text>\`}
function unitBarsSvg(points,geo){/* B46_SIGNAL_UNIT_BARS_20261012 */const W=geo.W,L=geo.L,R=geo.R,H=72,C=39,A=24,n=points.length,maxAbs=Math.max(1,...points.map(p=>Math.abs(Number.isFinite(p.profit)?p.profit:0))),pos=[],neg=[];for(let i=0;i<n;i++){const p=points[i],profit=Number.isFinite(p.profit)?p.profit:0,x=L+(n===1?geo.pw/2:i/(n-1)*geo.pw),y=C-(profit/maxAbs)*A,seg=\`M\${x.toFixed(2)} \${C} V\${y.toFixed(2)}\`;if(profit>0)pos.push(seg);else if(profit<0)neg.push(seg)}return\`<div class="b46-perf-unit-panel"><span class="b46-perf-unit-label">SIGNAL P/L · UNIT</span><svg class="b46-perf-unit-svg" viewBox="0 0 \${W} \${H}" preserveAspectRatio="none" aria-label="Per-signal unit profit and loss"><line class="b46-perf-unit-zero" x1="\${L}" y1="\${C}" x2="\${W-R}" y2="\${C}"></line><path class="b46-perf-unit-pos" d="\${pos.join(' ')}"></path><path class="b46-perf-unit-neg" d="\${neg.join(' ')}"></path><line data-b46-unit-hover-line class="b46-perf-unit-hover-line" x1="0" y1="8" x2="0" y2="64" hidden></line></svg></div>\`}
function chartHtml`;
  out=out.replace(axisRe,axisNew);

  const chartRe=/function chartHtml\(s\)\{[\s\S]*?\}\nfunction ensureCard/;
  assert(chartRe.test(out),'CHART_FUNCTION_MISSING');
  const chartNew=`function chartHtml(s){/* ${JMARK} */const points=getPoints(s);currentPoints=points;if(!points.length)return'<div class="b46-perf-empty">No priced settled signals in this range.</div>';const scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo),zeroPct=Math.max(0,Math.min(100,(geo.baseY-geo.T)/geo.ph*100)),bars=unitBarsSvg(points,geo);return\`<svg class="b46-perf-svg" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="\${esc(modeLabel())} chart"><defs><linearGradient id="b46PerfLineGradient" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-line-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-line-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-line-neg"></stop><stop offset="100%" class="b46-perf-line-neg"></stop></linearGradient><linearGradient id="b46PerfAreaGradient" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-area-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-area-pos"></stop><stop offset="\${zeroPct}%" class="b46-perf-area-neg"></stop><stop offset="100%" class="b46-perf-area-neg"></stop></linearGradient></defs>\${axes}<line class="b46-perf-zero-line" x1="\${geo.L}" y1="\${geo.baseY}" x2="\${geo.W-geo.R}" y2="\${geo.baseY}"></line><path class="b46-perf-area" d="\${geo.area}"></path><path class="b46-perf-line" d="\${geo.line}"></path><line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" hidden></line><line data-b46-hover-hline class="b46-perf-hover-line b46-perf-hover-hline" x1="\${geo.L}" y1="0" x2="\${geo.W-geo.R}" y2="0" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="3" hidden></circle></svg>\${bars}<div class="b46-perf-tip" data-b46-perf-tip hidden></div><div class="b46-perf-ybadge" data-b46-perf-ybadge hidden></div><div class="b46-perf-xbadge" data-b46-perf-xbadge hidden></div>\`}
function ensureCard`;
  out=out.replace(chartRe,chartNew);

  const bindRe=/function bindChart\(\)\{\/\* B46_MARKET_CHART_INTERACTION_20261012_MARKET_V2 \*\/[\s\S]*?\}\nasync function load/;
  assert(bindRe.test(out),'V2_BIND_FUNCTION_MISSING');
  const bindNew=`function bindChart(){/* B46_MARKET_CHART_INTERACTION_20261012_MARKET_V3 */const svg=$('.b46-perf-svg'),wrap=$('[data-b46-chart-wrap]'),tip=$('[data-b46-perf-tip]'),line=$('[data-b46-hover-line]'),hline=$('[data-b46-hover-hline]'),unitLine=$('[data-b46-unit-hover-line]'),dot=$('[data-b46-hover-dot]'),yBadge=$('[data-b46-perf-ybadge]'),xBadge=$('[data-b46-perf-xbadge]');if(!svg||!wrap||!tip||!line||!hline||!dot||!yBadge||!xBadge||!currentPoints.length)return;wrap.dataset.b46MarketNav='1';dot.setAttribute('r','3');const hide=()=>{line.hidden=true;hline.hidden=true;if(unitLine)unitLine.hidden=true;dot.hidden=true;tip.hidden=true;yBadge.hidden=true;xBadge.hidden=true};const move=e=>{const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;const scale=yScale(currentPoints),geo=pathData(currentPoints,scale.min,scale.max),rawX=(e.clientX-rect.left)/rect.width*geo.W,rawY=(e.clientY-rect.top)/rect.height*geo.H,vx=Math.max(geo.L,Math.min(geo.W-geo.R,rawX)),vy=Math.max(geo.T,Math.min(geo.T+geo.ph,rawY)),pr=Math.max(0,Math.min(1,(vx-geo.L)/geo.pw)),fi=pr*Math.max(0,currentPoints.length-1),lo=Math.floor(fi),hi=Math.min(currentPoints.length-1,Math.ceil(fi)),mix=fi-lo,a=currentPoints[lo],b=currentPoints[hi]||a,lineValue=a.value+(b.value-a.value)*mix,lineY=geo.T+(scale.max-lineValue)/Math.max(.0001,scale.max-scale.min)*geo.ph,idx=Math.max(0,Math.min(currentPoints.length-1,Math.round(fi))),cursorValue=scale.max-(vy-geo.T)/geo.ph*(scale.max-scale.min),cursorDate=(a.date||0)+((b.date||a.date||0)-(a.date||0))*mix;line.hidden=false;hline.hidden=false;if(unitLine){unitLine.hidden=false;unitLine.setAttribute('x1',vx);unitLine.setAttribute('x2',vx)}dot.hidden=false;line.setAttribute('x1',vx);line.setAttribute('x2',vx);hline.setAttribute('y1',vy);hline.setAttribute('y2',vy);dot.setAttribute('cx',vx);dot.setAttribute('cy',lineY);dot.classList.toggle('positive',lineValue>=0);dot.classList.toggle('negative',lineValue<0);tip.innerHTML=tipMarkup(currentPoints[idx],idx,currentPoints.length);tip.hidden=false;yBadge.textContent='≈ '+valueText(cursorValue);yBadge.classList.toggle('positive',cursorValue>=0);yBadge.classList.toggle('negative',cursorValue<0);yBadge.hidden=false;xBadge.textContent=fmtDate(cursorDate);xBadge.hidden=false;const px=vx/geo.W*rect.width,py=vy/geo.H*rect.height,linePy=lineY/geo.H*rect.height;tip.style.left=Math.max(112,Math.min(rect.width-112,px))+'px';tip.style.top=Math.max(100,Math.min(rect.height-36,linePy))+'px';yBadge.style.top=Math.max(15,Math.min(rect.height-28,py))+'px';xBadge.style.left=Math.max(48,Math.min(rect.width-48,px))+'px'};svg.addEventListener('pointermove',move);svg.addEventListener('pointerdown',move);svg.addEventListener('pointerleave',hide);svg.addEventListener('pointercancel',hide)}
async function load`;
  out=out.replace(bindRe,bindNew);

  const apiAfter=[...out.matchAll(/\/api\/[A-Za-z0-9_?=&./-]+/g)].map(m=>m[0]).sort();
  assert.deepEqual(apiAfter,apiBefore,'API_STRINGS_CHANGED');
  acorn.parse(out,{ecmaVersion:'latest',sourceType:'script'});
  assert(out.includes(JMARK),'V3_MARKER_NOT_INSERTED');
  assert(out.includes('B46_SIGNAL_UNIT_BARS_20261012'),'UNIT_BARS_NOT_INSERTED');
  assert(out.includes('B46_MULTI_YEAR_AXIS_20261012'),'MULTI_YEAR_AXIS_NOT_INSERTED');
  return out;
}

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Long-term performance chart presentation only: 1px market line, green positive/red negative, dashed crosshair X/Y, approximate axis labels, per-signal unit P/L bars, multi-year ALL axis. No data/API/settlement formula changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function snap(page,theme){
 await page.evaluate(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);
 await page.reload({waitUntil:'networkidle2',timeout:90000});await delay(3500);
 const box=await page.$eval('.b46-perf-svg',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
 await page.mouse.move(box.x+box.w*.61,box.y+box.h*.48);await delay(200);
 return page.evaluate(()=>{
   const root=document.querySelector('.sp-trend.b46-perf-card'),q=s=>root?.querySelector(s),cs=e=>e?getComputedStyle(e):null;
   const line=q('.b46-perf-line'),v=q('[data-b46-hover-line]'),h=q('[data-b46-hover-hline]'),uv=q('[data-b46-unit-hover-line]'),yb=q('[data-b46-perf-ybadge]'),xb=q('[data-b46-perf-xbadge]'),up=q('.b46-perf-unit-pos'),dn=q('.b46-perf-unit-neg'),pos=q('.b46-perf-line-pos'),neg=q('.b46-perf-line-neg');
   return {theme:document.documentElement.dataset.theme,lineWidth:cs(line)?.strokeWidth,dash:cs(v)?.strokeDasharray,
    vHidden:v?.hidden,hHidden:h?.hidden,unitHidden:uv?.hidden,yHidden:yb?.hidden,xHidden:xb?.hidden,
    yText:yb?.textContent,xText:xb?.textContent,unitPos:(up?.getAttribute('d')||'').length,unitNeg:(dn?.getAttribute('d')||'').length,
    posColor:cs(pos)?.stopColor,negColor:cs(neg)?.stopColor,unit:Boolean(q('.b46-perf-unit-svg')),
    ranges:[...root.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim())};
 });
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1100});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&v3='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  const dark=await snap(page,'dark'),light=await snap(page,'light');report.runtime={dark,light};save();
  for(const r of [dark,light]){assert.equal(r.lineWidth,'1px','LINE_NOT_1PX');assert(r.unit,'UNIT_PANEL_MISSING');assert(r.unitPos>20,'POS_BARS_MISSING');assert(r.unitNeg>20,'NEG_BARS_MISSING');assert(r.dash&&r.dash!=='none'&&/4/.test(r.dash),'CROSSHAIR_NOT_DASHED');assert.equal(r.vHidden,false,'VERTICAL_CROSSHAIR_HIDDEN');assert.equal(r.hHidden,false,'HORIZONTAL_CROSSHAIR_HIDDEN');assert.equal(r.unitHidden,false,'UNIT_GUIDE_HIDDEN');assert.equal(r.yHidden,false,'Y_BADGE_HIDDEN');assert.equal(r.xHidden,false,'X_BADGE_HIDDEN');assert(/^≈ /.test(r.yText),'APPROX_LABEL_MISSING');assert.deepEqual(r.ranges,['7D','30D','90D','ALL'],'RANGES_CHANGED')}
  assert.equal(dark.posColor,'rgb(66, 220, 147)','DARK_POS_NOT_GREEN');assert.equal(dark.negColor,'rgb(240, 100, 115)','DARK_NEG_NOT_RED');
  assert.equal(light.posColor,'rgb(22, 135, 90)','LIGHT_POS_NOT_GREEN');assert.equal(light.negColor,'rgb(194, 58, 74)','LIGHT_NEG_NOT_RED');
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
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),js=jb.toString('utf8'),css=cb.toString('utf8');
 assert(!js.includes(JMARK),'V3_ALREADY_LIVE');assert(!css.includes(CMARK),'V3_STYLE_ALREADY_LIVE');
 const ja=Buffer.from(patchJs(js)),ca=Buffer.from(css+'\n'+CSS_PATCH+'\n');
 writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',ja);writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',ca);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');assert.equal(staged.hashes[CSS],sha(cb),'STAGED_CSS_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];
 writeFileSync(resolve(staged.runtime,'assets',JS),ja);writeFileSync(resolve(staged.runtime,'assets',CSS),ca);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<45;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const j=await publicFile('/'+JS),c=await publicFile('/'+CSS);if(sha(j)===sha(ja)&&sha(c)===sha(ca)&&j.toString('utf8').includes(JMARK)&&c.toString('utf8').includes(CMARK)){live=true;break}}catch{}await delay(1000)}assert(live,'V3_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.result='SUCCESS';save();
  console.log('BALL46_PERFORMANCE_MARKET_CHART_V3_SUCCESS '+JSON.stringify({base,candidate,changed:[JS,CSS],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
