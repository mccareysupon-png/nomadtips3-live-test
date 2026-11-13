import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {runInNewContext} from 'node:vm';import {patchWorkspace} from './patch.mjs';
const D='work/engine-memory-diagnosis-20261113';await mkdir(D+'/qa',{recursive:true});
const raw=await readFile('work/engine-memory-diagnosis-20261113/source/workspace-0.js','utf8'),patched=patchWorkspace(raw);
await writeFile(D+'/workspace.js',patched);
const i=patched.indexOf('window.BALL46_STATISTICS_DATA = '),source=patched.slice(0,patched.indexOf('})();',i)+5);
import {ledger,feed,page} from './model.mjs';
function make(n,mode){const rows=ledger(n),calls=[];let failure=true;const ctx={window:{},URLSearchParams,AbortSignal,Date,Object,console,fetch:async url=>{const u=new URL(url,'https://test.invalid');calls.push(u);assert.equal(u.searchParams.get('paged'),'1','UNPAGED_REQUEST');const data=page(rows,u.searchParams.get('cursor'));
 if(mode==='http'&&failure){failure=false;return{ok:false,json:async()=>({ok:false})}}
 if(mode==='timeout'&&failure){failure=false;throw Error('SIMULATED_TIMEOUT')}
 if(mode==='malformed'&&failure){failure=false;return{ok:true,json:async()=>{throw SyntaxError('SIMULATED_INVALID_JSON')}}}
 if(mode==='changed'&&u.searchParams.has('cursor'))data.ledgerUpdatedAt=2;
 if(mode==='cycle')data.nextCursor='500';
 if(mode==='duplicate'&&u.searchParams.has('cursor'))data.rows[0]=rows[0];
 if(mode==='missing')data.rows=data.rows.slice(1);
 if(mode==='wrongCounts')data.win++;
 if(mode==='emptyMore'){data.rows=[];data.hasMore=true;data.nextCursor='500'}
 return{ok:true,json:async()=>structuredClone(data)}}};runInNewContext(source,ctx);return{api:ctx.window.BALL46_STATISTICS_DATA,rows,calls};}
const results=[];
for(const n of [0,1,499,500,501,2000,5000,15000]){const h=make(n),j=await h.api.load();assert.deepEqual(Array.from(j.ledgerRows,x=>x.id),h.rows.map(x=>x.id));assert.equal(j.rows.length,feed(h.rows).total);assert.equal(h.calls.length,Math.max(1,Math.ceil(n/500)));results.push({name:'Complete cursor dataset '+n,ok:true,pages:h.calls.length});}
for(const mode of ['http','timeout','malformed','changed','cycle','duplicate','missing','wrongCounts','emptyMore']){const h=make(1001,mode);await assert.rejects(h.api.load());assert.equal(h.api.getSnapshot(),null);assert(h.calls.length<=4,'UNBOUNDED_RETRY');if(['http','timeout','malformed'].includes(mode)){await h.api.load();assert(h.api.getSnapshot());}results.push({name:'Reject safely: '+mode,ok:true});}
{const h=make(1500),[a,b]=await Promise.all([h.api.load(),h.api.load()]);assert.equal(a,b);assert.equal(h.calls.length,3);await h.api.load();assert.equal(h.calls.length,3);assert(Object.isFrozen(a)&&Object.isFrozen(a.rows));results.push({name:'Coalesced concurrent loads, cached reload and immutable snapshot',ok:true});}
assert.throws(()=>patchWorkspace('unrelated'));results.push({name:'Reject source drift',ok:true});
await writeFile(D+'/qa/core.json',JSON.stringify({ok:true,checks:results.length,productionRequests:0,providerRequests:0,results},null,2));console.log(JSON.stringify({ok:true,checks:results.length}));
