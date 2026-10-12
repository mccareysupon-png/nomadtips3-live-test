import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js',CSS='singlepage-workspace-343.css',INDEX='index.html';
const BASEMARK='B46_UNIT_CHART_SELECTOR_V5_20261012';
const STYLEMARK='B46_GRAPH_THIN_GREEN_UNDERGLOW_V7_20261012';
const JSMARK='/* B46_DAILY_OHLC_CHART_V8_20261012 */';
const CSSMARK='/* B46_DAILY_OHLC_CHART_STYLE_V8_20261012 */';
const CACHE='daily-ohlc-chart-v8-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics UNITS renderer only. Aggregate existing priced SETTLED results into Bangkok calendar-day OHLC candles. LINE uses daily Close. Range buttons remain time filters; initial viewport fits all days in selected range; mouse wheel zooms days and drag pans. ROI/WIN RATE unchanged. No Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}

function patchJs(src){
 assert(src.includes(BASEMARK),'CURRENT_UNIT_SELECTOR_V5_MISSING');
 assert(!src.includes(JSMARK),'DAILY_OHLC_ALREADY_PATCHED');
 let out=src;

 const viewStart=out.indexOf('let b46UnitView={start:null,count:null,total:0};');
 const chartStart=out.indexOf('function chartHtml(s){',viewStart);
 assert(viewStart>=0&&chartStart>viewStart,'UNIT_HELPER_BOUNDARY_MISSING');
 const helpers=`let b46UnitView={start:null,count:null,total:0};let currentPointOffset=0,currentPointTotal=0;/* B46_UNIT_STOCK_CHART_V3_20261012 */
function bangkokDayKey(ms){
 try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms))}
 catch{return new Date(ms).toISOString().slice(0,10)}
}
function dailyUnitPoints(points){/* B46_DAILY_OHLC_CHART_V8_20261012 */
 const out=[];let d=null;
 for(const p of points){
  const close=Number(p.value),profit=Number.isFinite(p.profit)?Number(p.profit):0,open=close-profit,key=bangkokDayKey(p.date);
  if(!d||d.dayKey!==key){
   if(d)out.push(d);
   d={dayKey:key,date:p.date,open,high:Math.max(open,close),low:Math.min(open,close),close,value:close,profit:close-open,count:1,firstDate:p.date,lastDate:p.date}
  }else{
   d.high=Math.max(d.high,close);d.low=Math.min(d.low,close);d.close=close;d.value=close;d.profit=d.close-d.open;d.count++;d.lastDate=p.date
  }
 }
 if(d)out.push(d);
 return out
}
function unitViewFor(all){
 const total=all.length,minCount=Math.min(3,total),def=total;
 if(b46UnitView.total!==total||!Number.isFinite(b46UnitView.count)){b46UnitView={start:0,count:def,total}}
 b46UnitView.total=total;b46UnitView.count=Math.max(minCount,Math.min(total,Math.round(b46UnitView.count||def)));
 b46UnitView.start=Math.max(0,Math.min(total-b46UnitView.count,Math.round(Number.isFinite(b46UnitView.start)?b46UnitView.start:0)));
 return b46UnitView
}
function unitScale(points){
 const vals=[];for(const p of points){if(Number.isFinite(p.low))vals.push(p.low);if(Number.isFinite(p.high))vals.push(p.high);if(Number.isFinite(p.open))vals.push(p.open);if(Number.isFinite(p.close))vals.push(p.close)}
 if(!vals.length)return{min:-1,max:1};let min=Math.min(...vals),max=Math.max(...vals);if(min===max){min-=1;max+=1}const raw=max-min,pad=Math.max(.35,raw*.12);return{min:min-pad,max:max+pad}
}
function unitCandlesSvg(points,geo,scale){
 const n=points.length,step=n>1?geo.pw/(n-1):geo.pw,bw=Math.max(2.2,Math.min(12,step*.48));
 let posBody='',negBody='',neutralBody='',posWick='',negWick='',neutralWick='',pos=0,neg=0,neutral=0;
 const span=Math.max(.0001,scale.max-scale.min),y=v=>geo.T+(scale.max-v)/span*geo.ph;
 for(let i=0;i<n;i++){
  const p=points[i],open=Number(p.open),close=Number(p.close),high=Number(p.high),low=Number(p.low);
  const x=geo.L+(n===1?geo.pw/2:i/(n-1)*geo.pw),yo=y(open),yc=y(close),yh=y(high),yl=y(low),wick='M'+x.toFixed(3)+' '+yh.toFixed(3)+'V'+yl.toFixed(3);
  if(close>open){posWick+=wick;posBody+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);pos++}
  else if(close<open){negWick+=wick;negBody+='M'+x.toFixed(3)+' '+yo.toFixed(3)+'V'+yc.toFixed(3);neg++}
  else{neutralWick+=wick;const h=Math.max(1.2,bw*.5);neutralBody+='M'+(x-h).toFixed(3)+' '+yc.toFixed(3)+'H'+(x+h).toFixed(3);neutral++}
 }
 return '<g class="b46-perf-unit-candles" data-b46-candle-mode="daily-ohlc" data-b46-candle-count="'+n+'" data-b46-candle-pos="'+pos+'" data-b46-candle-neg="'+neg+'" data-b46-candle-neutral="'+neutral+'"><path class="b46-perf-unit-wick b46-perf-unit-wick-pos" d="'+posWick+'"></path><path class="b46-perf-unit-wick b46-perf-unit-wick-neg" d="'+negWick+'"></path><path class="b46-perf-unit-wick b46-perf-unit-wick-neutral" d="'+neutralWick+'"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-pos" d="'+posBody+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-neg" d="'+negBody+'" style="stroke-width:'+bw.toFixed(3)+'px"></path><path class="b46-perf-unit-candle b46-perf-unit-candle-neutral" d="'+neutralBody+'" style="stroke-width:'+Math.max(1.5,bw*.72).toFixed(3)+'px"></path></g>'
}
function unitNavHtml(total,start,count,points){
 const left=total?start/total*100:0,width=total?count/total*100:100,end=Math.min(total,start+count),a=points?.[0]?.dayKey||'—',b=points?.[points.length-1]?.dayKey||a;
 return '<div class="b46-perf-unit-nav" data-b46-unit-nav><div class="b46-perf-unit-nav-track" data-b46-unit-nav-track><span class="b46-perf-unit-nav-window" data-b46-unit-nav-window style="left:'+left.toFixed(4)+'%;width:'+Math.max(2,width).toFixed(4)+'%"></span></div><div class="b46-perf-unit-nav-meta"><span>DAYS '+(start+1)+'–'+end+' / '+total+' · '+a+' → '+b+'</span><span>DRAG TO PAN · WHEEL TO ZOOM</span></div></div>'
}
`;
 out=out.slice(0,viewStart)+helpers+out.slice(chartStart);

 const chart0=out.indexOf('function chartHtml(s){');
 const ensure=out.indexOf('function ensureCard(){',chart0);
 assert(chart0>=0&&ensure>chart0,'CHART_FUNCTION_BOUNDARY_MISSING');
 const oldChart=out.slice(chart0,ensure);
 const nonUnit=oldChart.indexOf('}currentPoints=all;currentPointOffset=0;currentPointTotal=all.length;');
 assert(nonUnit>0,'NON_UNIT_BRANCH_MISSING');
 const rest=oldChart.slice(nonUnit+1);
 const chart=`function chartHtml(s){const raw=getPoints(s);if(!raw.length){currentPoints=[];currentPointOffset=0;currentPointTotal=0;return'<div class="b46-perf-empty">No priced settled signals in this range.</div>'}if(metric==='units'){const all=dailyUnitPoints(raw),v=unitViewFor(all),points=all.slice(v.start,v.start+v.count);currentPoints=points;currentPointOffset=v.start;currentPointTotal=all.length;const scale=unitScale(points),geo=pathData(points,scale.min,scale.max),axes=axisSvg(points,scale.min,scale.max,geo),zero=scale.min<=0&&scale.max>=0?'<line class="b46-perf-zero-line" x1="'+geo.L+'" y1="'+geo.baseY+'" x2="'+(geo.W-geo.R)+'" y2="'+geo.baseY+'"></line>':'',plot=unitChartType==='line'?'<path class="b46-perf-unit-line" d="'+geo.line+'"></path>':unitCandlesSvg(points,geo,scale);return '<svg class="b46-perf-svg b46-perf-unit-stock" data-b46-unit-stock="1" data-b46-unit-aggregation="1D" data-b46-unit-chart-type="'+unitChartType+'" data-b46-unit-scale="visible-daily-ohlc" data-b46-unit-total="'+all.length+'" data-b46-unit-start="'+v.start+'" data-b46-unit-count="'+v.count+'" data-b46-unit-ymin="'+scale.min+'" data-b46-unit-ymax="'+scale.max+'" viewBox="0 0 1000 250" preserveAspectRatio="none" aria-label="Net Units daily '+unitChartType+' chart">'+axes+zero+plot+'<line data-b46-hover-line class="b46-perf-hover-line" x1="0" y1="'+geo.T+'" x2="0" y2="'+(geo.T+geo.ph)+'" hidden></line><line data-b46-hover-hline class="b46-perf-hover-line b46-perf-hover-hline" x1="'+geo.L+'" y1="0" x2="'+(geo.W-geo.R)+'" y2="0" hidden></line><circle data-b46-hover-dot class="b46-perf-hover-dot" cx="0" cy="0" r="3" hidden></circle></svg><div class="b46-perf-tip" data-b46-perf-tip hidden></div><div class="b46-perf-ybadge" data-b46-perf-ybadge hidden></div><div class="b46-perf-xbadge" data-b46-perf-xbadge hidden></div>'+unitNavHtml(all.length,v.start,v.count,points)}${rest}`;
 out=out.slice(0,chart0)+chart+out.slice(ensure);

 const axisOld='<text x="${geo.W-geo.R}" y="${geo.H-3}" text-anchor="end" class="b46-perf-axis-title">Settled signal timeline</text>';
 if(out.includes(axisOld))out=out.replace(axisOld,'<text x="${geo.W-geo.R}" y="${geo.H-3}" text-anchor="end" class="b46-perf-axis-title">${metric===\'units\'?\'Daily settlement timeline\':\'Settled signal timeline\'}</text>');

 const noteOld='Y: ${esc(modeLabel())} · X: settled signal timeline · 1 signal = 1.00U';
 assert(out.includes(noteOld),'AXIS_NOTE_ANCHOR_MISSING');
 out=out.replace(noteOld,'Y: ${esc(modeLabel())} · X: ${metric===\'units\'?\'calendar day · 1 candle = 1 day\':\'settled signal timeline · 1 signal = 1.00U\'}');

 const tipStart=out.indexOf('function tipMarkup('),bindStart=out.indexOf('function bindChart(){',tipStart);
 assert(tipStart>=0&&bindStart>tipStart,'TIP_BOUNDARY_MISSING');
 const tip=`function tipMarkup(p,idx,total){if(metric==='units'&&Number.isFinite(p?.open)){const d=p.close-p.open;return '<div class="b46-perf-tip-head"><span>DAY #'+(currentPointOffset+idx+1)+' / '+(currentPointTotal||total)+'</span><strong>'+esc(p.dayKey||fmtDate(p.date))+'</strong></div><div class="row"><span>Open</span><strong>'+valueText(p.open)+'</strong></div><div class="row"><span>High</span><strong>'+valueText(p.high)+'</strong></div><div class="row"><span>Low</span><strong>'+valueText(p.low)+'</strong></div><div class="row"><span>Close</span><strong class="'+(p.close>=0?'positive':'negative')+'">'+valueText(p.close)+'</strong></div><div class="row"><span>Day P/L</span><strong class="'+(d>0?'positive':d<0?'negative':'')+'">'+(d>=0?'+':'')+d.toFixed(2)+'U</strong></div><div class="row"><span>Settled signals</span><strong>'+p.count+'</strong></div>'}const r=p.row,home=r?.home?.name||'—',away=r?.away?.name||'—',pick=String(r?.selection||r?.pick||'—'),market=String(r?.marketLabel||r?.market||r?.providerMarket||marketKey(r)||'—'),odds=num(r?.odds),profit=p.profit;return\`<div class="b46-perf-tip-head"><span>SIGNAL #\${currentPointOffset+idx+1} / \${currentPointTotal||total}</span><strong>\${esc(fmtDate(p.date))}</strong></div><b>\${esc(home)} — \${esc(away)}</b><div class="row"><span>Market</span><strong>\${esc(market)}</strong></div><div class="row"><span>Pick</span><strong>\${esc(pick)}</strong></div><div class="row"><span>Odds</span><strong>\${odds&&odds>1?odds.toFixed(2):'—'}</strong></div><div class="row"><span>Result</span><strong>\${esc(outcome(r)||'—')}</strong></div><div class="row"><span>This signal</span><strong class="\${profit>0?'positive':profit<0?'negative':''}">\${Number.isFinite(profit)?\`\${profit>=0?'+':''}\${profit.toFixed(2)}U\`:'—'}</strong></div><div class="row metric"><span>\${esc(modeLabel())}</span><strong class="\${p.value>=0?'positive':'negative'}">\${esc(valueText(p.value))}</strong></div>\`}`;
 out=out.slice(0,tipStart)+tip+out.slice(bindStart);

 out=out.replace("const clampStart=n=>Math.max(0,Math.min(b46UnitView.total-b46UnitView.count,Math.round(n)));","const clampStart=n=>Math.max(0,Math.min(b46UnitView.total-b46UnitView.count,Math.round(n)));");
 const wheelOld="oldCount=b46UnitView.count,minCount=Math.min(20,b46UnitView.total),next=Math.max(minCount,Math.min(b46UnitView.total,Math.round(oldCount*(e.deltaY<0?.82:1.22))))";
 assert(out.includes(wheelOld),'WHEEL_MIN_ANCHOR_MISSING');
 out=out.replace(wheelOld,"oldCount=b46UnitView.count,minCount=Math.min(3,b46UnitView.total),next=Math.max(minCount,Math.min(b46UnitView.total,Math.round(oldCount*(e.deltaY<0?.82:1.22))))");

 new Function(out);
 return Buffer.from(out)
}

