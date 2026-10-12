import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js',CSS='singlepage-workspace-343.css',INDEX='index.html';
const JSMARK='/* B46_CUMULATIVE_UNIT_CANDLES_V2_20261012 */';
const CSSMARK='/* B46_CUMULATIVE_UNIT_CANDLES_STYLE_V2_20261012 */';
const CACHE='cumulative-unit-candles-v2-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics chart visualization only. Candles appear only in UNITS metric on the existing cumulative chart. Open=prior cumulative Unit; Close=new cumulative Unit; body height=actual P/L Unit; one settled priced result=one candle. No Volume; no fake wick/high/low; no Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

function exampleCheck(){
 const profits=[.17,-.80,1.80,2.80],expected=[[0,.17],[.17,-.63],[-.63,1.17],[1.17,3.97]];let net=0;
 const actual=profits.map(p=>{const open=net;net=Number((net+p).toFixed(10));return[Number(open.toFixed(2)),Number(net.toFixed(2))]});
 assert.deepEqual(actual,expected,'UNIT_EXAMPLE_MISMATCH');report.example={profits,actual,final:net};
}
exampleCheck();

function patchJs(src){
 assert(src.includes('function chartHtml(s){/* B46_PERFORMANCE_MARKET_CHART_V3_20261012 */'),'CURRENT_CHART_V3_MISSING');
 assert(!src.includes(JSMARK),'JS_ALREADY_PATCHED');
 const anchor='function chartHtml(s){/* B46_PERFORMANCE_MARKET_CHART_V3_20261012 */';
 const helper=`function unitCandlesSvg(points,geo){/* B46_CUMULATIVE_UNIT_CANDLES_V2_20261012 */
 const n=points.length,step=n>1?geo.pw/(n-1):geo.pw,bw=Math.max(.18,Math.min(4.2,step*.70));
 let posD='',negD='',neutralD='',pos=0,neg=0,neutral=0;
 const scale=yScale(points),span=Math.max(.0001,scale.max-scale.min),y=v=>geo.T+(scale.max-v)/span*geo.ph;
 for(let i=0;i<n;i++){
  const p=points[i],close=Number(p.value),profit=Number.isFinite(p.profit)?p.profit:0,open=close-profit;
  const x=geo.L+(n===1?geo.pw/2:i/(n-1)*geo.pw),yo=y(open),yc=y(close);
  if(close>open){posD+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);pos++}
  else if(close<open){negD+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);neg++}
  else{const h=Math.max(.16,bw*.45);neutralD+='M'+(x-h).toFixed(3)+' '+yc.toFixed(3)+'H'+(x+h).toFixed(3);neutral++}
 }
 return '<g class="b46-perf-unit-candles" data-b46-candle-mode="cumulative-open-close" data-b46-candle-count="'+n+'" data-b46-candle-pos="'+pos+'" data-b46-candle-neg="'+neg+'" data-b46-candle-neutral="'+neutral+'"><path class="b46-perf-unit-candle b46-perf-unit-candle-pos" d="'+posD+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-neg" d="'+negD+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-neutral" d="'+neutralD+'" style="stroke-width:'+Math.max(.55,bw).toFixed(3)+'px"></path></g>'
}
`;
 let out=src.replace(anchor,helper+anchor);
 const target='<path class="b46-perf-area" d="${geo.area}"></path><path class="b46-perf-line" d="${geo.line}"></path>';
 const repl='<path class="b46-perf-area" d="${geo.area}"></path>${metric===\'units\'?unitCandlesSvg(points,geo):\'\'}<path class="b46-perf-line" d="${geo.line}"></path>';
 assert(out.includes(target),'CHART_LAYER_ANCHOR_MISSING');out=out.replace(target,repl);
 const block=out.slice(out.indexOf(JSMARK)-80,out.indexOf(JSMARK)+5000);
 assert(!/VOLUME/i.test(block),'VOLUME_TEXT_FORBIDDEN');
 assert(!/\b(wick|high|low)\b/i.test(block),'FAKE_WICK_HIGH_LOW_FORBIDDEN');
 return out;
}

const cssAdd=`
/* B46_CUMULATIVE_UNIT_CANDLES_STYLE_V2_20261012 */
body[data-workspace-view="statistics"] .b46-perf-unit-candles{pointer-events:none}
body[data-workspace-view="statistics"] .b46-perf-unit-candle{fill:none!important;stroke-linecap:butt!important;stroke-linejoin:miter!important;vector-effect:non-scaling-stroke!important;opacity:.88!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-pos{stroke:#27c77a!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neg{stroke:#e55364!important}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neutral{stroke:#8a9baa!important;opacity:.72!important}
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
  await page.goto('https://ball46.com/?view=statistics&unitCandleV2Verify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const units=await page.evaluate(()=>{const q=s=>document.querySelector(s),g=q('.b46-perf-unit-candles');return{
   mode:g?.dataset.b46CandleMode,count:Number(g?.dataset.b46CandleCount||0),pos:Number(g?.dataset.b46CandlePos||0),neg:Number(g?.dataset.b46CandleNeg||0),neutral:Number(g?.dataset.b46CandleNeutral||0),
   posD:(q('.b46-perf-unit-candle-pos')?.getAttribute('d')||'').length,negD:(q('.b46-perf-unit-candle-neg')?.getAttribute('d')||'').length,
   line:Boolean(q('.b46-perf-line')),area:Boolean(q('.b46-perf-area')),ranges:[...document.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim())
  }});
  assert(units.count>100,'CANDLE_COUNT_TOO_SMALL');assert.equal(units.mode,'cumulative-open-close','CANDLE_MODE_WRONG');
  assert.equal(units.count,units.pos+units.neg+units.neutral,'ONE_RESULT_ONE_CANDLE_COUNT_MISMATCH');assert(units.pos>0&&units.neg>0,'GREEN_RED_CANDLES_MISSING');
  assert(units.posD>100&&units.negD>100,'CANDLE_PATHS_TOO_SMALL');assert(units.line&&units.area,'EXISTING_CUMULATIVE_CHART_CHANGED');assert.deepEqual(units.ranges,['7D','30D','90D','ALL'],'RANGES_CHANGED');
  await page.click('[data-b46-mode="roi"]');await delay(200);
  const roiHasCandles=await page.evaluate(()=>Boolean(document.querySelector('.b46-perf-unit-candles')));
  assert.equal(roiHasCandles,false,'CANDLES_MUST_ONLY_RENDER_FOR_UNITS');
  await page.click('[data-b46-mode="units"]');await delay(200);
  const unitsRestored=await page.evaluate(()=>Boolean(document.querySelector('.b46-perf-unit-candles')));
  assert.equal(unitsRestored,true,'UNIT_CANDLES_NOT_RESTORED');
  report.runtime={units,roiHasCandles,unitsRestored};save();
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
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes('B46_PERFORMANCE_MARKET_CHART_V3_20261012'),'CURRENT_RENDERER_BASE_CHANGED');assert(!js0.includes(JSMARK),'JS_ALREADY_PATCHED');assert(!css0.includes(CSSMARK),'CSS_ALREADY_PATCHED');
 const j1=Buffer.from(patchJs(js0)),c1=Buffer.from(css0+'\n'+cssAdd+'\n'),i1=Buffer.from(patchIndex(idx0));
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
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');
  assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[JS,CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();
  console.log('BALL46_CUMULATIVE_UNIT_CANDLES_V2_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,example:report.example,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
