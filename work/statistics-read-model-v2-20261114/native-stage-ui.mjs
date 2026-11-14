import assert from 'node:assert/strict';
import {patchHomepageStatistics,patchScorebarStatistics} from './homepage-statistics-adapter.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const browserRuntime=await readFile(new URL('./fast-browser-runtime.js',import.meta.url),'utf8');
const DIR='work/statistics-summary-shadow-20261113/qa/ui-capture',OUT='work/statistics-read-model-v2-20261114/qa';
const sha=b=>createHash('sha256').update(b).digest('hex');
function once(source,before,after,label){assert.equal(source.split(before).length,2,'CURRENT_UI_DRIFT:'+label);return source.replace(before,()=>after)}
function region(source,start,end,after,label){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 const next=source.indexOf(start,a+start.length);assert(a>=0&&b>a&&(next<0||next>=b),'CURRENT_UI_REGION_DRIFT:'+label);
 return source.slice(0,a)+after+'\n'+source.slice(b);
}
export function patchActualStatistics(workspace){
 let w=workspace;
 w=region(w,'function marketCounts(){','function currentMarket(){',[
"function marketCounts(){",
" const out=Object.fromEntries(MARKETS.map(m=>[m.id,0]));return stageSummary?.marketCounts?{...out,...stageSummary.marketCounts}:out;",
"}",
"function filters(){",
" if(state.market==='all')return [{id:'all',label:'All results'}];",
" const label={home:'Home',draw:'Draw',away:'Away',over:'Over',under:'Under',yes:'Yes',no:'No'};",
" const entries=Object.entries(stageSummary?.groupCounts||{}).map(([name,count])=>{try{const [m,v,f]=JSON.parse(name);return{m,v,f,count}}catch{return null}}).filter(Boolean);",
" const order=['all','home','draw','away','over','under','yes','no'];",
" const selected=entries.filter(x=>x.m===state.market&&x.v===state.variant&&x.count>0);",
" const out=[{id:'all',label:'All',count:selected.find(x=>x.f==='all')?.count||0}];",
" for(const r of selected)if(r.f!=='all')out.push({id:r.f,label:label[r.f]||r.f.toUpperCase(),count:r.count});",
" return out.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));",
"}"
].join('\n'),'Complete ledger market and selection counts');
 w=once(w,'function stopStatistics(){}',"function stopStatistics(){stageTicket++;state.statsLoading=false;document.body.dataset.b46StageReady='0'}",'Cancel previous stage request');
 w=region(w,'function startStatistics(){','function setView(',"function startStatistics(){stageRefresh()}",'Use stage data instead of full history');
 w=once(w,"if(view==='statistics'){startStatistics();if(state.statsLoaded)renderStats()}else stopStatistics();","if(view==='statistics'){startStatistics()}else stopStatistics();",'Avoid redundant refresh');
 w=region(w,'function renderKpis(rows){','function renderVariants(){',[
"function renderKpis(){",
" const m=stageView?.metrics;if(!m)return;",
" const vals={total:m.settledTotal,unsettled:m.pending+m.unresolved,'settled-days':stageSummary.settledDays,win:m.win+m.halfWin,loss:m.loss+m.halfLoss,push:m.push,rate:m.winRate==null?'—':m.winRate.toFixed(1)+'%',odds:m.avgOdds==null?'—':m.avgOdds.toFixed(2)};",
" const titles={win:'WIN + HALF_WIN',loss:'LOSS + HALF_LOSS',rate:'(WIN + 0.5 × HALF_WIN) ÷ (WIN + LOSS + HALF_WIN + HALF_LOSS)'};",
" for(const [k,v] of Object.entries(vals)){const el=$('[data-sp-kpi=\"'+k+'\"]');if(el){el.textContent=v;if(titles[k])el.title=titles[k]}}",
"}",
"function renderGraph(){",
" const path=$('[data-sp-spark-line]'),note=$('[data-sp-range]');if(!path)return;",
" const curve=stageView?.curve||[],last=stageView?.metrics?.settledTotal||0;",
" if(note)note.textContent=last?'Last '+last+' settled signals':'No settled signals';",
" if(!curve.length){path.setAttribute('d','M0 60 L1000 60');return}",
" const ys=curve.map(x=>x.y),min=Math.min(0,...ys),max=Math.max(0,...ys),span=Math.max(1,max-min);",
" path.setAttribute('d',curve.map((p,i)=>{const x=curve.length===1?500:(i/(curve.length-1))*1000,y=108-((p.y-min)/span)*96;return(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)}).join(' '));",
"}"
].join('\n'),'Use exact aggregated KPIs and chronological outcome graph');
 w=once(w,"const total=rows.length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));if(state.page>pages)state.page=pages;const slice=rows.slice((state.page-1)*PAGE_SIZE,state.page*PAGE_SIZE)","const total=stageView?.totalRows??0,pages=stageView?.pages??1;if(state.page>pages)state.page=pages;const slice=rows",'Render actual 50 rows but keep full pagination');
 w=region(w,'function renderStats(){',"document.addEventListener('ball46:statistics-snapshot'",[
"/* B46_ACTUAL_STATISTICS_STAGE: original markup and CSS, revision-pinned materialized read model. */",
"let stageSummary=null,stageView=null,stageTicket=0;",
"document.addEventListener('ball46:statistics-fast-refresh',()=>{if(state.view==='statistics')stageRefresh()});",
"function renderStats(){return stageRefresh()}",
"function loadStatistics(){return stageRefresh()}",
"function stagePaint(){",
" if(!stageView||!stageSummary)return;",
" const visible=$('[data-workspace-panel=\"statistics\"] .sp-stats-content');if(visible)visible.style.setProperty('display','block','important');",
" renderStatNav();renderVariants();renderStatHeader();renderKpis();renderGraph();renderFilters();renderTable(stageView.rows);window.BALL46_STATISTICS_FAST.acceptSummary(stageSummary);document.dispatchEvent(new CustomEvent('ball46:statistics-fast',{detail:{summary:stageSummary,view:stageView}}));",
" const st=$('[data-sp-feed-state]');if(st)st.textContent='Updated · '+stageView.totalRows+' records · '+stageSummary.pending+' pending'+(stageSummary.stale?' · LAST VERIFIED DATA':'');",
" const loader=$('[data-workspace-panel=\"statistics\"] .b46-stats-loader');if(loader){loader.hidden=true;loader.style.display='none';loader.setAttribute('aria-busy','false')}",
" document.body.dataset.b46StageReady='1';document.body.dataset.b46StageRevision=String(stageSummary.contentRevision);document.body.dataset.b46StatsSourceStale=String(!!stageSummary.stale);",
" performance.mark('b46-real-ui-statistics-ready');",
"}",
"async function stageRefresh(){",
" if(state.view!=='statistics')return;",
" const ticket=++stageTicket;state.statsLoading=true;document.body.dataset.b46StageReady='0';",
" try{for(let attempt=0;attempt<2;attempt++){",
"  {const r=await fetch('/api/statistics/fast-summary',{cache:'no-store'});if(!r.ok)throw Error('Stage summary HTTP '+r.status);const data=await r.json();if(!data.ok||data.marketCounts?.all!==data.ledgerTotal||!Number.isSafeInteger(data.contentRevision))throw Error('Stage summary mismatch');stageSummary=data}",
"  if(ticket!==stageTicket||state.view!=='statistics')return;",
"  const q=new URLSearchParams({market:state.market,variant:state.variant,filter:state.filter,page:String(state.page),limit:'50',rangeDays:'all',revision:String(stageSummary.contentRevision)});",
"  const r=await fetch('/api/statistics/fast-view?'+q,{cache:'no-store'});if(r.status===409){stageSummary=null;continue}",
"  if(!r.ok)throw Error('Stage page HTTP '+r.status);",
"  const data=await r.json();if(data?.contentRevision!==stageSummary.contentRevision||data.totalRows!==data.metrics?.ledgerTotal||!Array.isArray(data.rows)||data.rows.length>50)throw Error('Stage page verification failed');",
"  if(ticket!==stageTicket||state.view!=='statistics')return;",
"  stageView=data;state.rows=data.rows;state.statisticsTotal=stageSummary.ledgerTotal;state.statsLoaded=true;state.statsLoadedAt=Date.now();stagePaint();return;",
" }throw Error('Stage revision changed during view')",
" }catch(e){if(ticket!==stageTicket)return;const el=$('[data-sp-feed-state]');if(el)el.textContent='Statistics incomplete or unavailable · '+String(e.message||e);document.body.dataset.b46StageReady='error';}",
" finally{if(ticket===stageTicket)state.statsLoading=false}",
"}"
].join('\n'),'Connect actual Statistics UI to summary and on-demand view');
 w=region(w,"document.addEventListener('ball46:statistics-snapshot'","function init(){","/* No legacy full-history snapshot listener on stage. */",'Prevent old loader overwriting remote view');
 w=once(w,"const boot=()=>{ensureCard();const api=window.BALL46_STATISTICS_DATA;if(api?.load)api.load().then(paint).catch(()=>{})};","const boot=()=>{ensureCard()};",'Do not boot hidden KPI full history');
 assert(w.includes('B46_ACTUAL_STATISTICS_STAGE'));
 return browserRuntime+'\n'+w;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
await mkdir(OUT,{recursive:true});
const capture=JSON.parse(await readFile(DIR+'/capture.json','utf8'));
assert(process.env.B46_VERIFIED_BASE_VERSION&&capture.activeVersion===process.env.B46_VERIFIED_BASE_VERSION,'VERIFIED_ACTIVE_BASE_REQUIRED');
const entry=capture.files.find(f=>new URL(f.path,'https://test.invalid').pathname==='/singlepage-workspace-343.js');
assert(entry,'WORKSPACE_CAPTURE_MISSING');
const body=await readFile(DIR+'/files/'+entry.file);assert.equal(sha(body),entry.sha,'CAPTURE_HASH_DRIFT');
const patched=patchActualStatistics(body.toString());await writeFile(OUT+'/real-workspace.txt',patched);
const finance=capture.files.find(f=>new URL(f.path,'https://test.invalid').pathname==='/longterm-performance-343.js');assert(finance,'PERFORMANCE_CAPTURE_MISSING');
const financeBody=await readFile(DIR+'/files/'+finance.file);assert.equal(sha(financeBody),finance.sha,'PERFORMANCE_CAPTURE_HASH_DRIFT');await writeFile(OUT+'/real-performance.txt',patchActualPerformance(financeBody.toString()));
const html=await readFile(DIR+'/index.html','utf8');assert.equal(sha(html),capture.htmlSha);
const stageCss='<style id="b46-stage-content-visibility">body[data-workspace-view="statistics"] [data-workspace-panel="statistics"] .sp-stats-content{display:block!important}.b46-stage-mobile-market-nav{display:none}@media(max-width:680px){.b46-stage-mobile-market-nav{display:flex!important;gap:6px;overflow-x:auto;margin:7px 4px;padding:4px 0 10px;scrollbar-width:thin}.b46-stage-mobile-market-nav button{background:#172820;color:#d7e9dd;border:1px solid #395f4a;border-radius:8px;font:12px system-ui;padding:8px 10px;white-space:nowrap}.b46-stage-mobile-market-nav button.active{background:#236e4a;color:white}}</style>';
const dash=capture.files.find(f=>new URL(f.path,'https://test.invalid').pathname==='/dashboard-v2-stage3-featured-facts-20261013a.js');assert(dash,'DASHBOARD_CAPTURE_MISSING');
const dashBody=await readFile(DIR+'/files/'+dash.file);assert.equal(sha(dashBody),dash.sha,'DASHBOARD_CAPTURE_DRIFT');await writeFile(OUT+'/real-scorebar.txt',patchScorebarStatistics(dashBody.toString()));
const decorated=patchHomepageStatistics(html).replace('</head>','<meta name="robots" content="noindex,nofollow">'+stageCss+'<style id="b46-stage-watermark">body::before{content:"STATISTICS STAGING · NOT PRODUCTION";position:fixed;bottom:3px;right:4px;padding:4px 7px;z-index:2147483647;background:#243e32;color:#cefde7;font:10px system-ui;pointer-events:none}</style></head>');
assert.notEqual(decorated,html);await writeFile(OUT+'/real-index.html',decorated);
console.log('ACTUAL_UI_PATCH '+JSON.stringify({ok:true,originalHtmlSha:capture.htmlSha,originalWorkspaceSha:entry.sha,htmlBytes:Buffer.byteLength(decorated),patchedWorkspaceBytes:Buffer.byteLength(patched),cssUnchanged:true}));

}

