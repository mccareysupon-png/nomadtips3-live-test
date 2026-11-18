// Isolated staging only. Never write to production. The candidate uses Receiver
// settlement rows plus verified legacy metadata; legacy remains an explicit dependency.
import assert from 'node:assert/strict';
import {collect,fingerprint,summarize} from './shadow-seed-snapshot.mjs';
import {readFullBook,compare,auditCredential} from './shadow-seed-audit.mjs';
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
import {buildVerifiedGraph} from '../deploy-assets/ball46-statistics-fast-v1-20261116/graph-core.mjs';
const receiver='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev';
const fields={WIN:'win',LOSS:'loss',HALF_WIN:'halfWin',HALF_LOSS:'halfLoss',PUSH:'push'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const round=n=>Math.round(n*1e8)/1e8;
const headKeys=['ledgerTotal','total','pending','unresolved','win','loss','push','halfWin','halfLoss','version','settlementRevision','statisticsLedgerVersion','statisticsContentRevision','ledgerUpdatedAt','byMarket'];
const marketKey=r=>String(r.market??'');
function projectGraph(rows,at){
 // Existing formula and ordering, no fabricated graph values.
 return buildVerifiedGraph(rows,at).result;
}
function makeView(head,raw,at,origin){
 const pending=raw.filter(r=>r.status==='PENDING'),unresolved=raw.filter(r=>r.status==='UNRESOLVED'),settled=raw.filter(r=>r.status==='SETTLED');
 const graph=projectGraph(raw,at);
 assert.equal(graph.summary.rows,head.total);
 const groups={};
 for(const group of MARKET_GROUPS)groups[group]=[];
 for(const r of raw)groups[marketGroup(marketKey(r))].push(r);
 const marketViews={};
 // Only graphable groups are materialized once per verified generation.
 for(const [group,rows] of Object.entries(groups)){
  const final=rows.filter(r=>r.status==='SETTLED');
  const total=summarize(final.map(r=>({result:r.result,odds:r.odds})));
  marketViews[group]={...total,pending:rows.filter(r=>r.status==='PENDING').length,unresolved:rows.filter(r=>r.status==='UNRESOLVED').length,graph:projectGraph(rows,at)};
 }
 const markets=Object.fromEntries(Object.entries(marketViews).map(([k,v])=>[k,{total:v.total,raw_counts:v.raw_counts,total_pnl:v.total_pnl,win_rate:v.win_rate,pending:v.pending,unresolved:v.unresolved}]));
 return {head:{schema:1,ok:true,mode:'AGGREGATES_ONLY_NOT_HISTORY',source:origin,snapshotSavedAt:at,...Object.fromEntries(headKeys.filter(k=>Object.hasOwn(head,k)).map(k=>[k,head[k]]))},graph,raw,pending,unresolved,marketViews,markets,settled};
}
export async function buildStage(){
 const key=auditCredential();console.log('::add-mask::'+key);
 let src,book,summary;
 for(let i=0;i<4;i++){
  src=await collect({includeRaw:true});book=await readFullBook(key);
  const r=await fetch(receiver+'/audit-statistics-summary-v1',{headers:{authorization:'Bearer '+key,'user-agent':'Mozilla/5.0 B46-Audit'},signal:AbortSignal.timeout(25000)});
  if(r.status!==200)throw Error('COMPACT_RECEIVER_HTTP_'+r.status);
  summary=await r.json();
  if(compare(src,book).exact&&summary.total===book.totals.total&&summary.total_pnl===book.totals.total_pnl&&Math.abs(summary.win_rate-book.totals.win_rate)<1e-9&&Object.keys(book.totals.raw_counts).every(k=>summary.raw_counts[k]===book.totals.raw_counts[k]))break;
  if(i===3)throw Error('STAGING_SOURCE_REVISION_MISMATCH');
  await pause(1200);
 }
 assert.equal(book.seed.status,'loaded');
 const at=Date.now(),byId=new Map(book.rows.map(r=>[r.signal_id,r]));
 const raw=src.rawRows.map(r=>{
  if(r.status!=='SETTLED')return {...r};
  const b=byId.get(String(r.id));assert(b,'MISSING_RECEIVER_SETTLED');
  // Preserve UI's raw types and metadata after the exact normalized match.
  return {...r,result:b.result,settledAt:b.settled_at,market:b.market_type,odds:typeof r.odds==='string'&&b.odds!==null?String(b.odds):b.odds};
 });
 const head={...src.head,total:summary.total};
 for(const [result,field] of Object.entries(fields))head[field]=summary.raw_counts[result];
 const old=makeView(src.head,src.rawRows,at,'LEGACY_VERIFIED');
 const next=makeView(head,raw,at,'RECEIVER_SETTLED_LEGACY_PENDING_METADATA');
 const cleanGraph=g=>JSON.stringify({...g,source:undefined});
 assert.equal(cleanGraph(old.graph),cleanGraph(next.graph),'ALL_GRAPH_PARITY');
 for(const k of MARKET_GROUPS){
  assert.deepEqual(old.markets[k],next.markets[k]);
  assert.equal(cleanGraph(old.marketViews[k].graph),cleanGraph(next.marketViews[k].graph),'MARKET_GRAPH_PARITY_'+k);
 }
 assert.deepEqual(old.pending,next.pending);assert.deepEqual(old.unresolved,next.unresolved);
 assert.equal(next.pending.length,src.head.pending);assert.equal(next.unresolved.length,src.head.unresolved);
 assert.equal(round(next.graph.summary.net),summary.total_pnl);
 assert.equal(Object.values(next.markets).reduce((a,b)=>a+b.total,0),summary.total);
 assert.equal(Object.values(next.markets).reduce((a,b)=>a+b.pending,0),next.pending.length);
 console.log('STAGE_API_PARITY='+JSON.stringify({settled:summary.total,pnl:summary.total_pnl,winRate:summary.win_rate,pending:next.pending.length,unresolved:next.unresolved.length,rawRows:raw.length,marketGroups:next.markets,series:Object.fromEntries(Object.entries(next.graph.series).map(([k,v])=>[k,v.length])),headBytes:Buffer.byteLength(JSON.stringify(next.head)),chartBytes:Buffer.byteLength(JSON.stringify(next.graph)),sourceHash:src.hash,receiverHash:book.hash,pendingSource:'LEGACY_READ_ONLY',detailsSource:'LEGACY_READ_ONLY',graphMode:'PRECOMPUTED_ONCE_PER_STAGE_GENERATION',noProductionWrites:true}));
 return {old,next,at,summary};
}
export function createAdapter(stage){
 let mode='legacy';let available=true;
 // Default is fail-safe. Switch is staging-process-local, not production configuration.
 const setMode=v=>{if(!['legacy','receiver'].includes(v))throw Error('INVALID_SOURCE_MODE');mode=v;};
 const setAvailable=v=>{available=v===true};
 function response(path,search=''){
  const source=mode==='receiver'&&available?'receiver':'legacy',v=source==='receiver'?stage.next:stage.old;
  const q=new URLSearchParams(search);
  let body;
  if(path==='/b46-fast-v1/head')body=v.head;
  else if(path==='/b46-fast-v1/chart')body=v.graph;
  else if(path==='/_stage/pending')body={ok:true,source:'LEGACY_READ_ONLY',count:v.pending.length,rows:v.pending};
  else if(path==='/_stage/market'){
   const market=q.get('market')??'AH';if(!Object.hasOwn(v.marketViews,market))return {status:400,body:{ok:false}};body={ok:true,...v.marketViews[market]};
  }else if(path==='/api/engine/statistics'){
   const cursor=q.get('cursor'),start=cursor?Number(cursor):0;
   if(!Number.isSafeInteger(start)||start<0||start>v.raw.length)return {status:400,body:{ok:false}};
   if(q.has('paged')){
    const end=Math.min(start+500,v.raw.length);
    body={...v.head,rows:v.raw.slice(start,end),hasMore:end<v.raw.length,nextCursor:end<v.raw.length?String(end):null};
   }else body={...v.head,rows:v.raw,hasMore:false,nextCursor:null};
  }else return null;
  return {status:200,body,source};
 }
 return {setMode,setAvailable,response,getMode:()=>mode};
}
