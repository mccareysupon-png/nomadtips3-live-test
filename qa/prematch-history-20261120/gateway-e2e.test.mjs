import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {init,totals,DAY} from './history.mjs';import {initBackfill,registerConfirmedScope,planBackfill,processLeaguePage,planSummary} from './backfill.mjs';import {makeHistoryGateway} from './history-gateway.mjs';import {fixture,base} from './sample.mjs';
function db(){const sql=new DatabaseSync(':memory:');const d={exec:(q,...a)=>{const s=sql.prepare(q);return /^\s*SELECT/i.test(q)?s.all(...a):(s.run(...a),[])},transaction:f=>{sql.exec('BEGIN');try{const r=f();sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};init(d);initBackfill(d);return d}
const sec=base+100*DAY,cycle='e2e',scope='season:25/26',up={boardState:'scheduled',status:'scheduled',kickoffAt:(sec+3600)*1000,league:{id:123},home:{id:1},away:{id:2}};
function shared(){
 let now=sec*1000,remaining=40,pending=new Set(),lastHistoryAt=null,liveWaiting=false,richWaiting=false,backoffUntil=0,requests=0,serial=Promise.resolve(),id=0;
 const atomic=f=>{const r=serial.then(f);serial=r.catch(()=>{});return r};
 return {clock:()=>now,tick:v=>now+=v,live:v=>{liveWaiting=v},rich:v=>{richWaiting=v},remaining:v=>{remaining=v},counts:()=>({remaining,requests,pending:pending.size}),reserve:({kind,decision})=>atomic(()=>{const reason=decision({sharedAllTraffic:true,remaining,pending:pending.size,observedAt:now-100,resetAt:now+30000,lastHistoryAt,liveWaiting,richWaiting,backoffUntil},now);if(reason!=='ALLOW')return {allowed:false,reason};const lease={allowed:true,id:String(++id)};pending.add(lease.id);if(kind==='PREMATCH_HISTORY')lastHistoryAt=now;return lease}),consume:()=>{requests++;remaining--},observe:(r,l)=>atomic(()=>{pending.delete(l.id);if(r.status===429)backoffUntil=now+Number(r.headers.get('retry-after')||60)*1000}),failed:l=>atomic(()=>pending.delete(l.id))};
}
function bridge(db,authority,reply){
 const h=makeHistoryGateway({clock:authority.clock,authorize:async r=>r.headers.get('x-test')==='internal',reserve:authority.reserve,observe:authority.observe,failed:authority.failed,call:async path=>{authority.consume();return reply(path)}});
 return async path=>(await h(new Request('https://hub.internal/internal/prematch-history/page',{method:'POST',headers:{'x-test':'internal','content-type':'application/json'},body:JSON.stringify({path})}))).json()
}
const page=(p,start,more)=>Response.json({success:1,data:Array.from({length:5},(_,i)=>fixture(5000+start+i,sec-(start+i+1)*3600,1,2,2,1)),pagination:{page:p,has_more:more}});
test('end to end SQLite queue -> shared gateway -> mocked provider -> persisted ten results; Live priority and repeat skip',async()=>{
 const d=db(),a=shared();registerConfirmedScope(d,{leagueId:123,season:'25/26',source:'provider_confirmed'},sec);const plan=planBackfill(d,[up],sec,cycle);assert.equal(plan.queueEntries,1);a.live(true);
 const gate=bridge(d,a,p=>{const n=Number(new URL('https://provider.invalid'+p).searchParams.get('page'));return page(n,(n-1)*5,n===1)});
 const run=()=>processLeaguePage(d,{scope,league:123,now:Math.floor(a.clock()/1000),centralGateway:gate});
 assert.equal((await run()).state,'deferred_budget');assert.equal(a.counts().requests,0);
 a.live(false);a.tick(60000);assert.equal((await run()).state,'pending');assert.equal(totals(d).fixtures,5);
 a.tick(1000);assert.equal((await run()).state,'deferred_budget');assert.equal(a.counts().requests,1);
 a.tick(60000);assert.equal((await run()).state,'complete');assert.equal(totals(d).fixtures,10);
 assert.equal((await run()).requests,0);assert.equal(planSummary(d,cycle).backfillRequests,2);assert.equal(a.counts().pending,0);
});
test('shared atomic reservation prevents simultaneous history calls across two handlers',async()=>{
 const a=shared(),d=db();const b1=bridge(d,a,()=>page(1,0,false)),b2=bridge(d,a,()=>page(1,0,false));
 const p='/v1/leagues/123/fixtures?status=finished&per_page=100&page=1&season=25%2F26';
 const both=await Promise.all([b1(p),b2(p)]);assert.equal(both.filter(x=>x.status===200).length,1);assert.equal(both.filter(x=>x.state==='deferred_budget').length,1);assert.equal(a.counts().requests,1);assert.equal(a.counts().pending,0)
});
test('Rich priority then provider 429 cooldown are seen by new gateway handler',async()=>{
 const a=shared(),d=db();const p='/v1/leagues/123/fixtures?status=finished&per_page=100&page=1&season=25%2F26';
 a.rich(true);const b=bridge(d,a,()=>new Response('{}',{status:429,headers:{'retry-after':'120'}}));assert.equal((await b(p)).reason,'LIVE_PRIORITY');a.rich(false);
 assert.equal((await b(p)).status,429);a.tick(61000);const other=bridge(d,a,()=>page(1,0,false));assert.equal((await other(p)).reason,'PROVIDER_COOLDOWN');assert.equal(a.counts().requests,1);
});
