import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDailySnapshot,createDailyAccumulator,londonSportDay} from './snapshot.mjs';
import {createPreviewApp} from './preview-worker.mjs';
import {createPagedStatisticsSource} from './source-pages.mjs';
import {createD1SnapshotStore} from './d1-store.mjs';
import {getSnapshot,makeRecord,refreshSnapshot,SNAPSHOT_KEY} from './snapshot-service.mjs';

const NOW=Date.parse('2026-10-29T12:00:00Z');
const ROW=(id,outcome='WIN',status='SETTLED',createdAt=NOW-1000)=>
  ({id,result:outcome,status,createdAt,odds:2,market:'asian_handicap'});
const ROWS=[ROW('a'),ROW('b','LOSS'),ROW('c','PUSH'),ROW('d',null,'PENDING')];
function source(rows=ROWS,{badRows=false}={}){
  const base={ok:true,ledgerTotal:rows.length,ledgerUpdatedAt:NOW-2000,
    settlementRevision:'bet365-rules-v2',total:3,pending:1,win:1,loss:1,push:1,
    halfWin:0,halfLoss:0,unresolved:0};
  return {headCalls:0,pagesCalls:0,async head(){this.headCalls++;return base},
    async *pages(){this.pagesCalls++;yield{...base,rows:badRows?rows.slice(0,-1):rows}}};
}
function memoryStore(){
  let record=null;
  return {writes:0,
    async read(){return record},
    async putIfNewer(_key,v){
      if(record&&record.generatedAtMs>=v.generatedAtMs)return false;
      record=v;this.writes++;return true;
    },
    get value(){return record},
    force(v){record=v}};
}
test('streaming accumulator matches the full snapshot across pages',()=>{
  const all=[...ROWS,ROW('old','WIN','SETTLED','2026-10-28T13:00:00Z')];
  const acc=createDailyAccumulator({asOfMs:NOW});
  acc.append(all.slice(0,2));acc.append(all.slice(2));
  assert.deepEqual(acc.finish({ledgerRevision:'X'}),buildDailySnapshot(all,{asOfMs:NOW,ledgerRevision:'X'}));
});
test('persist one compact snapshot; GET never fetches full ledger',async()=>{
  const store=memoryStore(),feed=source();
  const r=await refreshSnapshot({store,source:feed,nowMs:NOW});
  assert.equal(r.state,'UPDATED');assert.equal(r.ledgerTotal,4);assert.equal(store.writes,1);
  const app=createPreviewApp({store,source:feed,clock:()=>NOW+1000});
  const res=await app.fetch(new Request('https://preview.example/api/performance/snapshot',{
    headers:{origin:'https://www.ball46.com'}}));
  const payload=await res.json();
  assert.equal(res.status,200);assert.equal(res.headers.get('access-control-allow-origin'),'https://www.ball46.com');
  assert.equal(payload.today.win,1);assert.equal(payload.today.pending,1);
  assert.equal(payload.yesterday.pending,0);
  assert.equal(payload.ledger.rowCount,4);
  assert.ok(JSON.stringify(payload).length<1800);
  assert.equal(feed.headCalls,1);assert.equal(feed.pagesCalls,1);
  assert.equal(JSON.stringify(payload).includes('"rows"'),false);
});
test('cron skips unchanged ledger and same London day; never republishes',async()=>{
  const store=memoryStore(),feed=source();
  await refreshSnapshot({store,source:feed,nowMs:NOW});
  const same=await refreshSnapshot({store,source:feed,nowMs:NOW+1000});
  assert.equal(same.state,'UNCHANGED');
  assert.equal(store.writes,1);assert.equal(feed.pagesCalls,1);
});
test('bad or incomplete ledger cannot overwrite last good snapshot',async()=>{
  const store=memoryStore(),feed=source();
  await refreshSnapshot({store,source:feed,nowMs:NOW});
  const original=store.value;
  const bad=source(ROWS,{badRows:true});
  await assert.rejects(()=>refreshSnapshot({store,source:bad,nowMs:NOW+310000}),/LEDGER_INCOMPLETE_ABORT/);
  assert.equal(store.value,original);
});
test('old/missing and London rollover never claim current stats',async()=>{
  const store=memoryStore(),feed=source();
  let s=await getSnapshot({store,nowMs:NOW});assert.equal(s.status,503);
  await refreshSnapshot({store,source:feed,nowMs:NOW});
  s=await getSnapshot({store,nowMs:NOW+7*60000});
  assert.equal(s.status,503);assert.equal(s.reason,'SNAPSHOT_STALE_OR_INVALID');
  const afterCut=Date.parse('2026-10-30T06:00:01Z');
  s=await getSnapshot({store,nowMs:afterCut});
  assert.equal(s.status,503);assert.equal(s.reason,'LONDON_DAY_ROLLOVER');
});
test('never serve snapshot after invalid DB record',async()=>{
  const store=memoryStore();store.force({schema:'wrong',generatedAtMs:NOW});
  const r=await getSnapshot({store,nowMs:NOW});
  assert.equal(r.status,503);
});
test('sidecar methods are read-only: no POST/PATCH/PUT and no update via GET',async()=>{
  const store=memoryStore(),feed=source();
  const app=createPreviewApp({store,source:feed,clock:()=>NOW});
  for(const method of ['POST','PUT','PATCH','DELETE']){
    const r=await app.fetch(new Request('https://preview.example/api/performance/snapshot',{method}));
    assert.equal(r.status,405);
  }
  assert.equal(feed.headCalls,0);
  const h=await app.fetch(new Request('https://preview.example/health'));
  assert.equal(h.status,200);assert.equal(feed.headCalls,0);
});
test('pagination rejects changed ledger and incomplete cursor',async()=>{
  const base={ok:true,ledgerTotal:2,ledgerUpdatedAt:NOW,settlementRevision:'rev',
    total:2,pending:0,win:2,loss:0,push:0,halfWin:0,halfLoss:0,unresolved:0};
  const fake=async u=>{
    const cursor=new URL(u).searchParams.get('cursor');
    const payload=cursor?{...base,ledgerUpdatedAt:NOW+1,rows:[ROW('b')],nextCursor:null,hasMore:false}
      :{...base,rows:[ROW('a')],nextCursor:'c1',hasMore:true};
    return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
  };
  const feed=createPagedStatisticsSource(fake),first=await feed.head();
  await assert.rejects(async()=>{for await(const p of feed.pages(first)){assert.ok(p)}},/LEDGER_CHANGED_DURING_PAGING/);
});
test('pagination reads stable revision and all pages',async()=>{
  const base={ok:true,ledgerTotal:2,ledgerUpdatedAt:NOW,settlementRevision:'rev',
    total:2,pending:0,win:2,loss:0,push:0,halfWin:0,halfLoss:0,unresolved:0};
  const feed=createPagedStatisticsSource(async u=>{
    const cursor=new URL(u).searchParams.get('cursor');
    return new Response(JSON.stringify(cursor?{...base,rows:[ROW('b')],nextCursor:null,hasMore:false}
      :{...base,rows:[ROW('a')],nextCursor:'next',hasMore:true}),{headers:{'content-type':'application/json'}});
  });
  const first=await feed.head();const rows=[];
  for await(const p of feed.pages(first))rows.push(...p.rows);
  assert.equal(rows.length,2);
});
test('out-of-order D1 writes cannot override newer row',async()=>{
  let stored=null;
  const mock={
    prepare(sql){return {bind(...params){return{
      async first(){return stored?{payload:stored.payload}:null},
      async run(){
        const [key,ms,source,payload]=params;
        const accept=!stored||(ms>stored.ms&&source>=stored.source);
        if(accept)stored={key,ms,source,payload};
        return {success:true,meta:{changes:accept?1:0}};
      }
    }}}},
  };
  const store=createD1SnapshotStore(mock);
  const newer=makeRecord({ok:true,rows:ROWS,ledgerTotal:4,ledgerUpdatedAt:NOW,settlementRevision:'r'},NOW);
  const older=makeRecord({ok:true,rows:ROWS,ledgerTotal:4,ledgerUpdatedAt:NOW-1000,settlementRevision:'r'},NOW-1000);
  assert.equal(await store.putIfNewer(SNAPSHOT_KEY,newer),true);
  assert.equal(await store.putIfNewer(SNAPSHOT_KEY,older),false);
  assert.equal((await store.read(SNAPSHOT_KEY)).generatedAtMs,NOW);
});
test('store refuses cross-application keys',async()=>{
  const db={prepare(){throw Error('should not run')}};
  const store=createD1SnapshotStore(db);
  await assert.rejects(()=>store.read('member:daily:v1'),/KEY_NOT_ALLOWED/);
});
test('source cannot be pointed to arbitrary external provider',()=>{
  assert.throws(()=>createPagedStatisticsSource(fetch,{url:'https://api.other.com/fixtures'}),/UNTRUSTED_STATS_SOURCE_URL/);
});
