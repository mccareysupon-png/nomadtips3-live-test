import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchCurrentStatisticsLoader,STAGE_LOADER_MARKER} from './statistics-loader-staging-patch.mjs';
import {patchIndexedStatisticsCache,B46_CACHE_MARKER} from './indexed-stats-stage.mjs';

const response=await fetch('https://www.ball46.com/singlepage-workspace-343.js',{signal:AbortSignal.timeout(25000)});
assert.equal(response.status,200,'CURRENT_SOURCE_GET');
const original=await response.text();
const patched=patchCurrentStatisticsLoader(original);
assert.equal(patched.status,'CURRENT_LOADER_PATCHED','REFUSE_UNMATCHED_CURRENT_CODE');
assert(patched.source.includes(STAGE_LOADER_MARKER));
assert(patched.source.includes('B46_STAGE_GZIP_VERIFIED'));
assert(patched.source.includes("new DecompressionStream('gzip')"));
assert.equal(original.includes(STAGE_LOADER_MARKER),false);
assert.equal(patched.source.includes("Statistics changed during pagination; refresh required"),true);
assert.equal(patched.source.includes('Statistics pending/unresolved disagrees with ledger'),true);
assert.equal(patched.source.includes('function counts(rows)'),true);
assert.equal(patched.source.includes('function rate(rows)'),true);
assert.equal(patched.source.includes('function signature(data)'),true);
new vm.Script(patched.source,{filename:'singlepage-workspace-staging.js'});
const result2=patchCurrentStatisticsLoader(patched.source);
assert.equal(result2.status,'ALREADY_PATCHED');
assert.equal(result2.source,patched.source);
assert.equal(patchCurrentStatisticsLoader('unrelated.js').status,'SOURCE_DRIFT_MISSING_OWNER');
const indexed=patchIndexedStatisticsCache(patched.source);
assert.equal(indexed.status,'VERIFIED_INDEXED_CACHE_PATCHED');
assert(indexed.source.includes(B46_CACHE_MARKER));
assert(indexed.source.includes('b46-stage-saved-ready'));
assert(indexed.source.includes('b46-stage-data-ready'));

assert(indexed.source.includes('if(signature(liveHead)===signature(cached))'));
assert(indexed.source.includes('snapshot unchanged; skipped full historical refresh'));

assert(indexed.source.includes('indexedDB.open(B46_STAGE_DB,2)'));
assert(indexed.source.includes('},60000)'));

assert(indexed.source.includes("panel.style.setProperty('display','block','important')"));
assert(indexed.source.includes("panel.style.removeProperty('display')"));
assert(indexed.source.includes('data.ledgerRows.length===data.ledgerTotal'));
assert.equal(patchIndexedStatisticsCache(indexed.source).status,'ALREADY_PATCHED');
assert.equal(patchIndexedStatisticsCache('other code').status,'SOURCE_DRIFT_LOAD');
new vm.Script(indexed.source,{filename:'staging-indexed-cached.js'});


const end=patched.source.indexOf('})();',patched.source.indexOf('window.BALL46_STATISTICS_DATA = Object.freeze('));
assert(end>0,'OWNER_CLOSURE_MISSING');
const firstOwner=patched.source.slice(0,end+5);
const data={
  ok:true,ledgerTotal:2,total:2,pending:0,unresolved:0,
  win:1,loss:1,push:0,halfWin:0,halfLoss:0,ledgerUpdatedAt:'stable-1',
  rows:[{id:'a',result:'WIN',status:'SETTLED'},{id:'b',result:'LOSS',status:'SETTLED'}],
  nextCursor:null,hasMore:false
};
function createRuntime(){
 let mode='one599',calls=0,now=1700000000000;
 const context={
   window:{},
   URLSearchParams,
   AbortSignal,
   Response,
   Date:class extends Date{static now(){return now}},
   Promise,Set,Object,String,Array,Number,JSON,Error,TypeError,CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail}},
   document:{dispatchEvent(){}},
   console:{warn(){}},
   setTimeout,
   fetch:async url=>{
     calls++;
     const u=new URL(url,'https://www.ball46.com');
     assert.equal(u.pathname,'/api/engine/statistics');
     assert.equal(u.searchParams.get('paged'),'1','UNPAGED_REQUEST_NOT_REMOVED');
     if(mode==='all599'||mode==='one599'&&calls===1)return new Response('B46_V13_CACHE_FAIL',{status:599,headers:{'content-type':'text/plain'}});
     if(mode==='partial')return new Response(JSON.stringify({...data,rows:data.rows.slice(0,1)}),{status:200,headers:{'content-type':'application/json'}});
     return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
   }
 };
 vm.runInNewContext(firstOwner,context,{timeout:1000});
 return {api:context.window.BALL46_STATISTICS_DATA,setMode:m=>mode=m,advance:ms=>now+=ms,getCalls:()=>calls};
}
const good=createRuntime();
const first=await good.api.load();
assert.equal(good.getCalls(),2,'599_RETRIED_ONLY_FAILED_PAGE');
assert.equal(first.ledgerRows.length,2);
assert.equal(first.rows.length,2);
assert.equal(good.api.getSnapshot().ledgerTotal,2);
assert.equal(good.api.counts(first.rows).WIN,1);
good.advance(20000);
good.setMode('all599');
const fallback=await good.api.load();
assert.strictEqual(fallback,first,'LAST_GOOD_SNAPSHOT_NOT_RETAINED');
assert.equal(good.getCalls(),5,'UNBOUNDED_RETRY');
const invalid=createRuntime();
invalid.setMode('partial');
await assert.rejects(invalid.api.load(),/Incomplete statistics|statistics/i,'PARTIAL_LEDGER_MUST_FAIL');
assert.equal(invalid.api.getSnapshot(),null,'PARTIAL_MUST_NOT_CACHE');
console.log('B46_STAGE_LOADER_UNIT_PASS '+JSON.stringify({sourceBytes:original.length,patchedBytes:patched.source.length,pageRetryPass:true,strictCountsPass:true,lastVerifiedFallback:true,productionWrites:0}));
