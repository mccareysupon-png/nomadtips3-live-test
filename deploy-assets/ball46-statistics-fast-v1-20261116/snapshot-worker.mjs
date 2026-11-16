// BALL46 FAST V1 — isolated production SNAPSHOT SERVICE.
// Reads the existing Production public Statistics API. Never settles signals,
// writes original Ledger/KV, modifies the Engine, or changes the live Worker.
import {buildVerifiedGraph,verifyChartSourceContract} from './graph-core.mjs';

export const SNAP_SCHEMA=1;
export const STATS_META='b46-fast-v1-current';
const SNAP_MAX_AGE=20*60*1000;  // expiry for viewer freshness
const CHECK_MAX_AGE=15*60*1000;
const FULL_RECHECK_INTERVAL=45*60*1000;
const SOURCE='https://www.ball46.com/api/engine/statistics';
const CHART='https://www.ball46.com/longterm-performance-343.js';
const GRAPH_REV='ball46-fast-v1-bangkok-day-20261116';
const resultFields={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const sha=async text=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const signature=x=>JSON.stringify([x.ledgerTotal,x.total,x.pending,x.unresolved,
  x.win,x.loss,x.push,x.halfWin,x.halfLoss,x.version,x.settlementRevision,
  x.statisticsLedgerVersion,x.statisticsContentRevision||null,
  Object.entries(x.byMarket||{}).sort(([a],[b])=>a.localeCompare(b))]);
function outcome(r){return String(r?.result||r?.settlement||r?.outcome||'').trim().toUpperCase()}
function settled(r){return Object.hasOwn(resultFields,outcome(r))&&
  (!r.status||String(r.status).toUpperCase()==='SETTLED')}
async function readSource(env,url){
  const upstream=env.B46_PRODUCTION_READ;
  if(!upstream?.fetch)throw Error('PROD_READ_BINDING_MISSING');
  const req=new Request(url,{method:'GET',headers:{accept:'application/json'}});
  return upstream.fetch(req);
}
async function readPage(env,cursor){
  const u=new URL(SOURCE);
  u.searchParams.set('paged','1');u.searchParams.set('_',String(Date.now()));
  if(cursor)u.searchParams.set('cursor',cursor);
  const r=await readSource(env,u.toString());
  if(!r.ok)throw Error('STATS_SOURCE_HTTP_'+r.status);
  if(!(r.headers.get('content-type')||'').toLowerCase().includes('json'))
    throw Error('STATS_SOURCE_CONTENT_TYPE');
  const d=await r.json();
  if(d?.ok!==true||!Array.isArray(d.rows))throw Error('STATS_SOURCE_BAD_PAGE');
  return d;
}
async function chartRevision(env){
  const r=await readSource(env,CHART);
  if(!r.ok)throw Error('CHART_HTTP_'+r.status);
  const body=await r.text();
  verifyChartSourceContract(body);
  return sha(body);
}
function verifyAll(first,rows){
  if(!Number.isSafeInteger(first.ledgerTotal)||rows.length!==first.ledgerTotal)
    throw Error('LEDGER_TOTAL_MISMATCH');
  const seen=new Set(),counts={WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0};
  let done=0,pending=0,unresolved=0;
  for(const r of rows){
    if(!r?.id||seen.has(String(r.id)))throw Error('LEDGER_DUPLICATE_OR_MISSING_ID');
    seen.add(String(r.id));
    if(settled(r)){done++;counts[outcome(r)]++}
    if(r.status==='PENDING')pending++;
    if(r.status==='UNRESOLVED')unresolved++;
  }
  if(done!==first.total||pending!==first.pending||unresolved!==first.unresolved)
    throw Error('LEDGER_STATUS_MISMATCH');
  for(const [key,field] of Object.entries(resultFields))
    if(counts[key]!==first[field])throw Error('LEDGER_RESULT_MISMATCH_'+field);
}
async function readFully(env,first){
  let current=first;
  const cursors=new Set(),rows=[];
  for(let i=0;i<150;i++){
    if(signature(current)!==signature(first))throw Error('LEDGER_CHANGED_DURING_READ');
    if(!current.rows?.length)throw Error('LEDGER_EMPTY_PAGE');
    rows.push(...current.rows);
    if(!current.nextCursor){
      if(current.hasMore)throw Error('LEDGER_MISSING_CURSOR');
      break;
    }
    if(cursors.has(current.nextCursor))throw Error('LEDGER_CURSOR_LOOP');
    cursors.add(current.nextCursor);
    current=await readPage(env,current.nextCursor);
    if(i===149)throw Error('LEDGER_TOO_MANY_PAGES');
  }
  verifyAll(first,rows);
  const recheck=await readPage(env);
  if(signature(first)!==signature(recheck))throw Error('LEDGER_CHANGED_BEFORE_PUBLICATION');
  return rows;
}
const consistent=meta=>meta?.schema===SNAP_SCHEMA&&
  /^b46f1-head-[0-9a-f]{32}$/.test(meta.headKey||'')&&
  /^b46f1-graph-[0-9a-f]{32}$/.test(meta.graphKey||'')&&
  Number.isFinite(meta.fullVerifiedAt)&&Number.isFinite(meta.checkedAt)&&
  typeof meta.chartSourceHash==='string'&&typeof meta.signature==='string';
export async function sync(env){
  if(!env.B46_FAST_KV)throw Error('DEDICATED_PRODUCTION_FAST_KV_MISSING');
  const now=Date.now(),previous=await env.B46_FAST_KV.get(STATS_META,'json');
  const [head,chartSourceHash]=await Promise.all([readPage(env),chartRevision(env)]);
  const sig=signature(head);
  if(consistent(previous)&&previous.signature===sig&&
     previous.chartSourceHash===chartSourceHash &&
     previous.graphRevision===GRAPH_REV &&
     now-previous.fullVerifiedAt<FULL_RECHECK_INTERVAL){
    await env.B46_FAST_KV.put(STATS_META,JSON.stringify({...previous,checkedAt:now}));
    return {mode:'UNCHANGED',total:head.total,ledgerTotal:head.ledgerTotal,checkedAt:now};
  }
  const rows=await readFully(env,head);
  const result=buildVerifiedGraph(rows,now);
  if(result.result.summary.rows!==head.total||
    result.result.summary.wins!==head.win+head.halfWin||
    result.result.summary.losses!==head.loss+head.halfLoss||
    result.result.summary.pushes!==head.push)throw Error('GRAPH_TOTAL_MISMATCH');

  const allFields=['ledgerTotal','total','pending','unresolved','win','loss',
     'push','halfWin','halfLoss','version','settlementRevision',
     'statisticsLedgerVersion','statisticsContentRevision','ledgerUpdatedAt'];
  const summary={schema:1,ok:true,mode:'AGGREGATES_ONLY_NOT_HISTORY',source:'PRODUCTION_READONLY',
    snapshotSavedAt:now};
  for(const k of allFields)if(Object.hasOwn(head,k))summary[k]=head[k];
  if(head.byMarket)summary.byMarket=head.byMarket;
  const headBody=JSON.stringify(summary),graphBody=result.body;
  if(new TextEncoder().encode(headBody).length>128*1024||
     new TextEncoder().encode(graphBody).length>512*1024)throw Error('FAST_PAYLOAD_TOO_LARGE');
  const [headHash,graphHash]=await Promise.all([sha(headBody),sha(graphBody)]);
  const headKey='b46f1-head-'+headHash.slice(0,32);
  const graphKey='b46f1-graph-'+graphHash.slice(0,32);
  const ttl={expirationTtl:3*24*3600};
  await env.B46_FAST_KV.put(headKey,headBody,ttl);
  await env.B46_FAST_KV.put(graphKey,graphBody,ttl);
  // Only publish manifest after immutable values can be read and verified.
  const [headRead,graphRead]=await Promise.all([
    env.B46_FAST_KV.get(headKey),env.B46_FAST_KV.get(graphKey)]);
  if(!headRead||!graphRead||
    (await sha(headRead))!==headHash||(await sha(graphRead))!==graphHash)
    throw Error('FAST_KV_READBACK_NOT_VERIFIED');
  const manifest={schema:SNAP_SCHEMA,headKey,graphKey,headHash,graphHash,
     fullVerifiedAt:now,checkedAt:now,savedAt:now,signature:sig,
     chartSourceHash,graphRevision:GRAPH_REV,
     ledgerTotal:head.ledgerTotal,total:head.total};
  await env.B46_FAST_KV.put(STATS_META,JSON.stringify(manifest));
  return {mode:'PUBLISHED',ledgerTotal:head.ledgerTotal,total:head.total,
    headBytes:headBody.length,graphBytes:graphBody.length,checkedAt:now};
}
async function stored(env,type){
 const meta=await env.B46_FAST_KV.get(STATS_META,'json');
 const now=Date.now();
 if(!consistent(meta)||now-meta.checkedAt>CHECK_MAX_AGE||
    now-meta.fullVerifiedAt>FULL_RECHECK_INTERVAL+15*60*1000||
    now-meta.savedAt>FULL_RECHECK_INTERVAL+15*60*1000||
    meta.graphRevision!==GRAPH_REV)return null;
 const key=type==='head'?meta.headKey:meta.graphKey;
 const raw=await env.B46_FAST_KV.get(key);
 if(!raw||(await sha(raw))!==(type==='head'?meta.headHash:meta.graphHash))
   return null;
 const data=JSON.parse(raw);
 if(data.schema!==1||data.ok!==true||
    (type==='head'?data.total:data.summary?.rows)!==meta.total||
    (type==='head'?data.snapshotSavedAt:data.asOf)!==meta.savedAt ||
    (type==='head'?Object.hasOwn(data,'rows'):!Array.isArray(data.series?.units)))
    return null;
 return {body:raw,meta};
}
const publicHeaders={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','x-robots-tag':'noindex,nofollow',
 'x-content-type-options':'nosniff'};
const json=(body,status)=>new Response(JSON.stringify(body),{
 status,headers:publicHeaders});
export default {
 async fetch(request,env){
   const url=new URL(request.url);
   if(request.method!=='GET'&&request.method!=='HEAD')return json({ok:false},405);
   if(!['/head','/chart','/health'].includes(url.pathname))
     return json({ok:false,error:'NOT_FOUND'},404);
   try{
     if(url.pathname==='/health'){
       const m=await env.B46_FAST_KV.get(STATS_META,'json');
       return json({ok:consistent(m),checkedAt:m?.checkedAt||null,
         fullVerifiedAt:m?.fullVerifiedAt||null,
         hasFreshCheck:consistent(m)&&Date.now()-m.checkedAt<CHECK_MAX_AGE},200);
     }
     const found=await stored(env,url.pathname==='/head'?'head':'chart');
     if(!found)return json({ok:false,error:'FRESH_VERIFIED_SNAPSHOT_UNAVAILABLE'},503);
     return new Response(request.method==='HEAD'?null:found.body,{status:200,
       headers:{...publicHeaders,'x-b46-snapshot-checked':String(found.meta.checkedAt),
         'x-b46-snapshot-verified':String(found.meta.fullVerifiedAt)}});
   }catch{return json({ok:false,error:'SNAPSHOT_READ_FAILURE'},503)}
 },
 async scheduled(_event,env,ctx){
   ctx.waitUntil(sync(env).then(result=>console.log('B46_FAST_V1_CRON='+JSON.stringify(result)))
     .catch(err=>{console.error('B46_FAST_V1_CRON_FAILED='+String(err))}));
 }
};
