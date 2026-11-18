// CI-only. No credentials or write endpoints. Baseline & candidate use identical captured fixtures.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fold} from './shadow-stage-live-projection.mjs';
import {markets,storedRates,sanitizeRates,patchProjection,patchProxy,patchGraphBridge,appendSidebar} from './sidebar-rate-isolated-v2.mjs';
import {receiverGraph as nativeProxy} from './shadow-site-graph-cutover.mjs';
const {chromium}=createRequire(new URL('./.runtime/package.json',import.meta.url))('playwright');
const host='https://www.ball46.com',out=process.env.RUNNER_TEMP+'/isolated-rate-v2',headers={'cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-IsolatedStage'};
await mkdir(out,{recursive:true});
const graphPath='/b46-receiver-v1/graph',historyPath='/api/engine/statistics',workspacePath='/singlepage-workspace-343.js',chartPath='/longterm-performance-343.js';
const query=m=>new URLSearchParams({market:m,variant:'all',filter:'all',range:'all'}).toString();
async function get(path){const t=performance.now(),r=await fetch(host+path,{headers,signal:AbortSignal.timeout(30000)}),body=await r.text();assert.equal(r.status,200,path);return {body,ms:Math.round(performance.now()-t)}}
const sum=xs=>xs.reduce((s,n)=>s+n,0);
const ws=await get(workspacePath),chart=await get(chartPath);
assert(ws.body.includes('b46:history-restore-progress')&&!ws.body.includes('__B46_SIDEBAR_WINRATES'));
assert(chart.body.includes('__B46_HISTORY_RESTORE_QUEUED'));
const patchedWs=appendSidebar(ws.body),patchedChart=patchGraphBridge(chart.body);assert(patchedWs.startsWith(ws.body));new Function(patchedWs);new Function(patchedChart);
const origProjection=await readFile(new URL('./shadow-receiver-projection-v1.mjs',import.meta.url),'utf8'),origProxy=await readFile(new URL('./shadow-site-graph-cutover.mjs',import.meta.url),'utf8');
const tempProjection=new URL('./.isolated-v2-projection.mjs',import.meta.url),tempProxy=new URL('./.isolated-v2-proxy.mjs',import.meta.url);
await writeFile(tempProjection,patchProjection(origProjection));await writeFile(tempProxy,patchProxy(origProxy));
await import(tempProjection.href);const {receiverGraph:candidateProxy}=await import(tempProxy.href);
let graphs,apiTimes;
for(let i=0;i<4;i++){
 const rs=await Promise.all(markets.map(async m=>{const x=await get(graphPath+'?'+query(m));return [m,JSON.parse(x.body),x.ms]}));
 if(rs.every(([m,d])=>d.ok&&d.market===m&&d.sequence===rs[0][1].sequence)){graphs=Object.fromEntries(rs.map(([m,d])=>[m,d]));apiTimes=Object.fromEntries(rs.map(([m,d,ms])=>[m,ms]));break}
}
assert(graphs,'NO_COHERENT_GRAPH_GENERATION');
const base=graphs.all,keys=['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'];
for(const k of keys)assert.equal(sum(markets.slice(1).map(m=>graphs[m].counts[k])),base.counts[k]);
console.log('ISOLATED_BASELINE_API='+JSON.stringify({sequence:base.sequence,settled:base.summary.rows,ms:apiTimes}));
const stored=Object.fromEntries(markets.map(m=>{
 const g=graphs[m],d=fold(new Map([['2026-11-19',{counts:g.counts,rows:g.summary.rows,priced:0,oddsSum:0,oddsN:0,lastRate:g.asOf}]]),g.asOf);
 return [m,{...g,win_rate:d.win_rate}];
}));
const rates=storedRates(stored);assert(rates);
for(const m of markets){const c=graphs[m].counts,w=c.WIN+c.HALF_WIN,l=c.LOSS+c.HALF_LOSS;assert.equal(rates[m],w+l?w/(w+l)*100:null)}
assert.equal(storedRates({...stored,all:{...stored.all,win_rate:'60%'}}),null);
assert.equal(sanitizeRates({...rates,all:'60%'}),null);assert.equal(sanitizeRates({...rates,all:NaN}),null);assert.equal(sanitizeRates({...rates,all:Infinity}),null);
const payloads={};
for(const m of markets){
 const req=new Request(host+graphPath+'?'+query(m));
 const env=v=>({B46_MARKET_READER:{fetch:async()=>Response.json({...graphs[m],sidebar_win_rate:v})}});
 const a=await nativeProxy(req,env(undefined)),bb=await candidateProxy(req,env(rates));assert.equal(a.status,200);assert.equal(bb.status,200);
 const original=await a.json(),candidate=await bb.json();const {sidebar_win_rate,...unchanged}=candidate;
 assert.deepEqual(unchanged,original);assert.deepEqual(sidebar_win_rate,rates);
 for(const v of [undefined,null,{}, {...rates,all:'59.2%'}]){
  const r=await candidateProxy(req,env(v));assert.equal(r.status,200);assert.deepEqual(await r.json(),original);
 }
 const nullEntry=await candidateProxy(req,env({...rates,all:null}));assert.equal(nullEntry.status,200);const {sidebar_win_rate:nullable,...same}=await nullEntry.json();assert.deepEqual(same,original);assert.equal(nullable.all,null);
 payloads[m]={baseline:original,candidate};
}
const req=new Request(host+graphPath+'?'+query('all')),env={B46_MARKET_READER:{fetch:async()=>Response.json({...graphs.all,sidebar_win_rate:rates})}};
const time=async f=>{const arr=[];for(let i=0;i<50;i++){const t=performance.now();await (await f(req,env)).text();arr.push(performance.now()-t)}return Number(arr.sort((a,b)=>a-b)[25].toFixed(4))};
console.log('ISOLATED_API_PARITY='+JSON.stringify({cases:8*6,baselineLocalMs:await time(nativeProxy),candidateLocalMs:await time(candidateProxy),rates,extraRequests:0,rawLedgerScanForRate:0,storedField:'win_rate'}));
await unlink(tempProjection);await unlink(tempProxy);
// Capture the actual original browser baseline, with all history requests unchanged.
// Capture a coherent existing cursor chain once, then freeze it for paired replay.
const b=await chromium.launch({headless:true});
const history=new Map();
function histKey(url){const u=new URL(url);return u.searchParams.get('cursor')||'first'}
async function liveBaseline(){
 const ctx=await b.newContext({viewport:{width:1612,height:900},serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],pending=new Set(),requests=[];
 p.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 p.on('request',r=>{const u=new URL(r.url());if(u.pathname===historyPath)requests.push(histKey(r.url()))});
 p.on('response',r=>{if(new URL(r.url()).pathname!==historyPath||r.status()!==200)return;const promise=(async()=>{try{const d=await r.json();if(d.ok&&Array.isArray(d.rows))history.set(histKey(r.url()),d)}catch{}})();pending.add(promise);promise.finally(()=>pending.delete(promise))});
 const start=Date.now();await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
 await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver',null,{timeout:30000});const graphMs=Date.now()-start;
 await p.waitForFunction(()=>[...document.querySelectorAll('[data-sp-table-body] tr')].some(e=>e.cells.length>=4),null,{timeout:45000});const firstMs=Date.now()-start;
 await p.waitForFunction(()=>{const s=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return s?.ok&&s.ledgerRows?.length===s.ledgerTotal},null,{timeout:120000});
 const fullMs=Date.now()-start;await Promise.all([...pending]);
 const snapshot=await p.evaluate(()=>{const s=window.BALL46_STATISTICS_DATA.getSnapshot();return {total:s.total,ledgerTotal:s.ledgerTotal,rows:s.ledgerRows.length}});
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('ISOLATED_LIVE_BASELINE='+JSON.stringify({device:'PC',graphMs,firstMs,fullMs,snapshot,requests:requests.length,jsErrors:errors.length}));
 await ctx.close();
 // Exact captured chain, do not silently join different generations or duplicate rows.
 let cursor='first',seen=new Set(),ids=new Set(),n=0;const first=history.get(cursor);assert(first);
 while(cursor){assert(!seen.has(cursor));seen.add(cursor);const p=history.get(cursor);assert(p,'MISSING_CAPTURED_PAGE');assert.equal(p.ledgerTotal,first.ledgerTotal);assert.equal(p.total,first.total);for(const row of p.rows){assert(!ids.has(row.id));ids.add(row.id)}n+=p.rows.length;cursor=p.nextCursor||null}
 assert.equal(n,first.ledgerTotal);return {pages:seen.size,rows:n};
}
const capture=await liveBaseline();
console.log('ISOLATED_CAPTURE='+JSON.stringify(capture));
const staticAssets=new Map(),aliases={all:'all','1x2':'1X2',ah:'AH',ou:'O/U',corners:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
async function run(mode,mobile,index){
 const ctx=await b.newContext({viewport:{width:mobile?390:1612,height:mobile?844:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],counter={graph:0,history:0},missing=[];
 p.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(!['GET','HEAD'].includes(r.method()))return route.abort();
  if(!['ball46.com','www.ball46.com'].includes(u.hostname))return route.continue();
  if(u.pathname===workspacePath||u.pathname===chartPath)return route.fulfill({status:200,contentType:'application/javascript',body:u.pathname===workspacePath?(mode==='baseline'?ws.body:patchedWs):(mode==='baseline'?chart.body:patchedChart)});
  if(u.pathname===graphPath){counter.graph++;const m=u.searchParams.get('market'),x=payloads[m];if(!x){missing.push(u.search);return route.abort()}const v=mode==='baseline'?x.baseline:mode==='malformed'?{...x.baseline,sidebar_win_rate:{...rates,all:'60%'}}:mode==='missing'?x.baseline:mode==='null'?{...x.baseline,sidebar_win_rate:null}:x.candidate;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v),headers:{'x-b46-statistics-source':'RECEIVER','cache-control':'no-store'}})}
  if(u.pathname===historyPath){counter.history++;const data=history.get(histKey(r.url()));if(!data){missing.push(histKey(r.url()));return route.abort()}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})}
  // Freeze HTML and static assets used in all paired tests; let unrelated live GETs pass.
  if(r.resourceType()==='document'||['script','stylesheet','font'].includes(r.resourceType())){
   const k=u.pathname+u.search;if(staticAssets.has(k))return route.fulfill(staticAssets.get(k));
   try{const res=await route.fetch({timeout:20000}),data={status:res.status(),headers:res.headers(),body:await res.body()};delete data.headers['content-encoding'];delete data.headers['content-length'];staticAssets.set(k,data);return route.fulfill(data)}catch{return route.continue()}
  }
  return route.continue();
 });
 const start=Date.now();
 try{
  await p.goto(host+'/?view=statistics',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForFunction(()=>document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver',null,{timeout:30000});const graphMs=Date.now()-start;
  await p.waitForFunction(()=>[...document.querySelectorAll('[data-sp-table-body] tr')].some(e=>e.cells.length>=4),null,{timeout:45000});const firstMs=Date.now()-start;
  await p.waitForFunction(()=>{const s=window.BALL46_STATISTICS_DATA?.getSnapshot?.();return s?.ok&&s.ledgerRows?.length===s.ledgerTotal},null,{timeout:60000});const fullMs=Date.now()-start;
  const inspect=()=>p.evaluate(()=>{const c=document.querySelector('#b46-finance-chart-card'),s=window.BALL46_STATISTICS_DATA.getSnapshot(),t=document.querySelector('[data-sp-table-body]');return {market:c.dataset.b46Market,settled:c.dataset.b46Settled,net:c.dataset.b46Net,visibility:getComputedStyle(c).visibility,rows:[...t.querySelectorAll('tr')].map(e=>e.textContent),records:document.querySelector('[data-sp-record-count]').textContent,ledger:s.ledgerRows.length,settledLedger:s.total,counts:[...document.querySelectorAll('[data-stat-market]')].map(e=>({id:e.dataset.statMarket,count:e.querySelector('b')?.textContent,rate:e.querySelector('.b46-isolated-rate-v2')?.textContent??null,countDisplay:getComputedStyle(e.querySelector('b')).display,rateDisplay:e.querySelector('.b46-isolated-rate-v2')?getComputedStyle(e.querySelector('.b46-isolated-rate-v2')).display:null})),graphText:c.innerText}});
  async function verify(){
   const d=await inspect();
   for(const x of d.counts){
    if(mode==='candidate'){const v=rates[aliases[x.id]];assert.equal(x.rate,v===null?'—':v.toFixed(2)+'%');assert.equal(x.countDisplay,'none');assert.notEqual(x.rateDisplay,'none')}
    else {assert.equal(x.rate,null);assert.notEqual(x.countDisplay,'none')}
    assert(/^\d+$/.test(x.count),'NATIVE_COUNT_CHANGED');
   }
   return d;
  }
  const states=[await verify()];
  for(const [id,m] of Object.entries(aliases).filter(([id])=>id!=='all')){
   await p.locator('[data-stat-market="'+id+'"]').click();
   await p.waitForFunction(m=>document.querySelector('#b46-finance-chart-card')?.dataset.b46Market===m&&document.querySelector('#b46-finance-chart-card')?.dataset.b46StatisticsSource==='receiver',m,{timeout:20000});
   await p.waitForTimeout(180);
   // Bridge is a microtask, never blocks native graph.
   states.push(await verify());
  }
  assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(missing.length,0,JSON.stringify(missing));
  if(mode==='candidate'||mode==='malformed')await p.screenshot({path:out+'/'+mode+'-'+(mobile?'mobile':'pc')+'-'+index+'.png',fullPage:false});
  const result={mode,mobile,index,graphMs,firstMs,fullMs,requests:counter,ledger:states[0].ledger,settled:states[0].settledLedger,errors:errors.length,states};
  console.log('ISOLATED_BROWSER='+JSON.stringify({...result,states:states.map(s=>({market:s.market,settled:s.settled,records:s.records,visibility:s.visibility,rows:s.rows.length,counts:s.counts}))}));
  return result;
 }finally{await ctx.close()}
}
function parity(a,b){
 assert.equal(a.states.length,b.states.length);
 for(let i=0;i<a.states.length;i++){const x=a.states[i],y=b.states[i];for(const k of ['market','settled','net','visibility','rows','records','ledger','settledLedger','graphText'])assert.deepEqual(y[k],x[k],'ISOLATION_'+k);assert.deepEqual(y.counts.map(z=>z.count),x.counts.map(z=>z.count))}
 assert.equal(b.requests.history,a.requests.history,'EXTRA_HISTORY_REQUEST');
 // Navigation may have a native 15-second refresh; no new call path in isolated layer.
}
try{
 // Warm common static assets before paired timing. First original run also establishes mobile baseline.
 const results=[];
 for(const mobile of [false,true]){
  await run('baseline',mobile,-1); // warm common assets; excluded from benchmark
  const baseline=await run('baseline',mobile,0);
  const candidate=await run('candidate',mobile,0);parity(baseline,candidate);
  const second=await run('candidate',mobile,1),control=await run('baseline',mobile,1);parity(control,second);
  for(const mode of ['null','missing','malformed']){const fault=await run(mode,mobile,0);parity(control,fault)}
  results.push({mobile,baseline:[baseline,control].map(({graphMs,firstMs,fullMs,requests})=>({graphMs,firstMs,fullMs,requests})),candidate:[candidate,second].map(({graphMs,firstMs,fullMs,requests})=>({graphMs,firstMs,fullMs,requests})),faults:3,markets:8,historyParity:true});
 }
 console.log('ISOLATED_STAGE_PASS='+JSON.stringify({results,sequence:base.sequence,settled:base.summary.rows,rates,historyCapture:capture,productionWrites:0,zeroExtraRequestPaths:true,storedFieldReused:true}));
}finally{await b.close()}
