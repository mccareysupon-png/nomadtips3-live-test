import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
const D='work/statistics-summary-shadow-20261113',require=createRequire(resolve(D+'/.runtime/resolve.cjs')),{Miniflare}=require('miniflare'),{build}=require('esbuild');
const input=JSON.parse(await readFile(D+'/reference/ui-proof/qa/verified-full-ledger.json'));
await build({entryPoints:[D+'/summary-service.mjs'],bundle:true,format:'esm',platform:'browser',loader:{'.txt':'text'},external:['cloudflare:*'],outfile:D+'/qa/service-bundle.mjs'});
let reads=0,pages=0,providers=0,fail=false;const paths=[],results=[];
const mf=new Miniflare({modules:true,script:await readFile(D+'/qa/service-bundle.mjs','utf8'),compatibilityDate:'2026-08-06',cf:false,durableObjects:{SUMMARY:{className:'StatisticsSummary',useSQLite:true}},serviceBindings:{ENGINE:async request=>{
 reads++;const u=new URL(request.url);paths.push(u.pathname);assert.equal(request.method,'GET');if(fail)return new Response('Unavailable',{status:503});
 if(u.pathname==='/ledger-health')return Response.json({...input.meta,ok:true,updatedAt:input.asOf});
 assert.equal(u.pathname,'/statistics');assert.equal(u.searchParams.get('paged'),'1');const c=u.searchParams.get('cursor');assert(c?.startsWith('stat:v2:row:'));const offset=c==='stat:v2:row:\uffff'?0:Number(c.slice('stat:v2:row:'.length));pages++;const rows=input.rows.slice(offset,offset+500),hasMore=offset+500<input.rows.length;
 return Response.json({...input.meta,ok:true,total:input.meta.settledTotal,ledgerUpdatedAt:input.asOf,rows,hasMore,nextCursor:hasMore?'stat:v2:row:'+(offset+500):null});
}},outboundService:()=>{providers++;throw Error('PROVIDER_FORBIDDEN')}});
try{
 const responses=await Promise.all(Array.from({length:4},()=>mf.dispatchFetch('https://service.internal/summary')));const data=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return r.json()}));
 assert(data.every(d=>d.ok&&d.ledgerTotal===input.rows.length&&d.asOf===input.asOf));assert.equal(pages,Math.ceil(input.rows.length/500));results.push('Four simultaneous readers share one complete bounded pass');
 const before=reads;await mf.dispatchFetch('https://service.internal/summary');assert.equal(reads,before);results.push('Repeated readers reuse shared cache');
 const blocked=await mf.dispatchFetch('https://service.internal/summary',{method:'POST'});assert.equal(blocked.status,404);assert.equal(reads,before);results.push('No mutation endpoint');
 await new Promise(r=>setTimeout(r,5100));fail=true;const r=await mf.dispatchFetch('https://service.internal/summary'),saved=await r.json();assert.equal(r.status,200);assert(saved.stale&&saved.ledgerTotal===input.rows.length&&saved.asOf===input.asOf);results.push('Source failure preserves previous counts and source timestamp, marked stale');
 const afterFailure=reads;assert((await (await mf.dispatchFetch('https://service.internal/summary')).json()).stale);assert.equal(reads,afterFailure);results.push('Failure cooldown remains stale without retry burst');
 assert.equal(providers,0);assert(paths.every(p=>p==='/statistics'||p==='/ledger-health'));results.push('No upstream requests or Engine writes');
 const build=JSON.parse(await readFile(D+'/qa/combined/build.json'));for(const asset of build.newMedia){const r=await mf.dispatchFetch('https://service.internal'+asset.path);assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,asset.bytes);}results.push('Four approved banner assets served with exact byte lengths');
}finally{await mf.dispose()}
await writeFile(D+'/qa/service-runtime.json',JSON.stringify({ok:true,checks:results.length,results,reads,pages,providerRequests:providers,sourceWrites:0,compatibilityDate:'2026-08-06',limit:'Local workerd; hosted candidate verification remains required'},null,2));
console.log('SUMMARY_SERVICE_RUNTIME '+JSON.stringify({ok:true,checks:results.length,reads,pages,providerRequests:providers}));
