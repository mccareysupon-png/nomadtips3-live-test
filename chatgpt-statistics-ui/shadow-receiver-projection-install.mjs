// Authorized Receiver-only projection bootstrap / independent GET audit / local tests.
// No Engine/site writes. Raw source and credentials remain runner-local.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {collect,fingerprint,summarize} from './shadow-seed-snapshot.mjs';
import {readFullBook,compare,auditCredential} from './shadow-seed-audit.mjs';
import {normalizeRow} from './shadow-composite-cursor-stage.mjs';
import {marketGroup,MARKET_GROUPS} from './market-groups-stage.mjs';
import {buildVerifiedGraph} from '../deploy-assets/ball46-statistics-fast-v1-20261116/graph-core.mjs';
import {projectionHandle,projectionAlarm,projectionConstants} from './shadow-receiver-projection-v1.mjs';
const endpoint='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev',groups=['all',...MARKET_GROUPS];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const key=auditCredential();console.log('::add-mask::'+key);
async function get(path,auth=key){
 const start=performance.now(),r=await fetch(endpoint+path,{headers:{'user-agent':'Mozilla/5.0 B46-Projection-QA',...(auth?{authorization:'Bearer '+auth}:{})},redirect:'manual',signal:AbortSignal.timeout(25000)}),text=await r.text();
 return {status:r.status,data:JSON.parse(text),bytes:Buffer.byteLength(text),ms:Math.round(performance.now()-start)};
}
async function coherentSnapshot(){
 for(let attempt=1;attempt<=4;attempt++){
  const source=await collect({includeRaw:true}),book=await readFullBook(key);
  if(compare(source,book).exact&&Number.isSafeInteger(book.aggregate?.corrections)&&book.aggregate.corrections>=0){
   return {source,book,sequence:book.totals.total+book.aggregate.corrections};
  }
  if(attempt<4)await wait(1000);
 }
 throw Error('COHERENT_SNAPSHOT_NOT_AVAILABLE');
}
function prepare(snapshot){
 const {source,book,sequence}=snapshot,days=new Map(),pending=[];
 for(const [rank,r] of source.rawRows.entries()){
  if(r.status!=='SETTLED'){pending.push(r);continue}
  const n=normalizeRow(r),day=projectionConstants.dayKey(n.settled_at);
  if(!days.has(day))days.set(day,[]);
  days.get(day).push({id:n.signal_id,createdAt:Number(r.createdAt),settledAt:n.settled_at,market:n.market_type,result:n.result,status:'SETTLED',odds:n.odds==null?null:Number(n.odds),_rank:rank});
 }
 const sorted=[...days].sort(([a],[b])=>a.localeCompare(b)),chunks=[];
 for(let i=0;i<pending.length;i+=50)chunks.push(pending.slice(i,i+50));
 const manifest={sourceHash:source.hash,sourceSignature:source.sourceSignature,sequence,corrections:book.aggregate.corrections,asOf:source.cutoff,expected:book.totals,pending:source.other.PENDING,unresolved:source.other.UNRESOLVED,days:sorted.map(([day,rows])=>({day,count:rows.length,hash:fingerprint(rows)})),pendingHashes:chunks.map(fingerprint)};
 for(const [,rows] of sorted)if(Buffer.byteLength(JSON.stringify(rows))>1500000)throw Error('DAY_STORAGE_LIMIT');
 return {manifest,manifestHash:fingerprint(manifest),days:sorted,chunks};
}
async function seedWith(send,p){
 const check=async body=>{const r=await send(body);if(r.status!==200||!r.data?.ok)throw Error('PROJECTION_SEED_'+r.status+'_'+JSON.stringify(r.data).slice(0,160));return r.data.state};
 await check({action:'begin',manifest:p.manifest});
 let state;
 for(let i=0;i<p.days.length;i++){state=await check({action:'day',manifestHash:p.manifestHash,index:i,rows:p.days[i][1]});if((i+1)%10===0)console.log('PROJECTION_SEED_DAYS='+String(i+1));}
 for(let i=0;i<p.chunks.length;i++)await check({action:'pending',manifestHash:p.manifestHash,index:i,rows:p.chunks[i]});
 state=await check({action:'finish',manifestHash:p.manifestHash});assert.equal(state.status,'loaded');return state;
}
const near=(a,b,label)=>{if(typeof a==='number'&&typeof b==='number')assert(Math.abs(a-b)<1e-7,label+': '+a+' != '+b);else assert.equal(a,b,label)};
function compareGraph(data,rows,market){
 const subset=market==='all'?rows:rows.filter(r=>marketGroup(r.market)===market);
 const g=buildVerifiedGraph(subset,123456789).result;
 assert.equal(data.summary.rows,g.summary.rows);
 for(const k of Object.keys(g.summary))near(data.summary[k],g.summary[k],market+':'+k);
 for(const k of ['units','roi','rate']){
  assert.equal(data.series[k].length,g.series[k].length,market+':'+k+':length');
  for(let i=0;i<g.series[k].length;i++){assert.equal(data.series[k][i].date,g.series[k][i].date);near(data.series[k][i].value,g.series[k][i].value,market+':'+k+':'+i)}
 }
 const a=summarize(subset.filter(x=>x.status==='SETTLED').map(normalizeRow));
 assert.deepEqual(data.counts,a.raw_counts);near(data.win_rate,a.win_rate,market+':book_win_rate');
 return {market,count:a.total,pnl:a.total_pnl,winRate:a.win_rate,graphPoints:data.series.units.length};
}
function mockStorage(){
 const m=new Map();let target=m,alarm=null;
 const x={get:async k=>structuredClone(target.get(k)),put:async(k,v)=>{target.set(k,structuredClone(v))},delete:async k=>target.delete(k),list:async(o={})=>new Map([...target].filter(([k])=>k.startsWith(o.prefix??'')&&(!o.startAfter||k>o.startAfter)).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,o.limit??1000).map(([k,v])=>[k,structuredClone(v)])),transaction:async fn=>{const draft=new Map(m);target=draft;try{const v=await fn(x);m.clear();for(const [k,v] of draft)m.set(k,v);return v}finally{target=m}},getAlarm:async()=>alarm,setAlarm:async n=>{alarm=n}};return x;
}
async function result(r){return {status:r.status,data:await r.json()}}
async function local(){
 const snapshot=await coherentSnapshot(false),prepared=prepare(snapshot),raw=[...snapshot.source.rawRows],bookStore=mockStorage(),projectStore=bookStore;
 let src=await readFile(new URL('./shadow-production-receiver.mjs',import.meta.url),'utf8');
 src=src.replace("import {WorkerEntrypoint} from 'cloudflare:workers';","class WorkerEntrypoint {}");
 const temp=new URL('./.projection-local-only.mjs',import.meta.url);await writeFile(temp,src);
 let ShadowProductionStore,worker;try{({ShadowProductionStore,default:worker}=await import(temp.href))}finally{await unlink(temp)}
 const objects={},env={AUDIT_TOKEN:'a'.repeat(64),PROJECTION_SEED_TOKEN:'b'.repeat(64),SHADOW_STORE:{idFromName:n=>n,get:n=>({fetch:(url,init)=>objects[n].fetch(new Request(url,init))})}};
 const book=objects['book-v1']=new ShadowProductionStore({storage:bookStore,waitUntil:()=>{}},env);

 for(const r of snapshot.book.rows)await bookStore.put('composite:receipt:'+r.signal_id,r);
 const t=snapshot.book.totals,cursor=snapshot.book.rows.reduce((a,b)=>!a||b.settled_at>a.settled_at||b.settled_at===a.settled_at&&b.signal_id>a.signal_id?b:a,null);
 await bookStore.put('composite:state',{...t.raw_counts,total:t.total,total_pnl:t.total_pnl,winRate:t.win_rate,pnl_units:Math.round(t.total_pnl*1e8),unknown_pnl:0,pnl_schema:1,corrections:snapshot.book.aggregate.corrections,cursor:{signal_id:cursor.signal_id,settled_at:cursor.settled_at}});
 const req=(path,body)=>new Request('https://store.internal'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined);
 const statusURL='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev/audit-projection-status-v1';
 const unseeded=await worker.fetch(new Request(statusURL,{headers:{authorization:'Bearer '+env.AUDIT_TOKEN}}),env);
 assert.equal(unseeded.status,200);const jd=await unseeded.json();assert.equal(jd.bookSequence,snapshot.sequence);assert.equal(jd.bookAggregate.total,t.total);assert.equal(jd.graphReady,false);
 assert.equal((await worker.fetch(new Request(statusURL),env)).status,403);
 const send=async body=>result(await projectionHandle(projectStore,env,req('/projection-seed-v1',body)));
 const seed=await seedWith(send,prepared);
 const graph=market=>projectionHandle(projectStore,env,req('/projection-graph-v1?market='+encodeURIComponent(market))).then(result);
 for(const market of groups){const r=await graph(market);assert.equal(r.status,200);compareGraph(r.data,raw,market)}
 const pending=await result(await projectionHandle(projectStore,env,req('/projection-pending-snapshot-v1')));
 assert.equal(pending.data.total,snapshot.source.other.PENDING+snapshot.source.other.UNRESOLVED);assert.equal(pending.data.live,false);
 const live=await result(await projectionHandle(projectStore,env,req('/projection-pending-v1')));assert.equal(live.status,503);
 const post=row=>resultFromBook(book,req('/book-post',row));
 const p=raw.find(r=>r.status==='PENDING');assert(p,'NO_REAL_PENDING_FOR_LOCAL_TEST');
 const settled={...p,status:'SETTLED',result:'WIN',odds:2.06,settledAt:Date.now()+12345};
 let r=await post(normalizeRow(settled));assert.equal(r.status,200);assert.equal((await graph('all')).status,503);
 await projectionAlarm(projectStore,env);
 raw[raw.findIndex(x=>x.id===p.id)]=settled;
 for(const k of groups)compareGraph((await graph(k)).data,raw,k);
 const before=await bookStore.get(projectionConstants.journalSeq);assert.equal(before,snapshot.sequence+1);
 r=await post(normalizeRow(settled));assert.equal(r.data.duplicate,true);assert.equal(await bookStore.get(projectionConstants.journalSeq),before);
 const correction={...settled,result:'HALF_LOSS',settledAt:settled.settledAt+86400000};
 r=await post(normalizeRow(correction));assert.equal(r.data.corrected,true);
 await projectionAlarm(projectStore,env);raw[raw.findIndex(x=>x.id===p.id)]=correction;
 for(const k of groups)compareGraph((await graph(k)).data,raw,k);
 const stale=await post(normalizeRow(settled));assert.equal(stale.data.stale,true);
 assert.equal(await bookStore.get(projectionConstants.journalSeq),snapshot.sequence+2);
 const pendingAfter=await result(await projectionHandle(projectStore,env,req('/projection-pending-snapshot-v1')));
 assert.equal(pendingAfter.data.total,pending.data.total-1);
 // New synthetic events only in local mock. Metadata fetch is intercepted, not sent to production.
 const realFetch=globalThis.fetch;
 const newRows=MARKET_GROUPS.map((g,i)=>({id:'LOCAL-PROJECTION-ONLY-'+i,status:'SETTLED',market:({AH:'ft_ah','1X2':'ft_1x2','O/U':'ft_over',Corners:'ft_corners_over',BTTS:'ft_btts',Cards:'ft_cards_over',Other:'other_test'})[g],createdAt:Date.now()+i,settledAt:correction.settledAt+100+i,result:i%2?'HALF_WIN':'LOSS',odds:2}));
 try{
  globalThis.fetch=async url=>{assert(String(url).startsWith('https://www.ball46.com/api/engine/statistics?paged=1'));return Response.json({ok:true,statisticsSource:'LEDGER_V2_ONLY',rows:newRows})};
  for(const row of newRows){assert.equal((await post(normalizeRow(row))).status,200);raw.unshift(row)}
  await projectionAlarm(projectStore,env);
 }finally{globalThis.fetch=realFetch}
 for(const k of groups)compareGraph((await graph(k)).data,raw,k);
 const protectedGet='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev/audit-projection-graph-v1';
 assert.equal((await worker.fetch(new Request(protectedGet),env)).status,403);
 assert.equal((await worker.fetch(new Request(protectedGet,{headers:{authorization:'Bearer '+env.AUDIT_TOKEN}}),env)).status,200);
 assert.equal((await worker.fetch(new Request('https://ball46-shadow-receiver-production.mccarey-supon.workers.dev/projection-seed-v1',{method:'POST',headers:{authorization:'Bearer '+env.AUDIT_TOKEN},body:'{}'}),env)).status,403);
 const invalid=await result(await projectionHandle(projectStore,env,req('/projection-graph-v1?variant=ht')));assert.equal(invalid.status,400);
 console.log('LOCAL_DURABLE_PROJECTION_PASS='+JSON.stringify({baseline:snapshot.book.totals.total,days:prepared.days.length,markets:7,sourceGraphParity:true,pendingSnapshot:pending.data.total,correction:true,duplicate:true,stale:true,newMarkets:7,protectedRoutes:true,pendingLiveGate:true,advancedFilterFailClosed:true,productionWrites:0}));
}
async function resultFromBook(book,request){return result(await book.fetch(request))}
async function seedProduction(){
 const seedKey=process.env.PROJECTION_SEED_TOKEN;if(!/^[a-f0-9]{64}$/.test(seedKey??''))throw Error('PROJECTION_SEED_ENV_MISSING');console.log('::add-mask::'+seedKey);
 const snapshot=await coherentSnapshot(true),p=prepare(snapshot);
 const send=async(body,token=seedKey)=>{
  const r=await fetch(endpoint+'/projection-seed-v1',{method:'POST',headers:{'content-type':'application/json','user-agent':'Mozilla/5.0 B46-Projection-Seed',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(45000)});
  return {status:r.status,data:await r.json()};
 };
 const begin={action:'begin',manifest:p.manifest};
 for(const token of [null,key])assert.equal((await send(begin,token)).status,403,'SEED_AUTH_DENIED');
 const state=await seedWith(send,p);
 console.log('PROJECTION_DURABLE_SEED_COMPLETE='+JSON.stringify({state,settled:snapshot.book.totals.total,sourceHash:snapshot.source.hash,days:p.days.length,pendingSnapshot:p.manifest.pending,unresolved:p.manifest.unresolved,bookReset:false}));
}
async function auditProduction(){
 const missing=await get('/audit-projection-graph-v1',null),wrong=await get('/audit-projection-graph-v1','0'.repeat(64));
 assert.equal(missing.status,403);assert.equal(wrong.status,403);
 for(let attempt=1;attempt<=4;attempt++){
  const snapshot=await coherentSnapshot(true),status=await get('/audit-projection-status-v1');
  if(status.status!==200||!status.data.graphReady||status.data.bookSequence!==snapshot.sequence){if(attempt<4){await wait(2000);continue}throw Error('PROJECTION_NOT_CURRENT')}
  const data=[],timings=[];let drift=false;
  for(const market of groups){
   const x=await get('/audit-projection-graph-v1?market='+encodeURIComponent(market));
   if(x.status!==200||x.data.sequence!==snapshot.sequence){drift=true;break}
   data.push(compareGraph(x.data,snapshot.source.rawRows,market));timings.push({market,ms:x.ms,bytes:x.bytes});
  }
  if(drift){if(attempt<4){await wait(1000);continue}throw Error('GRAPH_GENERATION_CHANGED')}
  const end=await get('/audit-projection-status-v1');
  if(end.status!==200||!end.data.graphReady||end.data.bookSequence!==snapshot.sequence){if(attempt<4){await wait(1000);continue}throw Error('BOOK_UPDATED_DURING_AUDIT')}
  const pendingLive=await get('/audit-projection-pending-v1');assert.equal(pendingLive.status,503);
  const invalid=await get('/audit-projection-graph-v1?variant=ht');assert.equal(invalid.status,400);
  const pendingRows=[],generations=new Set();let reported=0;
  for(let off=0;off!==null;){const x=await get('/audit-projection-pending-snapshot-v1?offset='+off+'&limit=50');assert.equal(x.status,200);assert.equal(x.data.live,false);generations.add(x.data.generation);reported=x.data.total;pendingRows.push(...x.data.rows);off=x.data.next}
  assert.equal(generations.size,1);assert.equal(pendingRows.length,reported);assert.equal(new Set(pendingRows.map(x=>String(x.id))).size,pendingRows.length);
  const sourcePending=snapshot.source.rawRows.filter(x=>x.status==='PENDING'||x.status==='UNRESOLVED'),sp=new Map(sourcePending.map(x=>[String(x.id),x]));
  let exact=0,missingIds=0,extra=0;const seen=new Set();
  for(const r of pendingRows){seen.add(String(r.id));if(!sp.has(String(r.id)))extra++;else if(fingerprint(r)===fingerprint(sp.get(String(r.id))))exact++}
  for(const id of sp.keys())if(!seen.has(id))missingIds++;
  const after=await get('/audit-projection-status-v1');assert.equal(after.status,200);
  if(after.data.bookSequence!==snapshot.sequence){if(attempt<4){await wait(1000);continue}throw Error('BOOK_UPDATED_DURING_PENDING_AUDIT')}
  console.log('PRODUCTION_PROJECTION_AUDIT='+JSON.stringify({settled:snapshot.book.totals.total,pnl:snapshot.book.totals.total_pnl,winRate:snapshot.book.totals.win_rate,historyExact:true,sourceHash:snapshot.source.hash,bookHash:snapshot.book.hash,sequence:snapshot.sequence,graphs:data,timings,pending:{source:sourcePending.length,snapshot:reported,exactMetadata:exact,missingIds,extra,liveReady:false,liveHttp:pendingLive.status,verifiedAt:status.data.projection.pendingVerifiedAt},advancedFilters:{supported:false,unexpectedVariantHttp:invalid.status},auth:{missing:missing.status,wrong:wrong.status,valid:200},websiteSourceChanged:false,cutoverReady:false}));
  return;
 }
}
const mode=process.argv[2];if(mode==='local')await local();else if(mode==='seed')await seedProduction();else if(mode==='audit')await auditProduction();else throw Error('MODE_REQUIRED');
