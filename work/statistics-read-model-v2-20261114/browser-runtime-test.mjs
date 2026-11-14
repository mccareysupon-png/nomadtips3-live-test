import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./fast-browser-runtime.js',import.meta.url),'utf8');
function harness(){
 let clock=10000,revision=1,stale=false,fail=false,conflict=false;const calls=[],events=[],timers=new Map(),listeners=new Map();let timerId=0;
 const document={hidden:false,body:{dataset:{workspaceView:'statistics'}},head:{appendChild(){}},createElement:()=>({}),querySelectorAll:()=>[],documentElement:{dataset:{},setAttribute(){},removeAttribute(){}},
 addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:e=>{events.push(e.type);listeners.get(e.type)?.(e)}};
 const ctx={document,window:{},performance:{now:()=>clock},Date:class extends Date{static now(){return clock}},URLSearchParams,AbortSignal,CustomEvent:class{constructor(type){this.type=type}},setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),fetch:async url=>{calls.push(url);if(fail)throw Error('OFFLINE');if(conflict&&url.includes('fast-view')){conflict=false;revision++;return{status:409,ok:false}}return{status:200,ok:true,json:async()=>url.includes('fast-summary')?{ok:true,contentRevision:revision,ledgerTotal:1,marketCounts:{all:1},stale}:{ok:true,contentRevision:revision,rows:[{id:'real-row'}],totalRows:1,metrics:{ledgerTotal:1},performance:{unitPoints:[]}}}}};
 vm.runInNewContext(source,ctx);
 return{api:ctx.window.BALL46_STATISTICS_FAST,document,calls,events,timers,advance:async()=>{clock+=6000;const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);await entry[1]()}},setRevision:v=>revision=v,setFail:v=>fail=v,setStale:v=>stale=v,setConflict:v=>conflict=v};
}
test('Browser polls only derived endpoints and no-op refresh does not repaint',async()=>{const h=harness();await h.api.open();await h.advance();assert(!h.events.includes('ball46:statistics-fast-refresh'));assert(h.calls.every(x=>x.startsWith('/api/statistics/fast-')));});
test('New revision and stale transition each refresh the visible view',async()=>{const h=harness();await h.api.open();h.setRevision(2);await h.advance();assert.equal(h.events.filter(x=>x==='ball46:statistics-fast-refresh').length,1);h.setStale(true);await h.advance();assert.equal(h.events.filter(x=>x==='ball46:statistics-fast-refresh').length,2);});
test('409 between summary and view retries without mixing revisions',async()=>{const h=harness();h.setConflict(true);const r=await h.api.open();assert.equal(r.summary.contentRevision,2);assert.equal(r.view.contentRevision,2);});
test('Offline polling recovers; leaving Statistics stops polling',async()=>{const h=harness();await h.api.open();h.setFail(true);await h.advance();assert.equal(h.document.body.dataset.b46StatsSourceStale,'true');assert.equal(h.timers.size,1);h.setFail(false);h.setRevision(2);await h.advance();assert(h.events.includes('ball46:statistics-fast-refresh'));h.document.body.dataset.workspaceView='live';h.document.dispatchEvent({type:'ball46:workspace-view'});assert.equal(h.timers.size,0);});
