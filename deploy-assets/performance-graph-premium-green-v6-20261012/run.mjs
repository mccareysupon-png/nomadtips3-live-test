import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const CSS='singlepage-workspace-343.css',INDEX='index.html',JS='longterm-performance-343.js';
const JSMARK='B46_UNIT_CHART_SELECTOR_V5_20261012';
const BASECSS='B46_UNIT_CHART_SELECTOR_STYLE_V5_20261012';
const CSSMARK='B46_GRAPH_PREMIUM_GREEN_STYLE_V6_20261012';
const CACHE='graph-premium-green-v6-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics graph styling only. Green glow LINE, unified graph typography/colors/numbers/grid/crosshair/tooltip/navigator. No chart behavior, Engine, API, Data or Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}

const cssAdd = `
/* B46_GRAPH_PREMIUM_GREEN_STYLE_V6_20261012 */
body[data-workspace-view="statistics"] .b46-perf-unit-line{fill:none!important;stroke:#43f58b!important;stroke-width:2.35!important;stroke-linecap:round!important;stroke-linejoin:round!important;vector-effect:non-scaling-stroke!important;filter:drop-shadow(0 0 2px rgba(67,245,139,.98)) drop-shadow(0 0 7px rgba(67,245,139,.52))!important;opacity:1!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-pos{stroke:#3ee58d!important;filter:drop-shadow(0 0 3px rgba(62,229,141,.22))}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neg{stroke:#ff5f70!important;filter:drop-shadow(0 0 3px rgba(255,95,112,.20))}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neutral{stroke:#9fb2c1!important;opacity:.78!important}
body[data-workspace-view="statistics"] .b46-perf-axis-text,
body[data-workspace-view="statistics"] .b46-perf-axis-title,
body[data-workspace-view="statistics"] .b46-perf-unit-axis,
body[data-workspace-view="statistics"] .b46-perf-unit-nav-meta,
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge,
body[data-workspace-view="statistics"] .b46-perf-tip{font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;font-variant-numeric:tabular-nums!important}
body[data-workspace-view="statistics"] .b46-perf-axis-text{font-size:9px!important;font-weight:650!important;letter-spacing:.015em!important}
body[data-workspace-view="statistics"] .b46-perf-axis-title{font-size:8.5px!important;font-weight:700!important;letter-spacing:.045em!important;text-transform:uppercase}
body[data-workspace-view="statistics"] .b46-perf-grid,
body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke-width:.7!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-zero-line{stroke-width:1!important;stroke-dasharray:4 4!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-hover-line{stroke-width:.8!important;stroke-dasharray:3 4!important;vector-effect:non-scaling-stroke!important}
body[data-workspace-view="statistics"] .b46-perf-hover-dot{stroke-width:1.3!important;filter:drop-shadow(0 0 4px rgba(67,245,139,.38))}
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge{font-size:9px!important;font-weight:800!important;letter-spacing:.025em!important;border-radius:5px!important;backdrop-filter:blur(6px)}
body[data-workspace-view="statistics"] .b46-perf-tip{font-size:10px!important;line-height:1.42!important;border-radius:8px!important;backdrop-filter:blur(10px)}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-track{background:rgba(95,124,143,.11)!important;border-color:rgba(108,145,165,.16)!important}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-window{background:rgba(67,245,139,.22)!important;border-color:rgba(67,245,139,.58)!important;box-shadow:0 0 10px rgba(67,245,139,.18),inset 0 0 8px rgba(67,245,139,.08)!important}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-meta{color:#7f98aa!important;opacity:.88!important}
body[data-workspace-view="statistics"] .b46-perf-chart-type button.active{color:#53f69a!important;border-color:rgba(67,245,139,.48)!important;box-shadow:inset 0 0 0 1px rgba(67,245,139,.08),0 0 10px rgba(67,245,139,.10)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-grid,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke:rgba(122,153,173,.11)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-zero-line{stroke:rgba(197,218,231,.32)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-hover-line{stroke:rgba(107,242,188,.50)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#a8bece!important;color:#a8bece!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#d5e3ec!important;color:#d5e3ec!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-ybadge,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-xbadge{color:#dff7ea!important;background:rgba(8,20,27,.90)!important;border:1px solid rgba(67,245,139,.22)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-ybadge.positive{color:#53f69a!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-ybadge.negative{color:#ff7482!important;border-color:rgba(255,95,112,.24)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-tip{color:#dbe8f0!important;background:rgba(7,17,24,.94)!important;border:1px solid rgba(126,158,179,.16)!important;box-shadow:0 12px 30px rgba(0,0,0,.28)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-line{stroke:#12a85b!important;filter:drop-shadow(0 0 2px rgba(18,168,91,.45)) drop-shadow(0 0 5px rgba(18,168,91,.20))!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-candle-pos{stroke:#159f5a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-candle-neg{stroke:#d94c5b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-grid,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke:rgba(52,78,96,.10)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-zero-line{stroke:rgba(42,61,75,.30)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-hover-line{stroke:rgba(18,168,91,.42)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#536c7c!important;color:#536c7c!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#263d4c!important;color:#263d4c!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-ybadge,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-xbadge{color:#24513a!important;background:rgba(247,251,249,.94)!important;border:1px solid rgba(18,168,91,.18)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-ybadge.positive{color:#0c934e!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-ybadge.negative{color:#c73f50!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-tip{color:#2c4555!important;background:rgba(255,255,255,.96)!important;border:1px solid rgba(51,78,95,.12)!important;box-shadow:0 10px 26px rgba(43,64,78,.14)!important}
`;

