import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='longterm-performance-343.css';
const JS_MARK='B46_MARKET_CHART_INTERACTION_20261012';
const CSS_MARK='/* B46_MARKET_CHART_TERMINAL_20261012 */';

const oldChartHtml=`function chartHtml(s){const points=getPoints(s);currentPoints=points;if(!points.length)return'<div class="b46-perf-empty">No priced settled signals in this range.</div>';const scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo);return\`<svg class="b46-perf-svg" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="\${esc(modeLabel())} chart">\${axes}<path class="b46-perf-area" d="\${geo.area}"></path><path class="b46-perf-line" d="\${geo.line}"></path><line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="4" hidden></circle></svg><div class="b46-perf-tip" data-b46-perf-tip hidden></div>\`}`;

const newChartHtml=`function chartHtml(s){const points=getPoints(s);currentPoints=points;if(!points.length)return'<div class="b46-perf-empty">No priced settled signals in this range.</div>';const scale=yScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo);return\`<svg class="b46-perf-svg" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="\${esc(modeLabel())} chart"><defs><linearGradient id="b46PerfAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" class="b46-perf-stop-top"></stop><stop offset="100%" class="b46-perf-stop-bottom"></stop></linearGradient></defs>\${axes}<path class="b46-perf-area" d="\${geo.area}"></path><path class="b46-perf-line" d="\${geo.line}"></path><line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="\${geo.T}" x2="0" y2="\${geo.T+geo.ph}" hidden></line><line data-b46-hover-hline class="b46-perf-hover-line b46-perf-hover-hline" x1="\${geo.L}" y1="0" x2="\${geo.W-geo.R}" y2="0" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="4" hidden></circle></svg><div class="b46-perf-tip" data-b46-perf-tip hidden></div><div class="b46-perf-ybadge" data-b46-perf-ybadge hidden></div><div class="b46-perf-xbadge" data-b46-perf-xbadge hidden></div>\`}`;

const oldTip=`function tipMarkup(p){const r=p.row,home=r?.home?.name||'—',away=r?.away?.name||'—',pick=String(r?.selection||r?.pick||'—'),market=String(r?.marketLabel||r?.market||r?.providerMarket||marketKey(r)||'—'),odds=num(r?.odds),profit=p.profit;return\`<b>\${esc(home)} — \${esc(away)}</b><div class="row"><span>Date</span><strong>\${esc(fmtDate(p.date))}</strong></div><div class="row"><span>Market</span><strong>\${esc(market)}</strong></div><div class="row"><span>Pick</span><strong>\${esc(pick)}</strong></div><div class="row"><span>Odds</span><strong>\${odds&&odds>1?odds.toFixed(2):'—'}</strong></div><div class="row"><span>Result</span><strong>\${esc(outcome(r)||'—')}</strong></div><div class="row"><span>This signal</span><strong class="\${profit>0?'positive':profit<0?'negative':''}">\${Number.isFinite(profit)?\`\${profit>=0?'+':''}\${profit.toFixed(2)}U\`:'—'}</strong></div><div class="row"><span>\${esc(modeLabel())}</span><strong>\${esc(valueText(p.value))}</strong></div>\`}`;

const newTip=`function tipMarkup(p,idx,total){const r=p.row,home=r?.home?.name||'—',away=r?.away?.name||'—',pick=String(r?.selection||r?.pick||'—'),market=String(r?.marketLabel||r?.market||r?.providerMarket||marketKey(r)||'—'),odds=num(r?.odds),profit=p.profit;return\`<div class="b46-perf-tip-head"><span>SIGNAL #\${idx+1} / \${total}</span><strong>\${esc(fmtDate(p.date))}</strong></div><b>\${esc(home)} — \${esc(away)}</b><div class="row"><span>Market</span><strong>\${esc(market)}</strong></div><div class="row"><span>Pick</span><strong>\${esc(pick)}</strong></div><div class="row"><span>Odds</span><strong>\${odds&&odds>1?odds.toFixed(2):'—'}</strong></div><div class="row"><span>Result</span><strong>\${esc(outcome(r)||'—')}</strong></div><div class="row"><span>This signal</span><strong class="\${profit>0?'positive':profit<0?'negative':''}">\${Number.isFinite(profit)?\`\${profit>=0?'+':''}\${profit.toFixed(2)}U\`:'—'}</strong></div><div class="row metric"><span>\${esc(modeLabel())}</span><strong>\${esc(valueText(p.value))}</strong></div>\`}`;

