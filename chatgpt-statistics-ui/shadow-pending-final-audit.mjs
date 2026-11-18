// Read-only final Pending acceptance audit; no deployment or cloud writes.
import assert from 'node:assert/strict';
import {collect,fingerprint} from './shadow-seed-snapshot.mjs';
import {readFullBook,compare,auditCredential} from './shadow-seed-audit.mjs';
const base='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev',key=auditCredential();
console.log('::add-mask::'+key);
const get=async (path,token=key)=>{
 const start=performance.now(),r=await fetch(base+path,{method:'GET',headers:{accept:'application/json','cache-control':'no-cache','user-agent':'Mozilla/5.0 B46-Pending-Audit',...(token?{authorization:'Bearer '+token}:{})},redirect:'manual',signal:AbortSignal.timeout(25000)});
 const body=await r.text();let d;try{d=JSON.parse(body)}catch{d=null}
 return {http:r.status,json:(r.headers.get('content-type')??'').includes('application/json')&&!!d,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(body),d};
};
const status=()=>get('/audit-projection-status-v1');
const path='/audit-projection-pending-snapshot-v1',livePath='/audit-projection-pending-v1';
const stat=values=>{const a=[...values].sort((x,y)=>x-y);return {samples:a.length,min:a[0],median:a[Math.ceil(a.length/2)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1),underOrEqual200:a.filter(x=>x<=200).length}};
for(let attempt=1;attempt<=3;attempt++){
 const s=await status(),source=await collect({includeRaw:true}),book=await readFullBook(key);
 assert(s.http===200&&s.json&&s.d.graphReady);
 if(!compare(source,book).exact){console.log('PENDING_AUDIT_RETRY=legacy_book_revision');continue}
 const sourcePending=source.rawRows.filter(x=>['PENDING','UNRESOLVED'].includes(x.status)),sm=new Map(sourcePending.map(x=>[String(x.id),x])),settled=new Set(book.rows.map(x=>x.signal_id));
 const rows=[],times=[],gens=new Set();let total=null,pending=null,unresolved=null,off=0;
 while(off!==null){
  const x=await get(path+'?offset='+off+'&limit=50');assert(x.http===200&&x.json&&x.d.ok&&x.d.live===false,'PENDING_SNAPSHOT_HTTP');
  gens.add(x.d.generation);times.push(x.ms);rows.push(...x.d.rows);
  if(total!==null)assert.equal(total,x.d.total);total=x.d.total;pending=x.d.pending;unresolved=x.d.unresolved;
  assert(x.d.next===null||x.d.next>off);off=x.d.next;
 }
 const firstSamples=[];
 for(let i=0;i<10;i++){const x=await get(path+'?offset=0&limit=50');assert(x.http===200&&x.json&&x.d.ok);gens.add(x.d.generation);firstSamples.push(x.ms)}
 const liveSamples=[];let live=null;
 for(let i=0;i<5;i++){const x=await get(livePath+'?offset=0&limit=50');assert(x.json&&[200,503].includes(x.http));live=x;liveSamples.push(x.ms)}
 const end=await status(),seq=book.totals.total+book.aggregate.corrections;
 if(gens.size!==1||s.d.bookSequence!==seq||end.d.bookSequence!==seq||s.d.projection.generation!==end.d.projection.generation){console.log('PENDING_AUDIT_RETRY=generation');continue}
 // Ignore only the three known volatile clock fields; retain all business fields.
 const volatile=new Set(['entryMinute','mirrorMinute','mirrorUpdatedAt']);
 const ids=new Set(rows.map(x=>String(x.id)));let exact=0,rawExact=0,extra=0,missing=0,metadataDiff=0,clockDrift=0,overlap=0;
 for(const r of rows){
  const id=String(r.id);if(settled.has(id))overlap++;
  if(!sm.has(id)){extra++;continue}
  const expected=sm.get(id),keys=[...new Set([...Object.keys(r),...Object.keys(expected)])].filter(k=>JSON.stringify(r[k])!==JSON.stringify(expected[k]));
  const stable=keys.filter(k=>!volatile.has(k)),clock=keys.filter(k=>volatile.has(k));
  if(!keys.length)rawExact++;
  if(!stable.length)exact++;else metadataDiff++;
  if(clock.length)clockDrift++;
  if(keys.length)console.log('PENDING_METADATA_DIFF='+JSON.stringify({idHash:fingerprint(id).slice(0,16),stableFields:stable,ignoredClockFields:clock,status:expected.status}));
 }
 for(const id of sm.keys())if(!ids.has(id))missing++;
 const no=await get(path,null),wrong=await get(path,'0'.repeat(64));
 const seedAt=end.d.projection.pendingVerifiedAt,afterSeed=book.rows.filter(r=>r.settled_at>seedAt).length;
 const snapshotExact=rows.length===total&&ids.size===rows.length&&exact===sourcePending.length&&missing===0&&extra===0&&metadataDiff===0&&overlap===0;
 const pendingTiming=stat(firstSamples);
 console.log('FINAL_PENDING_ACCEPTANCE='+JSON.stringify({time:new Date().toISOString(),settled:book.totals.total,pnl:book.totals.total_pnl,winRate:book.totals.win_rate,historyExact:true,sequence:seq,sourcePending:source.other.PENDING,sourceUnresolved:source.other.UNRESOLVED,receiverPending:pending,receiverUnresolved:unresolved,total,exactMetadata:exact,rawExact,clockDrift,ignoredFields:[...volatile],missing,extra,metadataDiff,duplicate:rows.length-ids.size,settledOverlap:overlap,settledAfterSeed:afterSeed,seedAt,snapshotExact,snapshotHttp:200,snapshotPageTiming:stat(times),snapshotRepeatTiming:pendingTiming,liveHttp:live.http,liveTiming:stat(liveSamples),liveReady:end.d.pendingLiveReady&&live.http===200,liveError:live.d.error??null,sync:end.d.pendingSync,auth:{missing:no.http,wrong:wrong.http},cutoverReady:false,gateReason:'NO_VERIFIED_OPEN_EVENT_FEED_OR_REAL_SETTLEMENT_TRANSITION',realSettlementRemovalProven:false}));
 assert.equal(no.http,403);assert.equal(wrong.http,403);
 if(!snapshotExact)throw Error('PENDING_STABLE_METADATA_NOT_EXACT');
 if(!end.d.pendingLiveReady||live.http!==200)console.log('PENDING_LIVE_GATE=NOT_READY');
 break;
}