function patchIndex(src){
  const out=src.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v='+CACHE);
  assert(out.includes('singlepage-workspace-343.css?v='+CACHE),'CSS_CACHE_BUST_MISSING');
  return out;
}

async function runtimeCheck(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
  const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1050});await page.setCacheEnabled(false);
    await page.goto('https://ball46.com/?view=statistics&graphStyleV6='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4000);
    await page.click('[data-b46-chart-type="line"]');await delay(250);
    const line=await page.evaluate(()=>{
      const e=document.querySelector('.b46-perf-unit-line'),axis=document.querySelector('.b46-perf-axis-text'),grid=document.querySelector('.b46-perf-grid'),active=document.querySelector('.b46-perf-chart-type button.active');
      const s=e?getComputedStyle(e):null,a=axis?getComputedStyle(axis):null,g=grid?getComputedStyle(grid):null,b=active?getComputedStyle(active):null;
      return{exists:!!e,stroke:s?.stroke,filter:s?.filter,width:s?.strokeWidth,axisFill:a?.fill,axisFont:a?.fontFamily,gridStroke:g?.stroke,activeColor:b?.color};
    });
    assert(line.exists,'LINE_MISSING');assert(/67, 245, 139|67 245 139|#43f58b/i.test(line.stroke||''),'LINE_NOT_GREEN');assert(line.filter&&line.filter!=='none','LINE_GLOW_MISSING');assert(/IBM Plex Sans/i.test(line.axisFont||''),'GRAPH_FONT_NOT_APPLIED');
    await page.click('[data-b46-chart-type="candles"]');await delay(200);
    const candles=await page.evaluate(()=>{
      const p=document.querySelector('.b46-perf-unit-candle-pos'),n=document.querySelector('.b46-perf-unit-candle-neg'),nav=document.querySelector('.b46-perf-unit-nav-window');
      return{pos:p?getComputedStyle(p).stroke:null,neg:n?getComputedStyle(n).stroke:null,navBg:nav?getComputedStyle(nav).backgroundColor:null,types:[...document.querySelectorAll('[data-b46-chart-type]')].map(x=>x.textContent.trim())};
    });
    assert(candles.pos&&candles.neg,'CANDLE_COLORS_MISSING');assert.deepEqual(candles.types,['LINE','CANDLES'],'CHART_SELECTOR_CHANGED');
    report.runtime={line,candles};save();
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
  assert(js0.includes(JSMARK),'CURRENT_UNIT_SELECTOR_V5_MISSING');assert(css0.includes(BASECSS),'CURRENT_GRAPH_STYLE_BASE_MISSING');assert(!css0.includes(CSSMARK),'STYLE_ALREADY_PATCHED');
  const c1=Buffer.from(css0+'\n'+cssAdd+'\n'),i1=Buffer.from(patchIndex(idx0));
  writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
  const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));
  assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');
  const protectedAssets={...staged.hashes};delete protectedAssets[CSS];delete protectedAssets[INDEX];
  writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
  wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
  wrangler(staged);
  for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const c=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(c.includes(CSSMARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'STYLE_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_GRAPH_PREMIUM_GREEN_STYLE_V6_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
}catch(e){
  report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}report.result='FAIL_STOPPED';save();console.error(e.stack);process.exitCode=1;
}