const oldBind=`function bindChart(){const svg=$('.b46-perf-svg'),wrap=$('[data-b46-chart-wrap]'),tip=$('[data-b46-perf-tip]'),line=$('[data-b46-hover-line]'),dot=$('[data-b46-hover-dot]');if(!svg||!wrap||!tip||!line||!dot||!currentPoints.length)return;const move=e=>{const rect=svg.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,e.clientX-rect.left)),ratio=rect.width?x/rect.width:0,plotStart=72/1000,plotEnd=(1000-18)/1000,pr=Math.max(0,Math.min(1,(ratio-plotStart)/(plotEnd-plotStart))),idx=Math.max(0,Math.min(currentPoints.length-1,Math.round(pr*(currentPoints.length-1)))),scale=yScale(currentPoints),geo=pathData(currentPoints,scale.min,scale.max),q=geo.xy[idx];if(!q)return;line.hidden=false;dot.hidden=false;line.setAttribute('x1',q.x);line.setAttribute('x2',q.x);dot.setAttribute('cx',q.x);dot.setAttribute('cy',q.y);tip.innerHTML=tipMarkup(currentPoints[idx]);tip.hidden=false;const px=q.x/1000*rect.width,py=q.y/250*rect.height;tip.style.left=\`\${Math.max(95,Math.min(rect.width-95,px))}px\`;tip.style.top=\`\${Math.max(88,py)}px\`};svg.addEventListener('pointermove',move);svg.addEventListener('pointerdown',move);svg.addEventListener('pointerleave',()=>{line.hidden=true;dot.hidden=true;tip.hidden=true})}`;

const newBind=`function bindChart(){/* ${JS_MARK} */const svg=$('.b46-perf-svg'),wrap=$('[data-b46-chart-wrap]'),tip=$('[data-b46-perf-tip]'),line=$('[data-b46-hover-line]'),hline=$('[data-b46-hover-hline]'),dot=$('[data-b46-hover-dot]'),yBadge=$('[data-b46-perf-ybadge]'),xBadge=$('[data-b46-perf-xbadge]');if(!svg||!wrap||!tip||!line||!hline||!dot||!yBadge||!xBadge||!currentPoints.length)return;const hide=()=>{line.hidden=true;hline.hidden=true;dot.hidden=true;tip.hidden=true;yBadge.hidden=true;xBadge.hidden=true};const move=e=>{const rect=svg.getBoundingClientRect(),x=Math.max(0,Math.min(rect.width,e.clientX-rect.left)),ratio=rect.width?x/rect.width:0,plotStart=72/1000,plotEnd=(1000-18)/1000,pr=Math.max(0,Math.min(1,(ratio-plotStart)/(plotEnd-plotStart))),idx=Math.max(0,Math.min(currentPoints.length-1,Math.round(pr*(currentPoints.length-1)))),scale=yScale(currentPoints),geo=pathData(currentPoints,scale.min,scale.max),q=geo.xy[idx];if(!q)return;line.hidden=false;hline.hidden=false;dot.hidden=false;line.setAttribute('x1',q.x);line.setAttribute('x2',q.x);hline.setAttribute('y1',q.y);hline.setAttribute('y2',q.y);dot.setAttribute('cx',q.x);dot.setAttribute('cy',q.y);tip.innerHTML=tipMarkup(currentPoints[idx],idx,currentPoints.length);tip.hidden=false;yBadge.textContent=valueText(currentPoints[idx].value);yBadge.hidden=false;xBadge.textContent=fmtDate(currentPoints[idx].date);xBadge.hidden=false;const px=q.x/1000*rect.width,py=q.y/250*rect.height;tip.style.left=\`\${Math.max(112,Math.min(rect.width-112,px))}px\`;tip.style.top=\`\${Math.max(100,py)}px\`;yBadge.style.top=\`\${Math.max(15,Math.min(rect.height-28,py))}px\`;xBadge.style.left=\`\${Math.max(48,Math.min(rect.width-48,px))}px\`};svg.addEventListener('pointermove',move);svg.addEventListener('pointerdown',move);svg.addEventListener('pointerleave',hide);svg.addEventListener('pointercancel',hide)}`;

