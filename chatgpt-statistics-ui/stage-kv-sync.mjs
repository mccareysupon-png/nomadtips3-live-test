// BALL46 STAGING ONLY. Precompute fully verified public Ledger, publish atomically to isolated KV.
// No writes to ball46-production, source Ledger, market calculations, WAF, or Production KV.
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createCompactSummary} from './compact-summary-stage.mjs';
import {buildVerifiedGraph,verifyChartSourceContract} from './chart-series-stage.mjs';
import {seedMarketAccounts,marketSnapshot} from './market-accounting-stage.mjs';
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc';
const NAMESPACE='f144dc8b6525477984067f7ab5762924';
const BASE='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/storage/kv/namespaces/'+NAMESPACE;
const SOURCE='https://www.ball46.com/api/engine/statistics';
const META='verified-full-meta-v1';
// Counts alone cannot reveal corrections to odds/dates within historical rows.
// Force a full staging-only reconciliation on the next build at least hourly.
const MAX_FULL_RECHECK_MS=60*60*1000;
const GRAPH_BUILD_REVISION='daily-kpi-v2-20261116';
const HEAD_BUILD_REVISION='daily-home-london-v1-20261117';
const RESULTS={WIN:'win',LOSS:'loss',PUSH:'push',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss'};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function signature(x){
  // ledgerUpdatedAt is a SYNC clock; it changes even when Ledger content does not.
  // Stage consistency check uses aggregate counts, market totals and schema/formula revision.
  const markets=x.byMarket&&typeof x.byMarket==='object'
    ? Object.keys(x.byMarket).sort().map(key=>[key,x.byMarket[key]]) : [];
  return JSON.stringify([x.ledgerTotal,x.total,x.pending,x.unresolved,x.win,x.loss,
    x.push,x.halfWin,x.halfLoss,x.version,x.settlementRevision,
    x.statisticsLedgerVersion,x.statisticsContentRevision||null,markets]);
}
const outcome=r=>String(r?.result||r?.settlement||r?.outcome||'').trim().toUpperCase();
const isSettled=r=>Object.hasOwn(RESULTS,outcome(r))&&
   (!r.status||String(r.status).toUpperCase()==='SETTLED');
