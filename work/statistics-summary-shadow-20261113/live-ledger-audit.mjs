// One serial read-only pass. Never uses /health, /scan, /ledger-sync, unpaged
// /statistics, provider APIs, retries, owner settings, or Production storage writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ShadowSummary} from './summary.mjs';
import {verifyReadOnlyRoutes} from './readonly-contract.mjs';
const D='work/statistics-summary-shadow-20261113',A='62cb0db544160e6591342abd6b4f35cc',W='nomadtips3-engine-343';
const capture=JSON.parse(await readFile(D+'/source/active.json')),base=capture.workers.find(x=>x.worker===W);
const raw=await readFile(D+'/source/engine.js','utf8');
assert.equal(createHash('sha256').update(raw).digest('hex'),base.sha);
await verifyReadOnlyRoutes(raw); // Guard actual entry + inherited handlers before any runtime read.
const report={startedAt:new Date().toISOString(),ok:false,productionWrites:0,providerRequestsAddedByAudit:0,runtimeRequests:0,pages:0,rows:0,checks:0,engineVersion:base.active,sourceHash:base.sha};
await mkdir(D+'/qa',{recursive:true});
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});assert(r.ok,'CONTROL_HTTP_'+r.status);const j=await r.json();assert(j.success,'CONTROL_FAILED');return j.result;}
async function active(){const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100,'SPLIT_TRAFFIC');return d.versions[0].version_id;}
const counters=['ledgerTotal','pending','unresolved','win','loss','push','halfWin','halfLoss'];
function signature(j){return JSON.stringify([j.ledgerTotal,j.total??j.settledTotal,j.pending,j.unresolved,j.win,j.loss,j.push,j.halfWin,j.halfLoss,j.ledgerUpdatedAt??j.updatedAt,j.byMarket]);}
const start=Date.now();let origin;
async function get(path){
 assert(Date.now()-start<120000,'AUDIT_TIME_BOUND');
 const u=new URL(path,origin);assert.equal(u.origin,origin,'ORIGIN_CHANGED');
 assert(u.pathname==='/ledger-health'||u.pathname==='/statistics','READ_PATH_FORBIDDEN');
 if(u.pathname==='/statistics')assert(u.searchParams.get('paged')==='1'&&u.searchParams.get('cursor')?.startsWith('stat:v2:row:'),'UNSAFE_STATISTICS_READ');
 report.runtimeRequests++;
 const r=await fetch(u,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(r.ok,'RUNTIME_HTTP_'+r.status+'_STOP_NO_RETRY');
 const text=await r.text();assert(Buffer.byteLength(text)<=12*1024*1024,'RESPONSE_TOO_LARGE');
 const j=JSON.parse(text);assert.equal(j.ok,true,'RUNTIME_NOT_OK');return j;
}
try{
 assert.equal(await active(),base.active,'ENGINE_DRIFT_BEFORE_AUDIT');
 const enabled=await cf('/workers/scripts/'+W+'/subdomain');assert.equal(enabled.enabled,true,'ENGINE_WORKERS_DEV_DISABLED_STOP');
 const account=await cf('/workers/subdomain');assert(/^[a-z0-9-]+$/.test(account.subdomain),'INVALID_ACCOUNT_SUBDOMAIN');
 origin='https://'+W+'.'+account.subdomain+'.workers.dev';
 const before=await get('/ledger-health');assert(Number.isSafeInteger(before.ledgerTotal)&&before.ledgerTotal>=0,'COUNTERS_MISSING');
 assert(before.ledgerTotal<=32000,'SAFE_SINGLE_PASS_BOUND_STOP');
 const data=new Map(),storage={get:async key=>structuredClone(data.get(key)),transaction:async fn=>{
  const staged=new Map();const result=await fn({get:async k=>structuredClone(staged.has(k)?staged.get(k):data.get(k)),put:async(k,v)=>{for(const [key,value]of typeof k==='string'?[[k,v]]:Object.entries(k))staged.set(key,structuredClone(value));}});for(const [k,v]of staged)data.set(k,v);return result;
 }};
 const generation=base.active+':'+before.updatedAt,shadow=new ShadowSummary(storage,'actual-ledger-audit');await shadow.initialize({engineVersion:base.active,engineSha:base.sha,generation});
 const ids=new Set(),cursors=new Set(),compact=[],digest=createHash('sha256');let cursor='stat:v2:row:\uffff',referenceNet=0,referenceStake=0;
 const financialSource=await readFile(D+'/source/longterm-performance-343.js','utf8'),s=financialSource.match(/function settlement\(r\)\{[^\n]+/);assert(s,'FINANCIAL_SOURCE_DRIFT');
 const settle=new Function('outcome','num',s[0]+';return settlement')(r=>String(r.result||'').toUpperCase(),v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null);
 for(let n=0;n<64;n++){
  assert(!cursors.has(cursor),'CURSOR_LOOP');cursors.add(cursor);
  const page=await get('/statistics?'+new URLSearchParams({paged:'1',cursor}));report.pages++;
  assert.equal(signature(page),signature(before),'SOURCE_CHANGED_STOP_NO_RETRY');
  assert(Array.isArray(page.rows)&&page.rows.length<=500,'UNBOUNDED_PAGE');
  for(const row of page.rows){
   assert(row.id&&!ids.has(String(row.id)),'DUPLICATE_OR_MISSING_ID');ids.add(String(row.id));
   const r={id:String(row.id),market:row.market,status:row.status,result:row.result,odds:row.odds,createdAt:row.createdAt,settledAt:row.settledAt};
   await shadow.apply({id:r.id,revision:1,row:r});compact.push(r);digest.update(JSON.stringify(r)+'\n');report.rows++;
   if(r.status==='SETTLED'){const v=settle(r);if(v.priced){referenceNet+=v.profit;referenceStake+=v.stake;}}
  }
  if(!page.nextCursor){assert(!page.hasMore,'MISSING_CURSOR');break;}
  assert(page.rows.length>0&&page.hasMore===true,'BAD_CONTINUATION');cursor=page.nextCursor;
  assert(n<63,'PAGE_LIMIT_STOP');
 }
 const after=await get('/ledger-health');assert.equal(signature(after),signature(before),'SOURCE_CHANGED_AT_END');assert.equal(await active(),base.active,'ENGINE_DRIFT_AT_END');assert.equal(report.rows,before.ledgerTotal,'INCOMPLETE_LEDGER');
 const audited=await shadow.audit({...before,complete:true,sourceGeneration:generation});assert(audited.ok,'COUNTS_MISMATCH');report.checks++;
 const sum=(await shadow.read()).summary;assert.equal(sum.settledTotal,before.settledTotal);for(const k of counters)assert.equal(sum[k],before[k],k);report.checks++;
 assert(Math.abs(sum.net-referenceNet)<1e-7&&sum.stake===referenceStake,'FINANCIAL_MISMATCH');report.checks++;
 const denominator=before.win+before.loss+before.halfWin+before.halfLoss,rate=denominator?Math.round((before.win+0.5*before.halfWin)/denominator*1000)/10:null;assert.equal(sum.winRate,rate);report.checks++;
 for(const [market,total]of Object.entries(before.byMarket||{}))assert.equal((await shadow.read('market/'+encodeURIComponent(market))).summary.settledTotal,total,market);report.checks++;
 report.ok=true;report.summary=sum;report.byMarket=before.byMarket;report.ledgerUpdatedAt=before.updatedAt;report.ledgerDigest=digest.digest('hex');report.finishedAt=new Date().toISOString();report.limit='One stable read-only Ledger pass. No source writer installed, no realtime catch-up proof, no UI switch or Production heap claim.';
 // Minimal public football-ledger fields only. No account data, scores, keys, bindings or owner information.
 await writeFile(D+'/qa/verified-compact-ledger.json',JSON.stringify({generation,rows:compact}));
}catch(e){report.error=String(e.message||e);report.limit='Stopped immediately. No retries or changes; incomplete data is not verified/published.';process.exitCode=1;}
await writeFile(D+'/qa/live-ledger.json',JSON.stringify(report,null,2));console.log('LEDGER_AUDIT '+JSON.stringify(report));
