import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile } from '../daily-performance-20261005/production.mjs';
import { schedules,stageCurrentRail,verifyRailBase,wrangler } from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js';
const CSS='singlepage-workspace-343.css';
const INDEX='index.html';
const MARK='B46_REMOVE_UNIT_CANDLES_20261012';
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Remove misread UNIT CANDLES/volume-like panel only. Preserve main long-term chart, crosshair, data, engine and settlement.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function patchJs(s){
  assert(s.includes('UNIT CANDLES · SIGNAL RESULT'),'UNIT_CANDLES_TEXT_NOT_FOUND');
  assert(s.includes('function unitBarsSvg'),'UNIT_BARS_FUNCTION_NOT_FOUND');
  const a=s.indexOf('function unitBarsSvg');
  const b=s.indexOf('function chartHtml',a);
  assert(a>=0&&b>a,'UNIT_BARS_BLOCK_RANGE_NOT_FOUND');
  s=s.slice(0,a)+s.slice(b);
  s=s.replace(',bars=unitBarsSvg(points,geo);',';');
  s=s.replace('</svg>${bars}<div class="b46-perf-tip"','</svg><div class="b46-perf-tip"');
  s=s.replace(",unitLine=$('[data-b46-unit-hover-line]')","");
  s=s.replace("if(unitLine)unitLine.hidden=true;","");
  s=s.replace("if(unitLine){unitLine.hidden=false;unitLine.setAttribute('x1',vx);unitLine.setAttribute('x2',vx)}","");
  assert(!s.includes('UNIT CANDLES · SIGNAL RESULT'),'UNIT_CANDLES_TEXT_STILL_PRESENT');
  assert(!s.includes('function unitBarsSvg'),'UNIT_BARS_FUNCTION_STILL_PRESENT');
  assert(!s.includes('data-b46-unit-hover-line'),'UNIT_HOVER_LINE_STILL_PRESENT');
  return s;
}

function patchCss(s){
  const marker='/* B46_UNIT_CANDLES_STYLE_V1_20261012 */';
  const i=s.indexOf(marker);
  if(i>=0)s=s.slice(0,i).trimEnd()+'\n';
  return s+'\n/* '+MARK+' */\n';
}

function patchIndex(s){
  s=s.replace(/longterm-performance-343\.js\?v=[^"'\s<]+/g,'longterm-performance-343.js?v=market-chart-v5-no-unit-bars-20261012');
  s=s.replace(/singlepage-workspace-343\.css\?v=[^"'\s<]+/g,'singlepage-workspace-343.css?v=market-chart-v5-no-unit-bars-20261012');
  assert(s.includes('longterm-performance-343.js?v=market-chart-v5-no-unit-bars-20261012'),'INDEX_JS_VERSION_NOT_PATCHED');
  assert(s.includes('singlepage-workspace-343.css?v=market-chart-v5-no-unit-bars-20261012'),'INDEX_CSS_VERSION_NOT_PATCHED');
  return s;
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(); await page.setViewport({width:1440,height:1000}); await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&removeUnitVerify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});
  await delay(4500);
  const r=await page.evaluate(()=>{
    const root=document.querySelector('.sp-trend.b46-perf-card');
    const wrap=root?.querySelector('[data-b46-chart-wrap]');
    const svg=root?.querySelector('.b46-perf-svg');
    return {
      ok:Boolean(root&&wrap&&svg),
      unitPanelCount:root?.querySelectorAll('.b46-perf-unit-panel').length||0,
      unitSvgCount:root?.querySelectorAll('.b46-perf-unit-svg').length||0,
      unitText:(root?.textContent||'').includes('UNIT CANDLES'),
      mainLine:Boolean(root?.querySelector('.b46-perf-line')),
      mainArea:Boolean(root?.querySelector('.b46-perf-area')),
      hoverV:Boolean(root?.querySelector('[data-b46-hover-line]')),
      hoverH:Boolean(root?.querySelector('[data-b46-hover-hline]')),
      hoverDot:Boolean(root?.querySelector('[data-b46-hover-dot]')),
      nav:wrap?.dataset.b46MarketNav||'',
      ranges:[...root.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim()),
      modes:[...root.querySelectorAll('[data-b46-mode]')].map(x=>x.textContent.trim()),
      scriptSrc:[...document.scripts].map(s=>s.src).find(x=>x.includes('longterm-performance-343.js'))||'',
      cssHref:[...document.querySelectorAll('link[rel="stylesheet"]')].map(x=>x.href).find(x=>x.includes('singlepage-workspace-343.css'))||''
    };
  });
  report.runtime=r; save();
  assert(r.ok,'MAIN_PERFORMANCE_CHART_MISSING');
  assert.equal(r.unitPanelCount,0,'UNIT_PANEL_STILL_VISIBLE');
  assert.equal(r.unitSvgCount,0,'UNIT_SVG_STILL_VISIBLE');
  assert.equal(r.unitText,false,'UNIT_CANDLES_TEXT_STILL_VISIBLE');
  assert(r.mainLine&&r.mainArea,'MAIN_CHART_GEOMETRY_MISSING');
  assert(r.hoverV&&r.hoverH&&r.hoverDot,'MAIN_CROSSHAIR_MISSING');
  assert.deepEqual(r.ranges,['7D','30D','90D','ALL'],'RANGE_CONTROLS_CHANGED');
  assert.deepEqual(r.modes,['UNITS','ROI','WIN RATE'],'METRIC_CONTROLS_CHANGED');
  assert(r.scriptSrc.includes('market-chart-v5-no-unit-bars-20261012'),'OLD_JS_URL_STILL_ACTIVE');
  assert(r.cssHref.includes('market-chart-v5-no-unit-bars-20261012'),'OLD_CSS_URL_STILL_ACTIVE');
 } finally { await browser.close(); }
}

let current=null,candidate=null;
async function rollback(){
 if(!current)return;
 const a=await activeVersion();
 if(a===current.restore.version)return;
 if(candidate&&a!==candidate)return;
 await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});
 assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}