export function verifyRows(first,all){
  if(!Number.isSafeInteger(first.ledgerTotal)||all.length!==first.ledgerTotal)
    throw Error('LEDGER_LENGTH_MISMATCH');
  const ids=new Set(),counts={WIN:0,LOSS:0,PUSH:0,HALF_WIN:0,HALF_LOSS:0};
  let settled=0,pending=0,unresolved=0;
  for(const row of all){
    if(!row?.id||ids.has(String(row.id)))throw Error('MISSING_OR_DUPLICATE_ID');
    ids.add(String(row.id));
    if(isSettled(row)){settled++;counts[outcome(row)]++}
    if(row.status==='PENDING')pending++;
    if(row.status==='UNRESOLVED')unresolved++;
  }
  if(settled!==first.total||pending!==first.pending||unresolved!==first.unresolved)
    throw Error('SETTLEMENT_TOTALS_NOT_EQUAL_SOURCE');
  for(const [result,field] of Object.entries(RESULTS))
    if(counts[result]!==first[field])throw Error('SETTLEMENT_COUNT_MISMATCH_'+field);
  return true;
}
export async function buildSnapshot(readPage){
  const first=await readPage();
  if(first?.ok!==true||!Array.isArray(first.rows))throw Error('INVALID_HEAD');
  let current=first,rows=[],seenCursor=new Set();
  for(let i=0;i<150;i++){
    if(signature(current)!==signature(first))throw Error('REVISION_CHANGED_DURING_PAGES');
    if(!Array.isArray(current.rows)||!current.rows.length)throw Error('EMPTY_PAGE');
    rows.push(...current.rows);
    if(!current.nextCursor){
      if(current.hasMore)throw Error('CURSOR_MISSING');
      break;
    }
    if(seenCursor.has(current.nextCursor))throw Error('CURSOR_LOOP');
    seenCursor.add(current.nextCursor);
    current=await readPage(current.nextCursor);
    if(i===149)throw Error('PAGE_LIMIT_EXCEEDED');
  }
  verifyRows(first,rows);
  // Ensure a mutable source did not change while all cursor pages were being read.
  const lastHead=await readPage();
  if(signature(lastHead)!==signature(first))throw Error('REVISION_CHANGED_AFTER_FULL_READ');
  return {...first,rows,returned:rows.length,nextCursor:null,hasMore:false,
    snapshotSavedAt:Date.now(),snapshotMode:'B46_STAGING_VERIFIED_PUBLIC_LEDGER_V2',stale:true};
}
export async function readPage(cursor){
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const u=new URL(SOURCE);
      u.searchParams.set('paged','1');
      if(cursor)u.searchParams.set('cursor',cursor);
      u.searchParams.set('_',String(Date.now()+attempt));
      const r=await fetch(u,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error('SOURCE_HTTP_'+r.status);
      if(!(r.headers.get('content-type')||'').toLowerCase().includes('application/json'))
        throw Error('NON_JSON_SOURCE');
      const d=await r.json();
      if(d?.ok!==true||!Array.isArray(d.rows))throw Error('SOURCE_PAGE_INVALID');
      return d;
    }catch(e){
      lastError=e;
      if(attempt<2)await sleep((attempt+1)*350);
    }
  }
  throw lastError||Error('SOURCE_PAGE_FAILED');
}
async function apiGet(key,token,parse='json'){
  const url=BASE+'/values/'+encodeURIComponent(key);
  const r=await fetch(url,{headers:{Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000)});
  if(r.status===404)return null;
  if(!r.ok)throw Error('KV_GET_'+key+'_HTTP_'+r.status);
  return parse==='json'?r.json():r.arrayBuffer();
}
async function apiPut(key,body,type,token){
  const r=await fetch(BASE+'/values/'+encodeURIComponent(key),{
    method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':type},
    body,signal:AbortSignal.timeout(45000)});
  const js=await r.json();
  if(!r.ok||js.success!==true)throw Error('KV_WRITE_'+key+'_HTTP_'+r.status);
}
async function apiDelete(key,token){
  const r=await fetch(BASE+'/values/'+encodeURIComponent(key),{
    method:'DELETE',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('KV_DELETE_'+key+'_HTTP_'+r.status);
}
export async function execute(){
  const token=process.env.CLOUDFLARE_API_TOKEN||'';
  if(!token)throw Error('NO_CLOUDFLARE_CREDENTIAL');
  let before=null;
  try{before=await apiGet(META,token)}catch(e){throw Error('CANNOT_READ_CURRENT_STAGE_POINTER_'+e.message)}
  // Guard graph formulas against current source drift before accepting fast path.
  const chartSourceResp=await fetch('https://www.ball46.com/longterm-performance-343.js',{
    signal:AbortSignal.timeout(20000)});
  if(!chartSourceResp.ok)throw Error('CHART_SOURCE_HTTP_'+chartSourceResp.status);
  const chartSource=await chartSourceResp.text();
  verifyChartSourceContract(chartSource);
  const chartSourceSha=createHash('sha256').update(chartSource).digest('hex');
  // Fast path: unchanged aggregation + confirmed same chart formula/source.
  const latest=await readPage();
  if(before?.schema===2&&before.key&&before.summaryKey&&before.chartKey&&
     /^verified-head-v1-[0-9a-f]{32}$/.test(before.summaryKey)&&
     /^verified-chart-v1-[0-9a-f]{32}$/.test(before.chartKey)&&
     before.chartSourceSha===chartSourceSha&&
     before.graphBuildRevision===GRAPH_BUILD_REVISION&&before.marketAccountingRevision==='seven-market-v1'&&
     before.headBuildRevision===HEAD_BUILD_REVISION&&
     Date.now()-Number(before.fullVerifiedAt||before.savedAt||0)<MAX_FULL_RECHECK_MS&&
     before.sourceSignature===signature(latest)){
    await apiPut(META,JSON.stringify({...before,checkedAt:Date.now()}),
      'application/json',token);
    console.log('B46_STAGE_SYNC='+JSON.stringify({mode:'UNCHANGED',ledgerTotal:latest.ledgerTotal,sourceSignature:signature(latest),stageOnly:true}));
    return {changed:false,ledgerTotal:latest.ledgerTotal};
  }
  // Rebuild source from scratch only on actual signature change; verify again at end.
  let snapshot,lastError;
  for(let attempt=0;attempt<2;attempt++){
    try{snapshot=await buildSnapshot(readPage);break}
    catch(e){lastError=e;console.log('B46_STAGE_SYNC_RETRY='+JSON.stringify({attempt:attempt+1,error:e.message}));}
  }
  if(!snapshot)throw lastError||Error('SOURCE_CHANGED');
  // Fast-path projection is derived ONLY after the complete Ledger passes verification.
  const compact=createCompactSummary(snapshot,verifyRows);
  const graph=buildVerifiedGraph(snapshot.rows,snapshot.snapshotSavedAt);
  if(graph.result.summary.rows!==snapshot.total||
     graph.result.summary.wins!==snapshot.win+snapshot.halfWin||
     graph.result.summary.losses!==snapshot.loss+snapshot.halfLoss||
     graph.result.summary.pushes!==snapshot.push)
    throw Error('CHART_COUNTS_MISMATCH_SOURCE');
  // Isolated staging projection: seven groups seeded only from verified live Ledger.
  const groupedRows=snapshot.rows.map(row=>({...row,market:marketGroup(row.market)}));
  const marketBook=seedMarketAccounts({...snapshot,rows:groupedRows});
  const marketView=marketSnapshot(marketBook);
  for(const group of MARKET_GROUPS){
    if(!marketView.byMarket[group])marketView.byMarket[group]=marketSnapshot(seedMarketAccounts({ok:true,rows:[],ledgerTotal:0,total:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,snapshotSavedAt:snapshot.snapshotSavedAt})).all;
  }
  for(const field of Object.keys(marketBook.all.stats))
    if(Object.values(marketView.byMarket).reduce((n,a)=>n+a[field],0)!==snapshot[field])
      throw Error('STAGING_MARKET_TOTAL_MISMATCH_'+field);
  const marketBody=JSON.stringify(marketView);
  const marketSha=createHash('sha256').update(marketBody).digest('hex');
  const marketKey='verified-markets-v1-'+marketSha.slice(0,32);
  const chartSha=createHash('sha256').update(graph.body).digest('hex');
  const chartKey='verified-chart-v1-'+chartSha.slice(0,32);
  const summarySha=createHash('sha256').update(compact.body).digest('hex');
  const summaryKey='verified-head-v1-'+summarySha.slice(0,32);
  const raw=Buffer.from(JSON.stringify(snapshot),'utf8');
  const gz=gzipSync(raw,{level:6});
  if(gz.length>24000000)throw Error('STAGE_KV_MAX_24MB');
  const sha=createHash('sha256').update(gz).digest('hex');
  const key='verified-full-gzip-v2-'+sha.slice(0,32);
  const meta={schema:2,key,savedAt:snapshot.snapshotSavedAt,
    fullVerifiedAt:snapshot.snapshotSavedAt,checkedAt:Date.now(),
    sourceSignature:signature(snapshot),ledgerTotal:snapshot.ledgerTotal,
    summaryKey,summaryBytes:compact.bytes,summarySha256:summarySha,
    chartKey,chartBytes:graph.bytes,chartSha256:chartSha,chartSourceSha,
    graphBuildRevision:GRAPH_BUILD_REVISION,
    headBuildRevision:HEAD_BUILD_REVISION,
    marketAccountingRevision:'seven-market-v1',marketKey,marketSha256:marketSha,
    settled:snapshot.total,rawBytes:raw.length,gzipBytes:gz.length,sha256:sha,
    previousKeys:[before?.key,...(before?.previousKeys||[])].filter(x=>typeof x==='string'&&x.startsWith('verified-full-gzip-v2-')&&x!==key).slice(0,2),
    source:'PUBLIC_PRODUCTION_READ_ONLY',target:'STAGING_KV_ONLY'};
  // Versioned immutable body first, stable manifest POINTER LAST. Failed builds keep old pointer.
  await apiPut(key,gz,'application/octet-stream',token);
  await apiPut(summaryKey,compact.body,'application/json',token);
  await apiPut(chartKey,graph.body,'application/json',token);
  // Check that the newly published immutable body can be read before moving the pointer.
  const readback=await apiGet(key,token,'arrayBuffer');
  if(!readback||createHash('sha256').update(Buffer.from(readback)).digest('hex')!==sha)
    throw Error('KV_READBACK_HASH_MISMATCH');
  const headReadback=await apiGet(summaryKey,token,'arrayBuffer');
  if(!headReadback||createHash('sha256').update(Buffer.from(headReadback)).digest('hex')!==summarySha)
    throw Error('KV_COMPACT_READBACK_HASH_MISMATCH');
  const graphReadback=await apiGet(chartKey,token,'arrayBuffer');
  if(!graphReadback||createHash('sha256').update(Buffer.from(graphReadback)).digest('hex')!==chartSha)
    throw Error('KV_GRAPH_READBACK_HASH_MISMATCH');
  await apiPut(marketKey,marketBody,'application/json',token);
  const marketReadback=await apiGet(marketKey,token,'arrayBuffer');
  if(!marketReadback||createHash('sha256').update(Buffer.from(marketReadback)).digest('hex')!==marketSha)
    throw Error('KV_MARKET_READBACK_HASH_MISMATCH');
  await apiPut(META,JSON.stringify(meta),'application/json',token);
  console.log('B46_STAGE_SYNC='+JSON.stringify({mode:'PUBLISHED',ledgerTotal:meta.ledgerTotal,
    bytes:meta.gzipBytes,summaryBytes:meta.summaryBytes,chartBytes:meta.chartBytes,key:meta.key,
    sourceSignature:meta.sourceSignature,stageOnly:true}));
  // Retain 3 complete versions; garbage collection failure is non-fatal.
  try{
    const q=new URL(BASE+'/keys');q.searchParams.set('prefix','verified-full-gzip-v2-');q.searchParams.set('limit','1000');
    const r=await fetch(q,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
    if(r.ok){
      const d=await r.json();
      const keep=new Set([key,...meta.previousKeys]);
      for(const k of d.result||[]){
        if(k.name?.startsWith('verified-full-gzip-v2-')&&!keep.has(k.name))
          await apiDelete(k.name,token);
      }
    }
  }catch(e){console.warn('B46_STAGE_KV_GC_SKIPPED='+e.message)}
  return{changed:true,ledgerTotal:meta.ledgerTotal,key};
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
  execute().catch(e=>{console.error('B46_STAGE_SYNC_FAILED='+String(e));process.exitCode=1});
}