export function patchActualPerformance(source){
 let s=source;
 s=region(s,'function filteredRows(){','function currentTitle(){',
 "function filteredRows(){return []}\nfunction stats(){return fastPerformance||{rows:0,wins:0,losses:0,pushes:0,priced:0,net:0,stake:0,roi:null,avgOdds:null,maxDD:0,peak:0,bestRun:0,unitPoints:[],roiPoints:[],ratePoints:[]}}",'Use verified range metrics');
 s=once(s,'let loading=null;',"let loading=null;let fastPerformance=null;let fastSeq=0;",'Range request state');
 s=once(s,'function dailyUnitPoints(points){',"function dailyUnitPoints(points){if(points.every(p=>p.dayKey))return points;",'Preserve exact precomputed daily OHLC');
 s=once(s,"range=b.dataset.b46Range||'all';b46UnitView={start:null,count:null,total:0};render()", "range=b.dataset.b46Range||'all';b46UnitView={start:null,count:null,total:0};load()",'Lazy selected range');
 s=once(s,"metric=b.dataset.b46Mode||'units';render()", "metric=b.dataset.b46Mode||'units';load()",'Lazy selected metric');
 s=region(s,'async function load(){','function active(){',
 `async function load(){const ticket=++fastSeq;try{const f=routeFilter(),result=await window.BALL46_STATISTICS_FAST.open({...f,page:1,rangeDays:RANGE_DAYS[range]||'all',metric});if(ticket!==fastSeq||!active())return;if(String(result.summary.contentRevision)!==document.body.dataset.b46StageRevision){document.dispatchEvent(new CustomEvent('ball46:statistics-fast-refresh'));return}fastPerformance=result.view.performance;render();document.dispatchEvent(new CustomEvent('ball46:statistics-fast-chart-ready'))}catch(err){console.warn('[Ball46 performance]',err);const card=ensureCard();if(!fastPerformance&&card)card.querySelector('[data-b46-perf-shell]').textContent='Long-term performance temporarily unavailable.'}}\n`,'Remove legacy full-history chart load');
 s=region(s,"document.addEventListener('ball46:statistics-snapshot'",'function refreshSoon(){',"document.addEventListener('ball46:statistics-fast',e=>{if(!active())return;if(range==='all'&&metric==='units'){fastPerformance=e.detail.view.performance;render();document.dispatchEvent(new CustomEvent('ball46:statistics-fast-chart-ready'))}else load()});\n",'Subscribe only to verified derived updates');
 return s;
}
