import assert from 'node:assert/strict';
import * as acorn from 'acorn';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='singlepage-workspace-343.css';
const JS_MARK='B46_MARKET_CHART_INTERACTION_20261012_MARKET_V2';
const CSS_MARK='/* B46_PERFORMANCE_MARKET_CHART_20261012 */';

const CSS_PATCH=`
/* B46_PERFORMANCE_MARKET_CHART_20261012 */
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-svg{
  cursor:crosshair!important;
  touch-action:none!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line{
  stroke:url(#b46PerfLineGradient)!important;
  fill:none!important;
  stroke-width:1.05px!important;
  vector-effect:non-scaling-stroke!important;
  shape-rendering:geometricPrecision!important;
  stroke-linecap:round!important;
  stroke-linejoin:round!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-area{
  fill:url(#b46PerfAreaGradient)!important;
  stroke:none!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-pos{stop-color:#3fd28c!important}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-neg{stop-color:#f06a78!important}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-area-pos{stop-color:#3fd28c!important;stop-opacity:.15!important}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-area-neg{stop-color:#f06a78!important;stop-opacity:.12!important}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-hover-line{
  stroke:#91a9bb!important;
  stroke-width:.82px!important;
  stroke-dasharray:4 4!important;
  vector-effect:non-scaling-stroke!important;
  opacity:.78!important;
  pointer-events:none!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-zero-line{
  stroke:#8297aa!important;
  stroke-width:.8px!important;
  stroke-dasharray:2 5!important;
  vector-effect:non-scaling-stroke!important;
  opacity:.38!important;
  pointer-events:none!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-hover-dot{
  stroke-width:1px!important;
  vector-effect:non-scaling-stroke!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-text,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-title,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-xbadge,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-text{
  font-size:9px!important;
  font-weight:650!important;
  letter-spacing:.015em!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-title{
  font-size:9px!important;
  font-weight:800!important;
  letter-spacing:.045em!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-xbadge{
  font-size:9px!important;
  font-weight:850!important;
  letter-spacing:.025em!important;
  border-radius:5px!important;
  box-shadow:0 4px 12px rgba(0,0,0,.14)!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip{
  border-radius:8px!important;
  box-shadow:0 12px 28px rgba(0,0,0,.20)!important;
  backdrop-filter:blur(10px)!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .row strong,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip-head strong{
  font-weight:800!important;
}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .positive,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge.positive{color:#3fd28c!important}
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .negative,
body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge.negative{color:#f06a78!important}

html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-text{fill:#9aafc0!important;color:#9aafc0!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-title{fill:#c9d5df!important;color:#c9d5df!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-xbadge{
  background:rgba(12,22,31,.96)!important;
  color:#eef5fa!important;
  border:1px solid rgba(145,169,187,.28)!important;
}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip{
  background:rgba(11,20,29,.94)!important;
  color:#dce7ef!important;
  border:1px solid rgba(145,169,187,.22)!important;
}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .row>span,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip-head>span{color:#8fa5b7!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .row strong,
html[data-theme="dark"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip-head strong{color:#f3f7fa!important}

html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-pos{stop-color:#167a48!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-line-neg{stop-color:#b23748!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-area-pos{stop-color:#167a48!important;stop-opacity:.11!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-area-neg{stop-color:#b23748!important;stop-opacity:.09!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-hover-line{stroke:#627789!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-zero-line{stroke:#65798a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-text{fill:#536878!important;color:#536878!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-axis-title{fill:#263947!important;color:#263947!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-xbadge{
  background:rgba(255,255,255,.97)!important;
  color:#1d2c38!important;
  border:1px solid rgba(64,85,102,.20)!important;
  box-shadow:0 4px 12px rgba(23,39,52,.10)!important;
}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip{
  background:rgba(255,255,255,.96)!important;
  color:#233440!important;
  border:1px solid rgba(64,85,102,.16)!important;
  box-shadow:0 12px 28px rgba(23,39,52,.12)!important;
}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .row>span,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip-head>span{color:#66798a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .row strong,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip-head strong{color:#172733!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .positive,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge.positive{color:#167a48!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-tip .negative,
html[data-theme="light"] body[data-workspace-view="statistics"] .sp-trend.b46-perf-card .b46-perf-ybadge.negative{color:#b23748!important}
`;

