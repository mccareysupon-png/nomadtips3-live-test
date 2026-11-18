// No cloud mutation. Actual Receiver Book implementation cloned in the CI process only.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {buildStage} from './shadow-cutover-stage-adapter.mjs';
import {createProjection} from './shadow-stage-live-projection.mjs';
import {summarize} from './shadow-seed-snapshot.mjs';
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
import {buildVerifiedGraph} from '../deploy-assets/ball46-statistics-fast-v1-20261116/graph-core.mjs';
import {normalizeRow} from './shadow-composite-cursor-stage.mjs';
const all=['all',...MARKET_GROUPS];
const tol=(a,b,label)=>{if(typeof a==='number'&&typeof b==='number')assert(Math.abs(a-b)<1e-7,label+':'+a+'!='+b);else assert.equal(a,b,label)};
function compareGraph(proj,raw){
 for(const group of all){
  const rows=group==='all'?raw:raw.filter(r=>marketGroup(r.market)===group);
  const expected=buildVerifiedGraph(rows,123456789).result,g=proj.readGraph(group);
  for(const k of Object.keys(expected.summary))tol(g.summary[k],expected.summary[k],group+':'+k);
  for(const key of ['units','roi','rate']){
   assert.equal(g.series[key].length,expected.series[key].length,group+':'+key+':len');
   for(let i=0;i<g.series[key].length;i++){assert.equal(g.series[key][i].date,expected.series[key][i].date,group+':'+key+':date:'+i);tol(g.series[key][i].value,expected.series[key][i].value,group+':'+key+':value:'+i)}
  }
 }
}
function makeStore(){
 const m=new Map();let current=m;
 const get=async k=>structuredClone(current.get(k)),put=async(k,v)=>{current.set(k,structuredClone(v))},del=async k=>current.delete(k);
 const x={get,put,delete:del,list:async(o={})=>new Map([...current].filter(([k])=>k.startsWith(o.prefix??'')&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,o.limit??1000).map(([k,v])=>[k,structuredClone(v)])),transaction:async fn=>{const draft=new Map(m);current=draft;try{const v=await fn(x);m.clear();for(const [k,v] of draft)m.set(k,v);return v}finally{current=m}}};return x;
}
const temp=new URL('./.stage-book-local-only.mjs',import.meta.url);
let source=await readFile(new URL('./shadow-production-receiver.mjs',import.meta.url),'utf8');
const anchor=" await tx.put(key,row);\n return {duplicate:false,corrected:!!prior,stale:false};";
assert.equal(source.split(anchor).length,2,'STAGE_HOOK_ANCHOR_DRIFT');
source=source.replace("import {WorkerEntrypoint} from 'cloudflare:workers';","class WorkerEntrypoint {}\nimport {stageJournalAccepted} from './shadow-stage-live-projection.mjs';").replace(anchor," await tx.put(key,row);\n await stageJournalAccepted(tx,prior,row);\n return {duplicate:false,corrected:!!prior,stale:false};");
await writeFile(temp,source);
let ShadowProductionStore;try{({ShadowProductionStore}=await import(temp.href))}finally{await unlink(temp)}
const replay=await buildStage(),base=replay.next.raw;
const newest=base.filter(r=>r.status==='SETTLED').reduce((a,b)=>!a||Number(b.settledAt)>Number(a.settledAt)?b:a,null);
assert(newest);
const baseline=base.filter(r=>r.id!==newest.id),projection=createProjection(baseline,{at:replay.at}),storage=makeStore(),book=new ShadowProductionStore({storage},{});
const baselineSettled=baseline.filter(r=>r.status==='SETTLED').map(normalizeRow),tot=summarize(baselineSettled);
for(const r of baselineSettled)await storage.put('composite:receipt:'+r.signal_id,r);
const cursor=baselineSettled.reduce((a,b)=>!a||b.settled_at>a.settled_at||b.settled_at===a.settled_at&&b.signal_id>a.signal_id?b:a,null);
await storage.put('composite:state',{...tot.raw_counts,total:tot.total,pnl_schema:1,unknown_pnl:0,pnl_units:Math.round(tot.total_pnl*1e8),total_pnl:tot.total_pnl,winRate:tot.win_rate,cursor:{signal_id:cursor.signal_id,settled_at:cursor.settled_at},corrections:0});
const post=async row=>book.fetch(new Request('https://book.internal/book-post',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(row)}));
const consume=async (seq,meta)=>{const event=await storage.get('stage:projection:event:'+String(seq).padStart(16,'0'));assert(event,'MISSING_BOOK_EVENT');return projection.apply(event,meta)};
let start=performance.now();const response=await post(normalizeRow(newest));assert.equal(response.status,200);const committed=await consume(1,newest);const latency=performance.now()-start;
compareGraph(projection,base);
const duplicate=await post(normalizeRow(newest));assert.equal((await duplicate.json()).duplicate,true);assert.equal(await storage.get('stage:projection:sequence'),1);
assert.equal((await consume(1,newest)).duplicate,true);
const bookState=await storage.get('composite:state');tol(bookState.total_pnl,replay.summary.total_pnl,'REPLAY_BOOK_PNL');assert.equal(bookState.total,replay.summary.total);
console.log('STAGE_REAL_BOOK_REPLAY='+JSON.stringify({settled:bookState.total,market:marketGroup(newest.market),allMarkets:8,commitToProjectionMs:Math.round(latency*100)/100,affectedBuckets:committed.buckets,affectedRows:committed.rows,duplicateIdempotent:true,productionWrites:0}));
const pending=projection.pendingPage({limit:50});assert.equal(pending.pending,replay.next.pending.length);
const pendingIds=[];for(let i=0;i<pending.total;i+=50){const page=projection.pendingPage({offset:i});pendingIds.push(...page.rows.map(r=>r.id));for(const r of page.rows)assert.deepEqual(projection.detail(r.id),r)}
assert.deepEqual(new Set(pendingIds),new Set(replay.next.pending.map(r=>r.id)));
const hist=projection.historyPage({limit:50});assert.equal(hist.total,bookState.total);
for(const r of hist.rows){assert.deepEqual(projection.detail(r.id),r);assert.equal(r.status,'SETTLED')}
for(const group of MARKET_GROUPS){const v=projection.historyPage({market:group});assert.equal(v.total,projection.readGraph(group).summary.rows);assert(v.rows.every(r=>marketGroup(r.market)===group))}
console.log('STAGE_PENDING_DETAIL_PARITY='+JSON.stringify({pending:pending.pending,pendingUnique:pendingIds.length,archive:hist.total,firstPage:hist.rows.length,detailFields:hist.rows.length?Object.keys(hist.rows[0]).length:0,graphUnchanged:true,pendingSource:'VERIFIED_LEGACY_SNAPSHOT',productionWrites:0}));
const map={AH:'ft_ah','1X2':'ft_1x2','O/U':'ft_over',Corners:'ft_corners_over',BTTS:'ft_btts',Cards:'ft_cards_over',Other:'special_test'};
const meta=Object.entries(map).map(([group,market],i)=>({id:'STAGE-ONLY-'+i,market,createdAt:replay.at+100+i,status:'PENDING',home:'Stage team A',away:'Stage team B',league:'STAGING TEST ONLY',selection:'Over',line:2.5,odds:2.06}));
const newPending={rows:[...replay.next.pending,...replay.next.unresolved,...meta],pending:pending.pending+meta.length,unresolved:replay.next.unresolved.length,verifiedAt:Date.now()+200};
projection.refreshPending(newPending);
const expected=[...base,...meta];let sequence=1,checks=0;
const updateExpected=r=>{const i=expected.findIndex(x=>x.id===r.id);assert(i>=0);expected[i]=r;expected.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt))};
for(let i=0;i<meta.length;i++){
 const m=meta[i],r={...m,status:'SETTLED',result:i%2?'HALF_LOSS':'WIN',settledAt:replay.at+1000+i,odds:2.06};
 assert.equal((await post(normalizeRow(r))).status,200);await consume(++sequence,m);updateExpected(r);
 const diff=projection.readGraph(marketGroup(m.market));assert(diff.summary.rows>=1);
 assert.equal(projection.detail(m.id).status,'SETTLED');
 checks++;
}
compareGraph(projection,expected);
assert.equal(projection.pendingPage().pending,pending.pending);
const correction={...expected.find(r=>r.id===meta[0].id),result:'HALF_LOSS',settledAt:replay.at+86400000+5000};
assert.equal((await post(normalizeRow(correction))).status,200);const revised=await consume(++sequence,correction);updateExpected(correction);
compareGraph(projection,expected);
const after=await storage.get('composite:state');tol(after.total_pnl,projection.readGraph().summary.net,'CORRECTION_PNL');assert.equal(after.total,projection.readGraph().summary.rows);
assert.equal(revised.buckets,4);assert.throws(()=>projection.historyPage({expectedGeneration:hist.generation}),/HISTORY_GENERATION/);
assert.throws(()=>projection.apply({seq:sequence+2,next:normalizeRow(correction)},correction),/SEQUENCE_GAP/);
assert.equal(projection.status().ready,false);
console.log('STAGE_INCREMENTAL_GRAPH_TEST='+JSON.stringify({marketGroups:checks,allMarketReferenceParity:true,correctionAcrossDays:true,pendingTransition:true,duplicateSafe:true,sequenceGapFailClosed:true,affectedBuckets:revised.buckets,affectedRows:revised.rows,syntheticEventsOnlyInLocalBook:true,productionWrites:0}));
