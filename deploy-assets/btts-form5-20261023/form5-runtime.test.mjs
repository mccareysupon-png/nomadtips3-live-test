import test from'node:test';
import assert from'node:assert/strict';
import{extendEngineWithForm5}from'./form5-runtime.mjs';
const HOUR=3600000,DAY=24*HOUR;
function setup({enabled=true,homeScores=[1,1,1,1,1],awayScores=[1,1,1,1,1]}={}){
 const at=Date.now(),kickoff=new Date(at+3*HOUR).toISOString(),store=new Map(),ledger=new Map();
 const fixture={fixtureId:'8764321',status:'scheduled',boardState:'scheduled',kickoffUtc:kickoff,home:{id:'H',name:'Home'},away:{id:'A',name:'Away'},league:{id:'1',name:'Example'},goals:{home:null,away:null}};
 let hub={ok:true,stale:false,ageMs:1000,fixtures:[fixture]},calls=0;
 const historyBy={H:homeScores.map((n,i)=>({id:'H'+i,status:'finished',kickoff_utc:new Date(at-(i+1)*DAY).toISOString(),
  teams:{home:{id:'H'},away:{id:'X'+i}},goals:{home:n,away:1}})),
 A:awayScores.map((n,i)=>({id:'A'+i,status:'finished',kickoff_utc:new Date(at-(i+1)*DAY).toISOString(),
  teams:{home:{id:'Y'+i},away:{id:'A'}},goals:{home:1,away:n}}))};
 const ctx={storage:{async get(k){return store.get(k)},async put(k,v){store.set(k,structuredClone(v));},async delete(k){store.delete(k)}}};
 const env={FIVEDOLLAR_API_KEY:'TEST_KEY_DO_NOT_USE',HUB:{async fetch(){return Response.json(hub)}}};
 const Base=class{constructor(ctx,env){this.ctx=ctx;this.env=env;}async upsertLedgerRows(rows){for(const x of rows)ledger.set(x.id,structuredClone(x));return{inserted:rows.length};}async fetch(){return new Response('NO_ROUTE',{status:404})}};
 const Ext=extendEngineWithForm5(Base,{enabled}),model=new Ext(ctx,env);
 const oldFetch=globalThis.fetch;
 const mockFetch=async u=>{calls++;const id=new URL(u).pathname.split('/')[3];const data=historyBy[id];return Response.json({success:1,data:data||[]})};
 return{model,store,ledger,fixture,at,historyBy,mockFetch,overrideHub:x=>hub=x,getCalls:()=>calls,restore:()=>{globalThis.fetch=oldFetch}};
}
test('disabled means zero upstream/API/ledger writes',async()=>{
 const p=setup({enabled:false});globalThis.fetch=p.mockFetch;
 try{const x=await p.model.form5Cycle();assert.equal(x.skipped,'DISABLED');assert.equal(p.ledger.size,0);assert.equal(p.getCalls(),0);}finally{p.restore();}
});
test('one immutable prematch YES signal with exactly two historical requests',async()=>{
 const p=setup();globalThis.fetch=p.mockFetch;
 try{let x=await p.model.form5Cycle();assert.equal(x.created,1);assert.equal(p.getCalls(),2);assert.equal(p.ledger.size,1);
  let row=[...p.ledger.values()][0];assert.equal(row.market,'ft_btts_yes');assert.equal(row.odds,null);assert.equal(row.status,'PENDING');
  x=await p.model.form5Cycle();assert.equal(x.skipped,'INTERVAL');assert.equal(p.ledger.size,1);assert.equal(p.getCalls(),2);
 }finally{p.restore();}
});
test('NO selection and FT WIN; merge same stable ledger ID',async()=>{
 const p=setup({homeScores:[0,0,0,1,1]});globalThis.fetch=p.mockFetch;
 try{const c=await p.model.form5Cycle();assert.equal(c.created,1);let row=[...p.ledger.values()][0];assert.equal(row.market,'ft_btts_no');
  p.overrideHub({ok:true,stale:false,ageMs:1000,fixtures:[{...p.fixture,status:'finished',boardState:'finished',goals:{home:0,away:1}}]});
  const m=p.store.get('b46:form5:v1:meta');m.lastRun=0;p.store.set('b46:form5:v1:meta',m);
  const s=await p.model.form5Cycle();assert.equal(s.settled,1);assert.equal(s.created,0);
  row=[...p.ledger.values()][0];assert.equal(row.status,'SETTLED');assert.equal(row.result,'WIN');assert.equal(row.id,'btts-form5-v1:8764321');
  assert.equal(p.getCalls(),2);
 }finally{p.restore();}
});
test('neutral form produces no ledger signals, no fake performance',async()=>{
 const p=setup({homeScores:[0,0,1,1,1]});globalThis.fetch=p.mockFetch;
 try{let r=await p.model.form5Cycle();assert.equal(r.created,0);assert.equal(p.ledger.size,0);assert.equal(p.getCalls(),2);}finally{p.restore();}
});
test('HTTP 429 enforces backoff and does not publish speculative pick',async()=>{
 const p=setup();globalThis.fetch=async()=>{return new Response('rate limit',{status:429,headers:{'retry-after':'10'}})};
 try{const r=await p.model.form5Cycle();assert.equal(r.created,0);assert.equal(p.ledger.size,0);
  const h=await p.model.form5Health();assert(h.backoffUntil>Date.now());assert(h.lastProvider429>0);
 }finally{p.restore();}
});
