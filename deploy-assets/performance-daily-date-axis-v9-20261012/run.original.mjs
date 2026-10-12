import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js',INDEX='index.html';
const BASEMARK='B46_DAILY_OHLC_CHART_V8_20261012';
const MARK='/* B46_DAILY_DATE_AXIS_V9_20261012 */';
const CACHE='daily-date-axis-v9-20261012';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics Daily OHLC date presentation only. X-axis, tooltip, crosshair date badge and navigator use English DD Mon YYYY. No chart data, OHLC calculation, zoom/pan, Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}

function patchJs(src){
 assert(src.includes(BASEMARK),'CURRENT_DAILY_OHLC_V8_MISSING');
 assert(!src.includes(MARK),'DATE_AXIS_V9_ALREADY_PATCHED');
 let out=src;

 const dayAnchor="function bangkokDayKey(ms){";
 const dayIdx=out.indexOf(dayAnchor);
 assert(dayIdx>=0,'BANGKOK_DAY_KEY_MISSING');
 const dayEnd=out.indexOf("\nfunction dailyUnitPoints",dayIdx);
 assert(dayEnd>dayIdx,'DAY_HELPER_BOUNDARY_MISSING');
 const existing=out.slice(dayIdx,dayEnd);
 const helper=existing+"\nfunction formatDayKeyEn(dayKey){"+MARK+" const m=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(dayKey||''));if(!m)return String(dayKey||'—');const mons=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],mi=Number(m[2])-1;return m[3]+' '+(mons[mi]||m[2])+' '+m[1]}";
 out=out.slice(0,dayIdx)+helper+out.slice(dayEnd);

 const axisStart=out.indexOf('function axisSvg(');
 const axisEnd=out.indexOf('\nlet b46UnitView=',axisStart);
 assert(axisStart>=0&&axisEnd>axisStart,'AXIS_BOUNDARY_MISSING');
 const axisFn=`function axisSvg(points,min,max,geo){/* B46_MULTI_YEAR_AXIS_20261012 */
 const yTicks=[];for(let i=0;i<5;i++){const value=max-(max-min)*i/4,y=geo.T+geo.ph*i/4;yTicks.push('<line x1="'+geo.L+'" y1="'+y+'" x2="'+(geo.W-geo.R)+'" y2="'+y+'" class="b46-perf-grid '+(Math.abs(value)<1e-9?'zero':'')+'"></line><text x="'+(geo.L-10)+'" y="'+(y+4)+'" text-anchor="end" class="b46-perf-axis-text">'+esc(valueText(value))+'</text>')}
 const n=points.length,xIdx=[];
 if(metric==='units'){
  const maxTicks=13,stride=Math.max(1,Math.ceil(n/maxTicks));
  for(let i=0;i<n;i++)if(i%stride===0||i===n-1)xIdx.push(i)
 }else{
  const slots=Math.min(5,n);for(let i=0;i<slots;i++){const idx=slots===1?0:Math.round(i*(n-1)/(slots-1));if(!xIdx.includes(idx))xIdx.push(idx)}
 }
 const spanMs=Math.max(0,(points[n-1]?.date||0)-(points[0]?.date||0));
 const axisDate=(p)=>{if(metric==='units'&&p?.dayKey)return formatDayKeyEn(p.dayKey);const ms=p?.date;if(!ms)return'—';try{return new Intl.DateTimeFormat('en-GB',spanMs>330*86400000?{month:'short',year:'2-digit'}:{day:'2-digit',month:'short'}).format(new Date(ms))}catch{return fmtShort(ms)}};
 const xTicks=xIdx.map(idx=>{const p=geo.xy[idx],label=axisDate(points[idx]);return '<line x1="'+p.x+'" y1="'+geo.T+'" x2="'+p.x+'" y2="'+(geo.T+geo.ph)+'" class="b46-perf-vgrid"></line><text x="'+p.x+'" y="'+(geo.H-17)+'" text-anchor="middle" class="b46-perf-axis-text">'+esc(label)+'</text>'}).join('');
 return yTicks.join('')+xTicks+'<text x="'+geo.L+'" y="11" class="b46-perf-axis-title">'+esc(modeLabel())+'</text><text x="'+(geo.W-geo.R)+'" y="'+(geo.H-3)+'" text-anchor="end" class="b46-perf-axis-title">'+(metric==='units'?'Daily settlement timeline':'Settled signal timeline')+'</text>'
}`;
 out=out.slice(0,axisStart)+axisFn+out.slice(axisEnd);

 const navStart=out.indexOf('function unitNavHtml(');
 const navEnd=out.indexOf('\nfunction chartHtml(',navStart);
 assert(navStart>=0&&navEnd>navStart,'NAV_BOUNDARY_MISSING');
 const navFn=`function unitNavHtml(total,start,count,points){
 const left=total?start/total*100:0,width=total?count/total*100:100,end=Math.min(total,start+count),a=formatDayKeyEn(points?.[0]?.dayKey),b=formatDayKeyEn(points?.[points.length-1]?.dayKey);
 return '<div class="b46-perf-unit-nav" data-b46-unit-nav><div class="b46-perf-unit-nav-track" data-b46-unit-nav-track><span class="b46-perf-unit-nav-window" data-b46-unit-nav-window style="left:'+left.toFixed(4)+'%;width:'+Math.max(2,width).toFixed(4)+'%"></span></div><div class="b46-perf-unit-nav-meta"><span>DAYS '+(start+1)+'–'+end+' / '+total+' · '+a+' → '+b+'</span><span>DRAG TO PAN · WHEEL TO ZOOM</span></div></div>'
}`;
 out=out.slice(0,navStart)+navFn+out.slice(navEnd);

 const tipOld="<strong>'+esc(p.dayKey||fmtDate(p.date))+'</strong>";
 assert(out.includes(tipOld),'DAILY_TOOLTIP_DATE_ANCHOR_MISSING');
 out=out.replace(tipOld,"<strong>'+esc(formatDayKeyEn(p.dayKey))+'</strong>");

 const badgeOld="xBadge.textContent=fmtDate(cursorDate);";
 assert(out.includes(badgeOld),'XBAdGE_DATE_ANCHOR_MISSING');
 out=out.replace(badgeOld,"xBadge.textContent=metric==='units'?formatDayKeyEn(currentPoints[idx]?.dayKey):fmtDate(cursorDate);");

 new Function(out);
 return Buffer.from(out)
}
function patchIndex(src){const out=src.replace(/longterm-performance-343\.js\?v=[^"'<>\s]+/g,'longterm-performance-343.js?v='+CACHE);assert(out.includes('longterm-performance-343.js?v='+CACHE),'CACHE_BUST_MISSING');return out}

async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1050});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&dateAxisV9='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4200);
  const before=await page.evaluate(()=>{
   const g=document.querySelector('.b46-perf-unit-stock');
   const ticks=[...document.querySelectorAll('.b46-perf-svg .b46-perf-axis-text')].map(x=>x.textContent.trim()).filter(x=>/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(x));
   const nav=document.querySelector('.b46-perf-unit-nav-meta')?.textContent||'';
   return{aggregation:g?.dataset.b46UnitAggregation,total:Number(g?.dataset.b46UnitTotal||0),count:Number(g?.dataset.b46UnitCount||0),ticks,nav};
  });
  assert.equal(before.aggregation,'1D','DAILY_AGGREGATION_CHANGED');assert(before.total>=1,'NO_DAILY_DATA');assert.equal(before.count,before.total,'INITIAL_FIT_CHANGED');assert(before.ticks.length===Math.min(before.total,13),'DATE_TICK_COUNT_WRONG');assert(before.ticks.every(x=>/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(x)),'DATE_TICK_FORMAT_WRONG');assert(/\d{2} [A-Z][a-z]{2} \d{4} → \d{2} [A-Z][a-z]{2} \d{4}/.test(before.nav),'NAV_DATE_FORMAT_WRONG');
  const box=await page.$eval('.b46-perf-unit-stock',e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width*.5,y:r.top+r.height*.5}});
  await page.mouse.move(box.x,box.y);await delay(120);
  const hover=await page.evaluate(()=>({tip:document.querySelector('[data-b46-perf-tip]')?.innerText||'',xbadge:document.querySelector('[data-b46-perf-xbadge]')?.textContent||''}));
  assert(/\d{2} [A-Z][a-z]{2} \d{4}/.test(hover.tip),'TOOLTIP_DATE_FORMAT_WRONG');assert(/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(hover.xbadge.trim()),'XBAdGE_DATE_FORMAT_WRONG');
  await page.click('[data-b46-range="d7"]');await delay(180);const d7=await page.evaluate(()=>({total:Number(document.querySelector('.b46-perf-unit-stock')?.dataset.b46UnitTotal||0),ticks:[...document.querySelectorAll('.b46-perf-svg .b46-perf-axis-text')].map(x=>x.textContent.trim()).filter(x=>/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(x))}));assert(d7.ticks.length===d7.total,'7D_SHOULD_SHOW_EVERY_DAY');
  await page.click('[data-b46-mode="roi"]');await delay(180);const roi=await page.evaluate(()=>({line:!!document.querySelector('.b46-perf-line'),area:!!document.querySelector('.b46-perf-area')}));assert(roi.line&&roi.area,'ROI_CHANGED');
  report.runtime={before,hover,d7,roi};save();
 }finally{await browser.close()}
}

let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await readRetry('rollback-active',()=>activeVersion());if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await readRetry('rollback-confirm',()=>activeVersion()),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}

try{
 current=await readRetry('inspect',()=>inspect());const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await readRetry('settings-before',()=>api('/scripts/'+script+'/settings')),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await readRetry('schedules-before',()=>schedules());
 const jb=await publicFile('/'+JS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),idx0=ib.toString('utf8');
 assert(js0.includes(BASEMARK),'CURRENT_V8_MISSING');assert(!js0.includes(MARK),'V9_ALREADY_LIVE');
 const j1=patchJs(js0),i1=Buffer.from(patchIndex(idx0));writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',j1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
 const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[INDEX];
 writeFileSync(resolve(staged.runtime,'assets',JS),j1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
 wrangler(staged);for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
 let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(MARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'V9_NOT_LIVE');
 for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
 await runtimeCheck();
 const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
 report.finalVersion=candidate;report.changed=[JS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();console.log('BALL46_DAILY_DATE_AXIS_V9_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
}catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}report.result='FAIL_STOPPED';save();console.error(e.stack);process.exitCode=1}
