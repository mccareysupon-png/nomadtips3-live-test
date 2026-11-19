import assert from 'node:assert/strict';
import {MonitorRateCache,markets,readRates,valid,browserBridge} from './monitor.mjs';
let sequence=10,generation=2,calls=0,broken=false,mixed=false,stored=new Map();
const counts={WIN:1,HALF_WIN:0,LOSS:1,HALF_LOSS:0,PUSH:0};
const env={B46_MARKET_READER:{async fetch(req){
 calls++;assert.equal(req.method,'GET');const u=new URL(req.url);assert.equal(u.pathname,'/projection-graph-v1');
 const market=u.searchParams.get('market'),all=market==='all',empty=market!=='AH'&&!all;
 if(broken&&market==='AH')return new Response(null,{status:503});
 return Response.json({ok:true,market,variant:'all',range:'all',filter:'all',sequence:sequence+(mixed&&market==='AH'?1:0),generation,win_rate:empty?0:50,counts:empty?{WIN:0,HALF_WIN:0,LOSS:0,HALF_LOSS:0,PUSH:0}:counts});
}}};
const state={storage:{get:async k=>stored.get(k),put:async(k,v)=>stored.set(k,v)},blockConcurrencyWhile:fn=>fn()};
const cache=new MonitorRateCache(state,env),get=async n=>(await cache.fetch(new Request('https://monitor.internal/refresh?sequence='+n))).json();
const results=await Promise.all([get(10),get(10),get(10)]);
for(const x of results){assert.equal(x.state,'CURRENT');assert(valid(x.snapshot));assert.equal(x.snapshot.rates.ah,50);assert.equal(x.snapshot.rates.btts,null)}
assert.equal(calls,8,'COALESCE');
await get(10);assert.equal(calls,8,'CACHED');
sequence=11;cache.lastAttempt=0;await get(11);assert.equal(calls,16,'ONE_REFRESH_PER_REVISION');
assert.equal(stored.get('snapshot').sequence,11);
sequence=12;broken=true;cache.lastAttempt=0;assert.equal((await get(12)).state,'WAITING');assert.equal(stored.get('snapshot').sequence,11);
broken=false;mixed=true;cache.lastAttempt=0;await get(12);assert.equal(stored.get('snapshot').sequence,11);
mixed=false;cache.lastAttempt=0;assert.equal((await get(12)).snapshot.sequence,12);
assert.equal((await cache.fetch(new Request('https://monitor.internal/refresh?sequence=12',{method:'POST'}))).status,405);
new Function('('+browserBridge.toString()+')()');
console.log('MONITOR_UNIT_PASS coalescing, stored revision, invalid source, mixed generation, recovery, browser syntax');