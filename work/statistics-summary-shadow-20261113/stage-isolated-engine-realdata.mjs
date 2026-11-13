import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

const D='work/statistics-summary-shadow-20261113',OUT=D+'/qa/isolated-engine';
const A='62cb0db544160e6591342abd6b4f35cc';
const S='ball46-statistics-engine-candidate-20261113';
const PROD_ENGINE='nomadtips3-engine-343',WEBSITE='ball46-production';
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(OUT,{recursive:true});
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,worker:S,productionWrites:0,providerRequests:0,productionTrafficWrites:0,source:'recorded real Ledger snapshot',writes:[]};
let created=false,subdomainTouched=false;

async function cf(method,path,body){
 const write=method!=='GET';
 if(write){
  const allowed=(method==='PUT'&&path==='/workers/scripts/'+S)||(method==='POST'&&path==='/workers/scripts/'+S+'/subdomain');
  assert(allowed,'CONTROL_WRITE_DENIED:'+method+':'+path);report.writes.push({method,path});
 }
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+r.status+':'+JSON.stringify(j.errors));return j.result;
}
async function active(worker){
 const x=await cf('GET','/workers/scripts/'+worker+'/deployments?per_page=1');assert(x.deployments?.length,'NO_DEPLOYMENT:'+worker);const d=x.deployments[0];assert(d.versions.length===1&&Number(d.versions[0].percentage)===100,'SPLIT_TRAFFIC:'+worker);return {version:d.versions[0].version_id,deployment:d.id};
}
async function fetchJson(url,opts={}){
 const r=await fetch(url,{...opts,signal:AbortSignal.timeout(45000)}),text=await r.text();let data;try{data=JSON.parse(text)}catch{data={sample:text.slice(0,180)}};return{status:r.status,data};
}
function counts(rows){
 const c={ledgerTotal:rows.length,settledTotal:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,byMarket:{}};
 for(const row of rows){const st=String(row.status||'').toUpperCase();if(st==='PENDING')c.pending++;else if(st==='UNRESOLVED')c.unresolved++;else if(st==='SETTLED'){c.settledTotal++;const r=String(row.result||'').toUpperCase();if(r==='WIN')c.win++;else if(r==='LOSS')c.loss++;else if(r==='PUSH')c.push++;else if(r==='HALF_WIN')c.halfWin++;else if(r==='HALF_LOSS')c.halfLoss++;const m=String(row.market||'unknown');c.byMarket[m]=(c.byMarket[m]||0)+1}}return c;
}
try{
 const beforeEngine=await active(PROD_ENGINE),beforeWeb=await active(WEBSITE);report.productionBefore={engine:beforeEngine,website:beforeWeb};
 const source=JSON.parse(await readFile(D+'/source/active.json'));assert.equal(beforeEngine.version,source.workers.find(x=>x.worker===PROD_ENGINE).active,'PROD_ENGINE_DRIFT');assert.equal(beforeWeb.version,source.workers.find(x=>x.worker===WEBSITE).active,'PROD_WEBSITE_DRIFT');
 const scripts=await cf('GET','/workers/scripts');assert(!scripts.some(x=>x.id===S),'ISOLATED_WORKER_EXISTS_STOP');
 const input=JSON.parse(await readFile(D+'/reference/ui-proof/qa/verified-full-ledger.json','utf8'));assert(Array.isArray(input.rows)&&input.rows.length>14000,'REAL_LEDGER_SNAPSHOT_MISSING');
 const expected=counts(input.rows);assert.equal(expected.ledgerTotal,input.meta.ledgerTotal,'SNAPSHOT_META_TOTAL');assert.equal(expected.settledTotal,input.meta.settledTotal,'SNAPSHOT_META_SETTLED');

 let code=(await readFile(D+'/qa/pinned-engine-candidate.js','utf8'));
 assert(code.includes('CURSOR_PINNED_GENERATION_V1')&&code.includes('STATISTICS_GENERATION_CHANGED'),'PINNED_CANDIDATE_MISSING');
 const allowedOld='const u = new URL(request.url), allowed = ["/health", "/registry", "/settings", "/scan", "/board", "/signals", "/statistics", "/history", "/fixture-odds", "/referee", "/reconcile-final", "/bridge-health", "/ledger-import", "/ledger-sync", "/ledger-health"];';
 assert.equal(code.split(allowedOld).length,2,'ISOLATION_FIREWALL_SOURCE_DRIFT');
 code=code.replace(allowedOld,'const u = new URL(request.url), allowed = ["/statistics", "/ledger-import", "/ledger-health"];');
 const schedOld='ctx.waitUntil(stub(env).fetch("https://engine.internal/scan", { method: "POST" }));';
 assert.equal(code.split(schedOld).length,2,'SCHEDULE_SOURCE_DRIFT');code=code.replace(schedOld,'return; /* isolated candidate: scheduler disabled */');
 assert(!code.includes('allowed = ["/health"'),'FIREWALL_NOT_APPLIED');
 const token='iso-'+randomUUID()+'-'+randomUUID();
 const metadata={main_module:'index.mjs',compatibility_date:'2026-09-09',bindings:[{type:'plain_text',name:'FIVEDOLLAR_API_KEY',text:token},{type:'durable_object_namespace',name:'ENGINE',class_name:'Nomad343Engine'}],migrations:{new_tag:'b46-stat-engine-isolated-v1',new_sqlite_classes:['Nomad343Engine']},observability:{enabled:true},annotations:{'workers/tag':'B46_STAT_ENGINE_ISOLATED_20261113','workers/message':'Isolated hosted statistics Engine candidate; recorded real Ledger only; no routes/Cron/provider access'}};
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set('index.mjs',new Blob([code],{type:'application/javascript+module'}),'index.mjs');
 await cf('PUT','/workers/scripts/'+S,form);created=true;
 await cf('POST','/workers/scripts/'+S+'/subdomain',{enabled:true,previews_enabled:false});subdomainTouched=true;
 assert.deepEqual(await cf('GET','/workers/scripts/'+S+'/schedules'),{schedules:[]},'ISOLATED_CRON_NOT_EMPTY');
 const domains=(await cf('GET','/workers/domains')).filter(x=>x.service===S);assert.deepEqual(domains,[],'ISOLATED_CUSTOM_DOMAIN');
 const base='https://'+S+'.mccarey-supon.workers.dev';

 const blocked=await fetchJson(base+'/scan',{method:'POST'});assert.equal(blocked.status,404,'SCAN_NOT_BLOCKED');
 const chunks=[];for(let i=0;i<input.rows.length;i+=7500)chunks.push(input.rows.slice(i,i+7500));
 let inserted=0,updated=0;
 for(const rows of chunks){const r=await fetchJson(base+'/ledger-import',{method:'POST',headers:{'content-type':'application/json','x-settlement-token':token},body:JSON.stringify({rows})});assert.equal(r.status,200,'IMPORT_HTTP_'+r.status+':'+JSON.stringify(r.data));assert.equal(r.data.ok,true,'IMPORT_NOT_OK');inserted+=Number(r.data.inserted||0);updated+=Number(r.data.updated||0);}
 assert.equal(inserted,input.rows.length,'IMPORT_INSERT_COUNT');assert.equal(updated,0,'IMPORT_UNEXPECTED_UPDATE');
 const health=await fetchJson(base+'/ledger-health');assert.equal(health.status,200);assert.equal(health.data.ledgerTotal,input.rows.length);assert.equal(health.data.settledTotal,input.meta.settledTotal);
 const generation=String(health.data.updatedAt);assert(generation&&generation!=='undefined','GENERATION_MISSING');

 const all=[],seen=new Set(),cursors=new Set();let cursor='stat:v2:row:\uffff',pages=0,firstMeta=null;
 for(;;){const q=new URLSearchParams({paged:'1',cursor,limit:'2000',generation});const r=await fetchJson(base+'/statistics?'+q);assert.equal(r.status,200,'STAT_HTTP_'+r.status+':'+JSON.stringify(r.data));assert.equal(r.data.ok,true);assert.equal(r.data.statisticsPagination,'CURSOR_PINNED_GENERATION_V1');assert.equal(String(r.data.statisticsGeneration),generation);assert(Array.isArray(r.data.rows)&&r.data.rows.length<=2000);if(!firstMeta)firstMeta=r.data;for(const row of r.data.rows){const id=String(row.id);assert(!seen.has(id),'DUP_ROW:'+id);seen.add(id);all.push(row)}pages++;if(!r.data.nextCursor){assert.equal(r.data.hasMore,false);break}assert(r.data.hasMore===true);assert(!cursors.has(r.data.nextCursor),'CURSOR_LOOP');cursors.add(r.data.nextCursor);cursor=r.data.nextCursor;assert(pages<32,'PAGE_BUDGET')}
 assert.equal(all.length,input.rows.length,'READ_ROW_TOTAL');assert.equal(pages,Math.ceil(input.rows.length/2000),'READ_PAGE_TOTAL');
 const actual=counts(all);assert.deepEqual(actual,expected,'REAL_LEDGER_COUNT_PARITY');
 assert.equal(firstMeta.ledgerTotal,expected.ledgerTotal);assert.equal(firstMeta.total,expected.settledTotal);
 for(const k of ['pending','unresolved','win','loss','push','halfWin','halfLoss'])assert.equal(firstMeta[k],expected[k],k);
 for(const k of new Set([...Object.keys(expected.byMarket),...Object.keys(firstMeta.byMarket||{})]))assert.equal(firstMeta.byMarket?.[k]||0,expected.byMarket[k]||0,'MARKET:'+k);

 const wrong=await fetchJson(base+'/statistics?'+new URLSearchParams({paged:'1',cursor:'stat:v2:row:\uffff',limit:'2000',generation:String(Number(generation)-1)}));assert.equal(wrong.status,409,'GENERATION_FENCE_HTTP');assert.equal(wrong.data.error,'STATISTICS_GENERATION_CHANGED');

 report.hosted={rows:all.length,pages,generation,inserted,updated,protocol:firstMeta.statisticsPagination,wrongGenerationStatus:wrong.status,mainSha:sha(Buffer.from(code))};
 report.ok=true;
} catch(e){report.ok=false;report.error=String(e.stack||e);process.exitCode=1}
finally{
 if(created&&subdomainTouched){try{await cf('POST','/workers/scripts/'+S+'/subdomain',{enabled:false,previews_enabled:false});report.subdomainDisabled=true}catch(e){report.subdomainDisableError=String(e)}}
 try{const afterEngine=await active(PROD_ENGINE),afterWeb=await active(WEBSITE);report.productionAfter={engine:afterEngine,website:afterWeb};if(report.productionBefore){assert.equal(afterEngine.version,report.productionBefore.engine.version,'PROD_ENGINE_VERSION_CHANGED');assert.equal(afterWeb.version,report.productionBefore.website.version,'PROD_WEBSITE_VERSION_CHANGED')}}catch(e){report.productionVerificationError=String(e);report.ok=false;process.exitCode=1}
}
await writeFile(OUT+'/hosted-real-ledger.json',JSON.stringify(report,null,2));console.log('ISOLATED_ENGINE_REALDATA '+JSON.stringify({ok:report.ok,error:report.error,worker:S,hosted:report.hosted,subdomainDisabled:report.subdomainDisabled,productionBefore:report.productionBefore,productionAfter:report.productionAfter,productionWrites:report.productionWrites,productionTrafficWrites:report.productionTrafficWrites,providerRequests:report.providerRequests}));