function patchJs(before){
  assert(!before.includes(JS_MARK),'JS_MARK_ALREADY_PRESENT');
  assert(before.includes('/* B46_MARKET_CHART_INTERACTION_20261012 */'),'EXPECTED_INTERACTION_MARK_MISSING');

  let out=before;
  const apiBefore=[...before.matchAll(/\/api\/[A-Za-z0-9_?=&./-]+/g)].map(m=>m[0]).sort();

  const oldReturn='return{xy,line,area,L,R,T,B,W,H,pw,ph}}';
  assert.equal((out.match(new RegExp(oldReturn.replace(/[{}]/g,'\\$&'),'g'))||[]).length,1,'PATHDATA_RETURN_NOT_UNIQUE');
  out=out.replace(oldReturn,'return{xy,line,area,baseY,L,R,T,B,W,H,pw,ph}}');

  const oldScale="const scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo);return`";
  assert(out.includes(oldScale),'CHART_SCALE_FRAGMENT_MISSING');
  out=out.replace(oldScale,"const scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo),zeroPct=Math.max(0,Math.min(100,(geo.baseY-geo.T)/geo.ph*100));return`");

  const oldDefs='<defs><linearGradient id="b46PerfAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="b46-perf-stop-top"></stop><stop offset="100%" class="b46-perf-stop-bottom"></stop></linearGradient></defs>${axes}<path class="b46-perf-area" d="${geo.area}"></path><path class="b46-perf-line" d="${geo.line}"></path>';
  assert(out.includes(oldDefs),'CHART_DEFS_FRAGMENT_MISSING');
  const newDefs='<defs><linearGradient id="b46PerfLineGradient" x1="0" y1="${geo.T}" x2="0" y2="${geo.T+geo.ph}" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-line-pos"></stop><stop offset="${zeroPct}%" class="b46-perf-line-pos"></stop><stop offset="${zeroPct}%" class="b46-perf-line-neg"></stop><stop offset="100%" class="b46-perf-line-neg"></stop></linearGradient><linearGradient id="b46PerfAreaGradient" x1="0" y1="${geo.T}" x2="0" y2="${geo.T+geo.ph}" gradientUnits="userSpaceOnUse"><stop offset="0%" class="b46-perf-area-pos"></stop><stop offset="${zeroPct}%" class="b46-perf-area-pos"></stop><stop offset="${zeroPct}%" class="b46-perf-area-neg"></stop><stop offset="100%" class="b46-perf-area-neg"></stop></linearGradient></defs>${axes}<line class="b46-perf-zero-line" x1="${geo.L}" y1="${geo.baseY}" x2="${geo.W-geo.R}" y2="${geo.baseY}"></line><path class="b46-perf-area" d="${geo.area}"></path><path class="b46-perf-line" d="${geo.line}"></path>';
  out=out.replace(oldDefs,newDefs);

  const oldMetric='<div class="row metric"><span>${esc(modeLabel())}</span><strong>${esc(valueText(p.value))}</strong></div>';
  assert(out.includes(oldMetric),'TIP_METRIC_FRAGMENT_MISSING');
  out=out.replace(oldMetric,'<div class="row metric"><span>${esc(modeLabel())}</span><strong class="${p.value>=0?\'positive\':\'negative\'}">${esc(valueText(p.value))}</strong></div>');

  const bindRe=/function bindChart\(\)\{\/\* B46_MARKET_CHART_INTERACTION_20261012 \*\/[\s\S]*?\}\nasync function load/;
  assert(bindRe.test(out),'BIND_CHART_FUNCTION_MISSING');
  const bindNew=`function bindChart(){/* ${JS_MARK} */const svg=$('.b46-perf-svg'),wrap=$('[data-b46-chart-wrap]'),tip=$('[data-b46-perf-tip]'),line=$('[data-b46-hover-line]'),hline=$('[data-b46-hover-hline]'),dot=$('[data-b46-hover-dot]'),yBadge=$('[data-b46-perf-ybadge]'),xBadge=$('[data-b46-perf-xbadge]');if(!svg||!wrap||!tip||!line||!hline||!dot||!yBadge||!xBadge||!currentPoints.length)return;wrap.dataset.b46MarketNav='1';dot.setAttribute('r','3');const hide=()=>{line.hidden=true;hline.hidden=true;dot.hidden=true;tip.hidden=true;yBadge.hidden=true;xBadge.hidden=true};const move=e=>{const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;const scale=yScale(currentPoints),geo=pathData(currentPoints,scale.min,scale.max),rawX=(e.clientX-rect.left)/rect.width*geo.W,rawY=(e.clientY-rect.top)/rect.height*geo.H,vx=Math.max(geo.L,Math.min(geo.W-geo.R,rawX)),vy=Math.max(geo.T,Math.min(geo.T+geo.ph,rawY)),pr=Math.max(0,Math.min(1,(vx-geo.L)/geo.pw)),fi=pr*Math.max(0,currentPoints.length-1),lo=Math.floor(fi),hi=Math.min(currentPoints.length-1,Math.ceil(fi)),mix=fi-lo,a=currentPoints[lo],b=currentPoints[hi]||a,lineValue=a.value+(b.value-a.value)*mix,lineY=geo.T+(scale.max-lineValue)/Math.max(.0001,scale.max-scale.min)*geo.ph,idx=Math.max(0,Math.min(currentPoints.length-1,Math.round(fi))),cursorValue=scale.max-(vy-geo.T)/geo.ph*(scale.max-scale.min),cursorDate=(a.date||0)+((b.date||a.date||0)-(a.date||0))*mix;line.hidden=false;hline.hidden=false;dot.hidden=false;line.setAttribute('x1',vx);line.setAttribute('x2',vx);hline.setAttribute('y1',vy);hline.setAttribute('y2',vy);dot.setAttribute('cx',vx);dot.setAttribute('cy',lineY);dot.classList.toggle('positive',lineValue>=0);dot.classList.toggle('negative',lineValue<0);tip.innerHTML=tipMarkup(currentPoints[idx],idx,currentPoints.length);tip.hidden=false;yBadge.textContent='≈ '+valueText(cursorValue);yBadge.classList.toggle('positive',cursorValue>=0);yBadge.classList.toggle('negative',cursorValue<0);yBadge.hidden=false;xBadge.textContent=fmtDate(cursorDate);xBadge.hidden=false;const px=vx/geo.W*rect.width,py=vy/geo.H*rect.height,linePy=lineY/geo.H*rect.height;tip.style.left=\`${Math.max(112,Math.min(rect.width-112,px))}px\`;tip.style.top=\`${Math.max(100,Math.min(rect.height-36,linePy))}px\`;yBadge.style.top=\`${Math.max(15,Math.min(rect.height-28,py))}px\`;xBadge.style.left=\`${Math.max(48,Math.min(rect.width-48,px))}px\`};svg.addEventListener('pointermove',move);svg.addEventListener('pointerdown',move);svg.addEventListener('pointerleave',hide);svg.addEventListener('pointercancel',hide)}
async function load`;
  out=out.replace(bindRe,bindNew);

  const apiAfter=[...out.matchAll(/\/api\/[A-Za-z0-9_?=&./-]+/g)].map(m=>m[0]).sort();
  assert.deepEqual(apiAfter,apiBefore,'API_STRINGS_CHANGED');
  acorn.parse(out,{ecmaVersion:'latest',sourceType:'script'});
  assert(out.includes(JS_MARK),'JS_MARK_NOT_INSERTED');
  assert(out.includes('b46PerfLineGradient'),'LINE_GRADIENT_NOT_INSERTED');
  return out;
}

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Long-term performance chart presentation/interaction only; preserve statistics calculations, data loading, engine and settlement.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
  const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
    await page.goto('https://ball46.com/?view=statistics&marketChartVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
    await delay(4500);
    const base=await page.evaluate(()=>{
      const root=document.querySelector('.sp-trend.b46-perf-card'),svg=root?.querySelector('.b46-perf-svg'),line=root?.querySelector('.b46-perf-line'),wrap=root?.querySelector('[data-b46-chart-wrap]');
      const pos=root?.querySelectorAll('#b46PerfLineGradient .b46-perf-line-pos').length||0,neg=root?.querySelectorAll('#b46PerfLineGradient .b46-perf-line-neg').length||0;
      const cs=line?getComputedStyle(line):null;
      const net=[...root?.querySelectorAll('.b46-perf-kpi')||[]].find(x=>x.querySelector('span')?.textContent.trim()==='NET')?.querySelector('b')?.textContent.trim();
      return {ok:Boolean(root&&svg&&line&&wrap),nav:wrap?.dataset.b46MarketNav,stroke:cs?.stroke,strokeWidth:cs?.strokeWidth,pos,neg,net,zero:Boolean(root?.querySelector('.b46-perf-zero-line')),chartRows:document.querySelectorAll('[data-sp-table-body] tr').length};
    });
    assert(base.ok,'CHART_MISSING');assert.equal(base.nav,'1','MARKET_NAV_NOT_BOUND');
    assert(base.stroke.includes('b46PerfLineGradient'),'LINE_GRADIENT_NOT_ACTIVE');
    assert(Number.parseFloat(base.strokeWidth)<=1.2,'LINE_NOT_THIN');
    assert.equal(base.pos,2,'POSITIVE_GRADIENT_STOPS_MISSING');assert.equal(base.neg,2,'NEGATIVE_GRADIENT_STOPS_MISSING');assert(base.zero,'ZERO_BASELINE_MISSING');
    const box=await page.$eval('.b46-perf-svg',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});
    const x=box.x+box.w*.62;
    await page.mouse.move(x,box.y+box.h*.30);
    await delay(150);
    const hover1=await page.evaluate(()=>{
      const root=document.querySelector('.sp-trend.b46-perf-card'),v=root.querySelector('[data-b46-hover-line]'),h=root.querySelector('[data-b46-hover-hline]'),yb=root.querySelector('[data-b46-perf-ybadge]'),xb=root.querySelector('[data-b46-perf-xbadge]'),tip=root.querySelector('[data-b46-perf-tip]');
      return {vHidden:v.hidden,hHidden:h.hidden,y:v.getAttribute('x1'),hy:h.getAttribute('y1'),yb:yb.textContent,xb:xb.textContent,tipHidden:tip.hidden,dash:getComputedStyle(v).strokeDasharray};
    });
    await page.mouse.move(x,box.y+box.h*.72);
    await delay(150);
    const hover2=await page.evaluate(()=>{
      const root=document.querySelector('.sp-trend.b46-perf-card'),v=root.querySelector('[data-b46-hover-line]'),h=root.querySelector('[data-b46-hover-hline]'),yb=root.querySelector('[data-b46-perf-ybadge]'),xb=root.querySelector('[data-b46-perf-xbadge]');
      return {vHidden:v.hidden,hHidden:h.hidden,y:v.getAttribute('x1'),hy:h.getAttribute('y1'),yb:yb.textContent,xb:xb.textContent};
    });
    assert(!hover1.vHidden&&!hover1.hHidden&&!hover1.tipHidden,'CROSSHAIR_NOT_VISIBLE');
    assert(hover1.dash&&hover1.dash!=='none','CROSSHAIR_NOT_DASHED');
    assert.equal(hover1.y,hover2.y,'VERTICAL_GUIDE_MOVED_WITH_SAME_X');
    assert.notEqual(hover1.hy,hover2.hy,'HORIZONTAL_GUIDE_NOT_FOLLOWING_POINTER');
    assert.notEqual(hover1.yb,hover2.yb,'APPROX_VALUE_NOT_FOLLOWING_POINTER');
    assert(hover1.yb.startsWith('≈ ')&&hover2.yb.startsWith('≈ '),'APPROX_VALUE_LABEL_MISSING');
    report.runtime={base,hover1,hover2};save();
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
 assert.equal(base,'6404c3cc-9b66-4f2a-bafe-12fff7cbf529','PRODUCTION_MOVED_FROM_CONFIRMED_BASE');
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();
 const jsBeforeBytes=await publicFile('/'+JS),cssBeforeBytes=await publicFile('/'+CSS);
 const jsBefore=jsBeforeBytes.toString('utf8'),cssBefore=cssBeforeBytes.toString('utf8');
 assert(!cssBefore.includes(CSS_MARK),'CSS_MARK_ALREADY_PRESENT');
 const jsAfter=patchJs(jsBefore),cssAfter=cssBefore+'\n'+CSS_PATCH+'\n';
 const jsAfterBytes=Buffer.from(jsAfter),cssAfterBytes=Buffer.from(cssAfter);
 writeFileSync('audit/js-before.js',jsBeforeBytes);writeFileSync('audit/js-after.js',jsAfterBytes);writeFileSync('audit/css-before.css',cssBeforeBytes);writeFileSync('audit/css-after.css',cssAfterBytes);

 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[JS],sha(jsBeforeBytes),'STAGED_JS_NOT_CURRENT');assert.equal(staged.hashes[CSS],sha(cssBeforeBytes),'STAGED_CSS_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];
 writeFileSync(resolve(staged.runtime,'assets',JS),jsAfterBytes);writeFileSync(resolve(staged.runtime,'assets',CSS),cssAfterBytes);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
   wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
   let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const j=await publicFile('/'+JS),c=await publicFile('/'+CSS);if(sha(j)===sha(jsAfterBytes)&&sha(c)===sha(cssAfterBytes)&&j.toString('utf8').includes(JS_MARK)&&c.toString('utf8').includes(CSS_MARK)){live=true;break}}catch{}await delay(1000)}assert(live,'CHART_PATCH_NOT_LIVE');
   for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
   await runtimeCheck();
   const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
   assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
   assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
   assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
   report.finalVersion=candidate;report.result='SUCCESS';save();
   console.log('BALL46_PERFORMANCE_MARKET_CHART_SUCCESS '+JSON.stringify({base,candidate,changed:[JS,CSS],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
