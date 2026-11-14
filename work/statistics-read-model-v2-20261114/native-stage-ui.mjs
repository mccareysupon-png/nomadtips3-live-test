import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
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
" const vals={total:m.settledTotal,unsettled:m.pending+m.unresolved,win:m.win+m.halfWin,loss:m.loss+m.halfLoss,push:m.push,rate:m.winRate==null?'—':m.winRate.toFixed(1)+'%',odds:m.avgOdds==null?'—':m.avgOdds.toFixed(2)};",
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
"function renderStats(){return stageRefresh()}",
"function loadStatistics(){return stageRefresh()}",
"function stageMobileNav(){",
" const panel=$('[data-workspace-panel=\"statistics\"]');if(!panel)return;",
" let nav=panel.querySelector('[data-stage-mobile-markets]');",
" if(window.innerWidth>680){if(nav)nav.hidden=true;return}",
" if(!nav){nav=document.createElement('nav');nav.dataset.stageMobileMarkets='1';nav.setAttribute('aria-label','Statistics market filters');nav.className='b46-stage-mobile-market-nav';const content=panel.querySelector('.sp-stats-content');panel.insertBefore(nav,content||panel.firstChild)}",
" nav.hidden=false;",
" nav.innerHTML=MARKETS.map(m=>'<button type=\"button\" data-stage-select=\"'+m.id+'\" class=\"'+(state.market===m.id?'active':'')+'\">'+m.label+' · '+(stageSummary?.marketCounts?.[m.id]??0)+'</button>').join('');",
" nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>setView('statistics',{market:b.dataset.stageSelect})));",
"}",
"function stagePaint(){",
" if(!stageView||!stageSummary)return;",
" const visible=$('[data-workspace-panel=\"statistics\"] .sp-stats-content');if(visible)visible.style.setProperty('display','block','important');",
" renderStatNav();renderVariants();renderStatHeader();renderKpis();renderGraph();renderFilters();renderTable(stageView.rows);stageMobileNav();",
" const st=$('[data-sp-feed-state]');if(st)st.textContent='Staging snapshot · '+stageView.totalRows+' records · '+stageSummary.pending+' pending';",
" document.body.dataset.b46StageReady='1';document.body.dataset.b46StageRevision=String(stageSummary.contentRevision);",
" performance.mark('b46-real-ui-statistics-ready');",
"}",
"async function stageRefresh(){",
" if(state.view!=='statistics')return;",
" const ticket=++stageTicket;state.statsLoading=true;document.body.dataset.b46StageReady='0';",
" try{for(let attempt=0;attempt<2;attempt++){",
"  if(!stageSummary||attempt){const r=await fetch('/api/statistics/fast-summary',{cache:'no-store'});if(!r.ok)throw Error('Stage summary HTTP '+r.status);const data=await r.json();if(!data.ok||data.marketCounts?.all!==data.ledgerTotal||!Number.isSafeInteger(data.contentRevision))throw Error('Stage summary mismatch');stageSummary=data}",
"  if(ticket!==stageTicket||state.view!=='statistics')return;",
"  const q=new URLSearchParams({market:state.market,variant:state.variant,filter:state.filter,page:String(state.page),limit:'50',rangeDays:'all',revision:String(stageSummary.contentRevision)});",
"  const r=await fetch('/api/statistics/fast-view?'+q,{cache:'no-store'});if(r.status===409){stageSummary=null;continue}",
"  if(!r.ok)throw Error('Stage page HTTP '+r.status);",
"  const data=await r.json();if(data?.contentRevision!==stageSummary.contentRevision||data.totalRows!==data.metrics?.ledgerTotal||!Array.isArray(data.rows)||data.rows.length>50)throw Error('Stage page verification failed');",
"  if(ticket!==stageTicket||state.view!=='statistics')return;",
"  stageView=data;state.rows=data.rows;state.statisticsTotal=stageSummary.ledgerTotal;state.statsLoaded=true;state.statsLoadedAt=Date.now();stagePaint();return;",
" }throw Error('Stage revision changed during view')",
" }catch(e){if(ticket!==stageTicket)return;const el=$('[data-sp-feed-state]');if(el)el.textContent='Staging Statistics unavailable · '+String(e.message||e);document.body.dataset.b46StageReady='error';}",
" finally{if(ticket===stageTicket)state.statsLoading=false}",
"}"
].join('\n'),'Connect actual Statistics UI to summary and on-demand view');
 w=region(w,"document.addEventListener('ball46:statistics-snapshot'","function init(){","/* No legacy full-history snapshot listener on stage. */",'Prevent old loader overwriting remote view');
 assert(w.includes('B46_ACTUAL_STATISTICS_STAGE'));
 return w;
}
await mkdir(OUT,{recursive:true});
const capture=JSON.parse(await readFile(DIR+'/capture.json','utf8'));
const entry=capture.files.find(f=>new URL(f.path,'https://test.invalid').pathname==='/singlepage-workspace-343.js');
assert(entry,'WORKSPACE_CAPTURE_MISSING');
const body=await readFile(DIR+'/files/'+entry.file);assert.equal(sha(body),entry.sha,'CAPTURE_HASH_DRIFT');
const patched=patchActualStatistics(body.toString());await writeFile(OUT+'/real-workspace.txt',patched);
const html=await readFile(DIR+'/index.html','utf8');assert.equal(sha(html),capture.htmlSha);
const stageCss='<style id="b46-stage-content-visibility">body[data-workspace-view="statistics"] [data-workspace-panel="statistics"] .sp-stats-content{display:block!important}.b46-stage-mobile-market-nav{display:none}@media(max-width:680px){.b46-stage-mobile-market-nav{display:flex!important;gap:6px;overflow-x:auto;margin:7px 4px;padding:4px 0 10px;scrollbar-width:thin}.b46-stage-mobile-market-nav button{background:#172820;color:#d7e9dd;border:1px solid #395f4a;border-radius:8px;font:12px system-ui;padding:8px 10px;white-space:nowrap}.b46-stage-mobile-market-nav button.active{background:#236e4a;color:white}}</style>';
const decorated=html.replace('</head>','<meta name="robots" content="noindex,nofollow">'+stageCss+'<style id="b46-stage-watermark">body::before{content:"STATISTICS STAGING · NOT PRODUCTION";position:fixed;bottom:3px;right:4px;padding:4px 7px;z-index:2147483647;background:#243e32;color:#cefde7;font:10px system-ui;pointer-events:none}</style></head>');
assert.notEqual(decorated,html);await writeFile(OUT+'/real-index.html',decorated);
console.log('ACTUAL_UI_PATCH '+JSON.stringify({ok:true,originalHtmlSha:capture.htmlSha,originalWorkspaceSha:entry.sha,htmlBytes:Buffer.byteLength(decorated),patchedWorkspaceBytes:Buffer.byteLength(patched),cssUnchanged:true}));