const cssAdd=`
/* B46_DAILY_OHLC_CHART_STYLE_V8_20261012 */
body[data-workspace-view="statistics"] .b46-perf-unit-wick{fill:none!important;stroke-width:.8px!important;vector-effect:non-scaling-stroke!important;stroke-linecap:round!important;opacity:.72!important}
body[data-workspace-view="statistics"] .b46-perf-unit-wick-pos{stroke:#3ee58d!important}
body[data-workspace-view="statistics"] .b46-perf-unit-wick-neg{stroke:#ff5f70!important}
body[data-workspace-view="statistics"] .b46-perf-unit-wick-neutral{stroke:#9fb2c1!important}
`;

function patchIndex(src){
 let out=src;
 out=out.replace(/longterm-performance-343\.js\?v=[^"'<>\s]+/g,'longterm-performance-343.js?v='+CACHE);
 out=out.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v='+CACHE);
 assert(out.includes('longterm-performance-343.js?v='+CACHE),'LONGTERM_CACHE_BUST_MISSING');
 return out
}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1050});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&dailyOhlcV8='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const before=await page.evaluate(()=>{const g=document.querySelector('.b46-perf-unit-stock'),c=document.querySelector('.b46-perf-unit-candles');return{aggregation:g?.dataset.b46UnitAggregation,type:g?.dataset.b46UnitChartType,total:Number(g?.dataset.b46UnitTotal||0),count:Number(g?.dataset.b46UnitCount||0),start:Number(g?.dataset.b46UnitStart||0),mode:c?.dataset.b46CandleMode,candles:Number(c?.dataset.b46CandleCount||0),wicks:document.querySelectorAll('.b46-perf-unit-wick').length,note:document.querySelector('.b46-perf-axis-note')?.textContent||'',nav:document.querySelector('[data-b46-unit-nav-meta]')?.textContent||document.querySelector('.b46-perf-unit-nav-meta')?.textContent||''}});
  assert.equal(before.aggregation,'1D','DAILY_AGGREGATION_MISSING');assert.equal(before.type,'candles','DEFAULT_CANDLES_CHANGED');assert.equal(before.mode,'daily-ohlc','DAILY_OHLC_MODE_MISSING');assert(before.total>=1&&before.total<=31,'UNEXPECTED_DAILY_COUNT_ALL');assert.equal(before.count,before.total,'INITIAL_VIEW_MUST_FIT_ALL_DAYS');assert.equal(before.candles,before.total,'ONE_DAY_ONE_CANDLE_MISMATCH');assert(before.wicks===3,'WICK_PATHS_MISSING');assert(/calendar day/i.test(before.note),'DAILY_AXIS_NOTE_MISSING');
  const box=await page.$eval('.b46-perf-unit-stock',e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width*.55,y:r.top+r.height*.5}});
  if(before.total>3){await page.mouse.move(box.x,box.y);await page.mouse.wheel({deltaY:-480});await delay(300)}
  const zoomed=await page.$eval('.b46-perf-unit-stock',e=>({count:Number(e.dataset.b46UnitCount),start:Number(e.dataset.b46UnitStart)}));
  if(before.total>3)assert(zoomed.count<before.count,'WHEEL_DAILY_ZOOM_FAILED');
  await page.click('[data-b46-range="d7"]');await delay(250);const d7=await page.$eval('.b46-perf-unit-stock',e=>({total:Number(e.dataset.b46UnitTotal),count:Number(e.dataset.b46UnitCount)}));assert.equal(d7.count,d7.total,'7D_NOT_FIT_TO_RANGE');assert(d7.total<=8,'7D_DAILY_COUNT_TOO_LARGE');
  await page.click('[data-b46-range="d90"]');await delay(250);const d90=await page.$eval('.b46-perf-unit-stock',e=>({total:Number(e.dataset.b46UnitTotal),count:Number(e.dataset.b46UnitCount)}));assert.equal(d90.count,d90.total,'90D_NOT_FIT_TO_RANGE');
  await page.click('[data-b46-chart-type="line"]');await delay(200);const line=await page.evaluate(()=>({line:!!document.querySelector('.b46-perf-unit-line'),candles:!!document.querySelector('.b46-perf-unit-candles'),agg:document.querySelector('.b46-perf-unit-stock')?.dataset.b46UnitAggregation}));assert(line.line&&!line.candles&&line.agg==='1D','DAILY_LINE_RENDERER_FAILED');
  await page.click('[data-b46-chart-type="candles"]');await delay(180);await page.mouse.move(box.x,box.y);const tip=await page.evaluate(()=>{const t=document.querySelector('[data-b46-perf-tip]');return t?.innerText||''});assert(/Open|High|Low|Close|Day P\/L|Settled signals/.test(tip),'DAILY_TOOLTIP_MISSING_OHLC');
  await page.click('[data-b46-mode="roi"]');await delay(200);const roi=await page.evaluate(()=>({line:!!document.querySelector('.b46-perf-line'),area:!!document.querySelector('.b46-perf-area'),stock:!!document.querySelector('.b46-perf-unit-stock')}));assert(roi.line&&roi.area&&!roi.stock,'ROI_RENDERER_CHANGED');
  report.runtime={before,zoomed,d7,d90,line,roi};save();
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await readRetry('rollback-active',()=>activeVersion());if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await readRetry('rollback-confirm',()=>activeVersion()),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}

try{
 current=await readRetry('inspect',()=>inspect());const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await readRetry('settings-before',()=>api('/scripts/'+script+'/settings')),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await readRetry('schedules-before',()=>schedules());
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes(BASEMARK),'CURRENT_V5_RENDERER_MISSING');assert(css0.includes(STYLEMARK),'CURRENT_V7_STYLE_MISSING');assert(!js0.includes(JSMARK),'V8_ALREADY_LIVE');assert(!css0.includes(CSSMARK),'V8_STYLE_ALREADY_LIVE');
 const j1=patchJs(js0),c1=Buffer.from(css0+'\n'+cssAdd+'\n'),i1=Buffer.from(patchIndex(idx0));
 writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',j1);writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
 const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),j1);writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
 wrangler(staged);for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
 let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),b=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(JSMARK)&&b.includes(CSSMARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'V8_NOT_LIVE');
 for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
 await runtimeCheck();
 const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
 report.finalVersion=candidate;report.changed=[JS,CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();console.log('BALL46_DAILY_OHLC_CHART_V8_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
}catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}report.result='FAIL_STOPPED';save();console.error(e.stack);process.exitCode=1}
