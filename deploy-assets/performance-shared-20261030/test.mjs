import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {patchHTML,patchMain} from './patch.mjs';
const original=await readFile('card-original.js','utf8'),source=await readFile('card.js','utf8');
assert(!/\bfetch\s*\(|\bsetInterval\s*\(|\.load\s*\(/.test(source));
const tail="if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();";
assert.equal(source.split(tail).length,2);
const originalHelpers=original.slice(original.indexOf('function parts('),original.indexOf('function dateLabel('));
let clock=Date.parse('2026-10-30T09:00:00Z');
class TestDate extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
const reference=vm.createContext({Intl,Date:TestDate});vm.runInContext("const TZ='Europe/London',CUT=6;"+originalHelpers,reference);
const objects=x=>JSON.parse(JSON.stringify(x));
let cases=0;
function environment(saved=null,blocked=false){
 const values=new Map(),listeners=new Map(),timers=new Map();let timerId=0,writes=0,cache=saved,current=null,stamp=clock;
 const element=()=>({textContent:'',setAttribute(){}});
 for(const day of ['today','yesterday'])for(const k of ['win','loss','push','pending'])values.set(`[data-b46-stat="${day}-${k}"]`,element());
 for(const day of ['today','yesterday'])for(const k of ['rate','avg-odds','total','label'])values.set(`[data-b46-${k}="${day}"]`,element());
 const card={dataset:{},title:'',querySelector:s=>values.get(s)||null,querySelectorAll:()=>[...values.entries()].filter(([s])=>!s.includes('label')).map(([,v])=>v),removeAttribute(n){if(n==='data-b46-performance-updated-at')delete this.dataset.b46PerformanceUpdatedAt;}};
 const document={readyState:'loading',body:{},hidden:false,getElementById:()=>card,querySelector:()=>null,addEventListener:(n,f)=>listeners.set(n,f)};
 const window={BALL46_STATISTICS_DATA:{getSnapshot:()=>current,getSnapshotAt:()=>stamp,load:()=>{throw Error('NETWORK_FORBIDDEN');}},addEventListener:(n,f)=>listeners.set(n,f)};
 const ctx=vm.createContext({Intl,Date:TestDate,document,window,localStorage:{getItem(){if(blocked)throw Error('DENIED');return cache;},setItem(k,v){if(blocked)throw Error('DENIED');cache=v;writes++;}},MutationObserver:class{observe(){}},requestAnimationFrame:f=>f(),setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:id=>timers.delete(id),fetch(){throw Error('NETWORK_FORBIDDEN');},setInterval(){throw Error('POLLING_FORBIDDEN');},console});
 vm.runInContext(source.replace(tail,'globalThis.testAPI={aggregate,boot,consume,checkDay,decodeCache,cutoffStamp,sportDay};'),ctx);
 return{api:ctx.testAPI,card,values,listeners,timers,get cache(){return cache;},get writes(){return writes;},setSnapshot(d,t=clock){current=d;stamp=t;}};
}
const env=environment();
function rows(n){return Array.from({length:n},(_,i)=>({id:String(i),createdAt:clock-(i%32)*86400000-(i%9)*3600000,status:i%7===0?'PENDING':i%7===1?'UNRESOLVED':'SETTLED',result:i%7<2?null:['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'][i%5],odds:i%11===0?null:1.4+(i%20)/10}));}
for(const size of [0,1,499,500,501,2000,5000,12037]){const r=rows(size);if(size>1)r.push({...r[0]});assert.deepEqual(objects(env.api.aggregate(r)),objects(reference.aggregate(r)));cases++;}
const mixed=rows(100);mixed.push({id:'void',createdAt:clock,status:'SETTLED',result:'VOID',odds:'2.0'},{id:'invalid',createdAt:'bad',result:'WIN'},{id:'fallback',created_at:clock,result:'HALF_WIN',odds:2.7});
assert.deepEqual(objects(env.api.aggregate(mixed)),objects(reference.aggregate(mixed)));cases++;
function snapshot(r){return{ok:true,ledgerRows:r,ledgerTotal:r.length,nextCursor:null,hasMore:false};}
env.api.boot();assert.equal(env.card.dataset.b46PerformanceState,'waiting');
const data=snapshot([{id:'a',createdAt:clock,status:'PENDING',odds:2},{id:'b',createdAt:clock,status:'SETTLED',result:'HALF_WIN',odds:2.5}]);
env.setSnapshot(data);env.listeners.get('ball46:statistics-snapshot')({detail:data});
assert.equal(env.values.get('[data-b46-stat="today-pending"]').textContent,'1');assert.equal(env.values.get('[data-b46-stat="today-win"]').textContent,'1');assert.equal(env.values.get('[data-b46-avg-odds="today"]').textContent,'2.25');assert.equal(env.card.dataset.b46PerformanceState,'current');cases++;
env.api.consume(data);assert.equal(env.writes,1);cases++;
const correction=snapshot(data.ledgerRows.map(r=>({...r,odds:3})));env.setSnapshot(correction);env.api.consume(correction);assert.equal(env.values.get('[data-b46-avg-odds="today"]').textContent,'3.00');cases++;
env.api.consume(data);assert.equal(env.values.get('[data-b46-avg-odds="today"]').textContent,'3.00');cases++;
const incomplete={...correction,ledgerTotal:500};env.setSnapshot(incomplete);env.api.consume(incomplete);assert.equal(env.writes,2);cases++;
const warm=environment(env.cache);warm.api.boot();assert.equal(warm.card.dataset.b46PerformanceState,'saved');assert.equal(warm.values.get('[data-b46-stat="today-pending"]').textContent,'1');assert(warm.values.get('[data-b46-label="today"]').textContent.startsWith('Saved Summary'));cases++;
const denied=environment(null,true);denied.api.boot();assert.equal(denied.card.dataset.b46PerformanceState,'waiting');denied.setSnapshot(data);denied.api.consume(data);assert.equal(denied.card.dataset.b46PerformanceState,'current');cases++;
for(const c of [{},{schema:99},JSON.parse(env.cache)]){if(c.schema===1)c.verifiedAt=clock+86400000;assert.equal(env.api.decodeCache(JSON.stringify(c)),null);cases++;}
clock+=120000;env.api.checkDay();assert.equal(env.card.dataset.b46PerformanceState,'saved');cases++;
const oldStamp=clock;clock=Date.parse('2026-10-31T06:00:01Z');env.api.checkDay();assert.equal(env.card.dataset.b46PerformanceState,'waiting');assert.equal(env.values.get('[data-b46-stat="today-win"]').textContent,'—');env.setSnapshot(correction,oldStamp);env.api.consume(correction);assert.equal(env.card.dataset.b46PerformanceState,'waiting');cases++;
const empty=snapshot([]);env.setSnapshot(empty);env.api.consume(empty);assert.equal(env.values.get('[data-b46-stat="today-win"]').textContent,'0');cases++;
assert.equal(new Date(env.api.cutoffStamp('2026-03-29')).toISOString(),'2026-03-29T05:00:00.000Z');assert.equal(new Date(env.api.cutoffStamp('2026-10-25')).toISOString(),'2026-10-25T06:00:00.000Z');cases+=2;
const html=await readFile('live.html','utf8'),changed=patchHTML(html);assert.equal(changed.replace(source,original).replace('singlepage-workspace-343.js?v=performance-shared-20261030','singlepage-workspace-343.js?v=statistics-source-20261018'),html);assert.throws(()=>patchHTML(changed));cases+=2;
const oldStore=await readFile('store-original.js','utf8'),newStore=await readFile('store.js','utf8');assert.equal(newStore.replace(', getSnapshot:()=>cached, getSnapshotAt:()=>loadedAt',''),oldStore);cases++;
await mkdir('audit',{recursive:true});await writeFile('audit/test-runtime.mjs',patchMain('export default{...__spacingPrevious};'));
await writeFile('audit/unit-tests.json',JSON.stringify({ok:true,cases,formulaEquivalence:true,cardNetworkRequests:0,cardPollingLoops:0,cacheAndRollover:true},null,2));console.log('PERFORMANCE_TESTS_PASS '+cases);