try{
 current=await inspect(); const base=current.restore.version; report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await api('/scripts/'+script+'/settings'),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await schedules();

 const beforeJs=await publicFile('/'+JS), beforeCss=await publicFile('/'+CSS), beforeIndex=await publicFile('/'+INDEX);
 const afterJs=Buffer.from(patchJs(beforeJs.toString('utf8')));
 const afterCss=Buffer.from(patchCss(beforeCss.toString('utf8')));
 const afterIndex=Buffer.from(patchIndex(beforeIndex.toString('utf8')));
 writeFileSync('audit/js-before.js',beforeJs);writeFileSync('audit/js-after.js',afterJs);
 writeFileSync('audit/css-before.css',beforeCss);writeFileSync('audit/css-after.css',afterCss);
 writeFileSync('audit/index-before.html',beforeIndex);writeFileSync('audit/index-after.html',afterIndex);

 const staged=await stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source); await verifyRailBase(staged);
 assert.equal(staged.hashes[JS],sha(beforeJs),'STAGED_JS_NOT_CURRENT');
 assert.equal(staged.hashes[CSS],sha(beforeCss),'STAGED_CSS_NOT_CURRENT');
 assert.equal(staged.hashes[INDEX],sha(beforeIndex),'STAGED_INDEX_NOT_CURRENT');

 const protectedAssets={...staged.hashes}; delete protectedAssets[JS];delete protectedAssets[CSS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),afterJs);
 writeFileSync(resolve(staged.runtime,'assets',CSS),afterCss);
 writeFileSync(resolve(staged.runtime,'assets',INDEX),afterIndex);

 wrangler(staged,true); assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN'); await verifyRailBase(staged);
 try{
  wrangler(staged);
  for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
  assert(candidate,'NO_NEW_VERSION');
  for(const [p,b] of [[JS,afterJs],[CSS,afterCss],[INDEX,afterIndex]]){
    let ok=false;
    for(let i=0;i<40;i++){assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{if(sha(await publicFile('/'+p))===sha(b)){ok=true;break}}catch{}await delay(1000)}
    assert(ok,'PATCH_NOT_LIVE:'+p);
  }
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
  await runtimeCheck();
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.result='SUCCESS';save();
  console.log('BALL46_REMOVE_UNIT_CANDLES_SUCCESS '+JSON.stringify({base,candidate,changed:[JS,CSS,INDEX],unchangedAssets:Object.keys(protectedAssets).length,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