const cssPatch=`
/* B46_MARKET_CHART_TERMINAL_20261012 */
.b46-perf-chart-wrap{
  --b46-chart-line:#1769aa;
  --b46-chart-line-soft:rgba(23,105,170,.14);
  --b46-chart-cross:rgba(41,68,91,.46);
  --b46-chart-grid:rgba(48,73,95,.10);
  --b46-chart-tip:#f8fafc;
  --b46-chart-tip-border:rgba(55,79,101,.18);
  background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 97%,#eaf2f8),var(--panel))!important;
  cursor:crosshair;
  isolation:isolate;
}
html[data-theme="dark"] .b46-perf-chart-wrap{
  --b46-chart-line:#57c7ff;
  --b46-chart-line-soft:rgba(87,199,255,.18);
  --b46-chart-cross:rgba(174,205,226,.42);
  --b46-chart-grid:rgba(145,174,198,.11);
  --b46-chart-tip:rgba(10,20,31,.96);
  --b46-chart-tip-border:rgba(145,186,216,.20);
  background:linear-gradient(180deg,rgba(10,22,34,.98),rgba(8,18,28,.94))!important;
}
.b46-perf-svg{cursor:crosshair!important}
.b46-perf-grid{stroke:var(--b46-chart-grid)!important}
.b46-perf-vgrid{stroke:var(--b46-chart-grid)!important;stroke-dasharray:2 8!important}
.b46-perf-grid.zero{stroke:color-mix(in srgb,var(--b46-chart-cross) 72%,transparent)!important;stroke-dasharray:5 5!important}
.b46-perf-line{stroke:var(--b46-chart-line)!important;stroke-width:2!important;filter:drop-shadow(0 1px 2px var(--b46-chart-line-soft))}
.b46-perf-area{fill:url(#b46PerfAreaGradient)!important}
.b46-perf-stop-top{stop-color:var(--b46-chart-line)!important;stop-opacity:.22!important}
.b46-perf-stop-bottom{stop-color:var(--b46-chart-line)!important;stop-opacity:.015!important}
.b46-perf-hover-line{stroke:var(--b46-chart-cross)!important;stroke-width:1!important;stroke-dasharray:3 4!important}
.b46-perf-hover-hline{opacity:.88}
.b46-perf-hover-dot{fill:var(--panel)!important;stroke:var(--b46-chart-line)!important;stroke-width:3!important;filter:drop-shadow(0 0 4px var(--b46-chart-line-soft))}
.b46-perf-axis-text,.b46-perf-axis-title{font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important}
.b46-perf-tip{
  min-width:210px!important;
  max-width:270px!important;
  padding:10px 11px!important;
  border:1px solid var(--b46-chart-tip-border)!important;
  border-radius:7px!important;
  background:var(--b46-chart-tip)!important;
  box-shadow:0 14px 34px rgba(8,18,28,.18)!important;
  backdrop-filter:blur(12px)!important;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-size:9px!important;
}
.b46-perf-tip .b46-perf-tip-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:6px;margin-bottom:7px;border-bottom:1px solid var(--b46-chart-tip-border)}
.b46-perf-tip .b46-perf-tip-head span{font-size:8px;font-weight:850;letter-spacing:.055em;color:var(--muted)}
.b46-perf-tip .b46-perf-tip-head strong{font-size:9px;font-weight:850;color:var(--text)}
.b46-perf-tip>b{font-size:10px!important;font-weight:900!important;margin-bottom:7px!important}
.b46-perf-tip .row{margin-top:3px!important}
.b46-perf-tip .row.metric{padding-top:6px;margin-top:7px!important;border-top:1px solid var(--b46-chart-tip-border)}
.b46-perf-tip .row.metric strong{color:var(--b46-chart-line)!important;font-size:10px}
.b46-perf-ybadge,.b46-perf-xbadge{
  position:absolute;
  z-index:5;
  pointer-events:none;
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif;
  font-size:8px;
  font-weight:900;
  line-height:1;
  white-space:nowrap;
  border:1px solid var(--b46-chart-tip-border);
  background:var(--b46-chart-line);
  color:#fff;
  box-shadow:0 3px 10px rgba(8,18,28,.16);
}
.b46-perf-ybadge{right:7px;transform:translateY(-50%);padding:5px 6px;border-radius:4px}
.b46-perf-xbadge{bottom:5px;transform:translateX(-50%);padding:5px 7px;border-radius:4px}
.b46-perf-ybadge[hidden],.b46-perf-xbadge[hidden]{display:none}
html[data-theme="dark"] .b46-perf-ybadge,html[data-theme="dark"] .b46-perf-xbadge{color:#06131d}
@media(max-width:760px){
  .b46-perf-tip{min-width:190px!important;max-width:230px!important;font-size:8px!important}
  .b46-perf-ybadge,.b46-perf-xbadge{font-size:7px}
}
`;

mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Long-term performance chart interaction/presentation only. Preserve statistics formulas, data source, API behavior, filters, ranges and metrics.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&marketChartVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(4500);
  const box=await page.$eval('.b46-perf-svg',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}});
  await page.mouse.move(box.x+box.width*.58,box.y+box.height*.48);
  await delay(500);
  const r=await page.evaluate(()=>{
    const q=s=>document.querySelector(s), cs=e=>e?getComputedStyle(e):null;
    const svg=q('.b46-perf-svg'),line=q('[data-b46-hover-line]'),hline=q('[data-b46-hover-hline]'),dot=q('[data-b46-hover-dot]'),tip=q('[data-b46-perf-tip]'),yb=q('[data-b46-perf-ybadge]'),xb=q('[data-b46-perf-xbadge]');
    const ranges=[...document.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim());
    const modes=[...document.querySelectorAll('[data-b46-mode]')].map(x=>x.textContent.trim());
    return {
      ok:Boolean(svg&&line&&hline&&dot&&tip&&yb&&xb),
      range:ranges,mode:modes,
      verticalHidden:line?.hidden,horizontalHidden:hline?.hidden,dotHidden:dot?.hidden,tipHidden:tip?.hidden,yBadgeHidden:yb?.hidden,xBadgeHidden:xb?.hidden,
      tipText:(tip?.innerText||'').slice(0,500),
      yBadge:(yb?.textContent||'').trim(),xBadge:(xb?.textContent||'').trim(),
      lineColor:cs(q('.b46-perf-line'))?.stroke,
      cursor:cs(q('[data-b46-chart-wrap]'))?.cursor,
      rows:document.querySelectorAll('[data-sp-table-body] tr').length,
      title:q('.b46-perf-title h3')?.textContent.trim()
    };
  });
  report.runtime=r;save();
  assert(r.ok,'MARKET_CHART_ELEMENTS_MISSING');
  assert.deepEqual(r.range,['7D','30D','90D','ALL'],'RANGE_CONTROLS_CHANGED');
  assert.deepEqual(r.mode,['UNITS','ROI','WIN RATE'],'MODE_CONTROLS_CHANGED');
  assert.equal(r.verticalHidden,false,'VERTICAL_CROSSHAIR_NOT_ACTIVE');
  assert.equal(r.horizontalHidden,false,'HORIZONTAL_CROSSHAIR_NOT_ACTIVE');
  assert.equal(r.dotHidden,false,'FOCUS_DOT_NOT_ACTIVE');
  assert.equal(r.tipHidden,false,'TOOLTIP_NOT_ACTIVE');
  assert.equal(r.yBadgeHidden,false,'VALUE_BADGE_NOT_ACTIVE');
  assert.equal(r.xBadgeHidden,false,'DATE_BADGE_NOT_ACTIVE');
  assert(r.tipText.includes('SIGNAL #'),'TERMINAL_TOOLTIP_HEADER_MISSING');
  assert(r.yBadge.length>0&&r.xBadge.length>0,'NAV_BADGES_EMPTY');
  assert.equal(r.cursor,'crosshair','CROSSHAIR_CURSOR_MISSING');
  assert(r.rows>0,'STATISTICS_ROWS_MISSING');
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
 const jsBeforeBytes=await publicFile('/'+JS),cssBeforeBytes=await publicFile('/'+CSS);
 const jsBefore=jsBeforeBytes.toString('utf8'),cssBefore=cssBeforeBytes.toString('utf8');
 assert(!jsBefore.includes(JS_MARK),'JS_ALREADY_DEPLOYED_STOP');
 assert(!cssBefore.includes(CSS_MARK),'CSS_ALREADY_DEPLOYED_STOP');
 assert(jsBefore.includes(oldChartHtml),'CHART_HTML_PATTERN_NOT_FOUND');
 assert(jsBefore.includes(oldTip),'TIP_PATTERN_NOT_FOUND');
 assert(jsBefore.includes(oldBind),'BIND_PATTERN_NOT_FOUND');
 const apiLoadBefore=(jsBefore.match(/BALL46_STATISTICS_DATA\.load\(\)/g)||[]).length;
 const jsAfter=jsBefore.replace(oldChartHtml,newChartHtml).replace(oldTip,newTip).replace(oldBind,newBind);
 const cssAfter=cssBefore+'\n'+cssPatch+'\n';
 assert.equal((jsAfter.match(/BALL46_STATISTICS_DATA\.load\(\)/g)||[]).length,apiLoadBefore,'DATA_LOAD_CALL_COUNT_CHANGED');
 assert(jsAfter.includes("const API='/api/engine/statistics';"),'API_DECL_CHANGED');
 const jsAfterBytes=Buffer.from(jsAfter),cssAfterBytes=Buffer.from(cssAfter);
 writeFileSync('audit/js-before.js',jsBeforeBytes);writeFileSync('audit/js-after.js',jsAfterBytes);
 writeFileSync('audit/css-before.css',cssBeforeBytes);writeFileSync('audit/css-after.css',cssAfterBytes);
 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source);await verifyRailBase(staged);
 assert.equal(staged.hashes[JS],sha(jsBeforeBytes),'STAGED_JS_NOT_CURRENT');
 assert.equal(staged.hashes[CSS],sha(cssBeforeBytes),'STAGED_CSS_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];
 writeFileSync(resolve(staged.runtime,'assets',JS),jsAfterBytes);
 writeFileSync(resolve(staged.runtime,'assets',CSS),cssAfterBytes);
 wrangler(staged,true);assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await verifyRailBase(staged);
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const j=await publicFile('/'+JS),c=await publicFile('/'+CSS);if(j.toString('utf8').includes(JS_MARK)&&c.toString('utf8').includes(CSS_MARK)){live=true;break}}catch{}await delay(1000)}assert(live,'MARKET_CHART_PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.result='SUCCESS';save();
  console.log('BALL46_MARKET_CHART_INTERACTIVE_SUCCESS '+JSON.stringify({base,candidate,changed:[JS,CSS],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
