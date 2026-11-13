import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {formulas,registry} from '../statistics-summary-shadow-20261113/generated-summary-formulas.mjs';
const D='work/statistics-content-revision-20261113',UP='work/statistics-summary-shadow-20261113';
const require=createRequire(resolve(UP+'/.runtime/resolve.cjs')),{Miniflare}=require('miniflare'),{build}=require('esbuild');
export async function integrated(){
 const input=JSON.parse(await readFile(UP+'/reference/ui-proof/qa/verified-full-ledger.json'));
 // Undo response-only display projection before importing the recorded Ledger copy.
 const rows=input.rows.map(r=>r.status==='PENDING'?{...r,entryMinute:r.signalEntryMinute??r.entryMinute,result:null}:r);
 for(const [name,entry]of [['engine','engine-harness.mjs'],['summary','summary-harness.mjs']])await build({entryPoints:[D+'/'+entry],bundle:true,format:'esm',platform:'browser',external:['cloudflare:*'],outfile:D+'/qa/'+name+'-runtime.mjs'});
 let sourcePages=0,sourceReads=0,providers=0,hook=null,fail=false;const results=[];
 let mf;mf=new Miniflare({workers:[
  {name:'engine',modules:true,script:await readFile(D+'/qa/engine-runtime.mjs','utf8'),compatibilityDate:'2026-08-06',cf:false,durableObjects:{LEDGER:{className:'TestEngine',useSQLite:true}},outboundService:()=>{providers++;throw Error('PROVIDER_FORBIDDEN')}},
  {name:'summary',modules:true,script:await readFile(D+'/qa/summary-runtime.mjs','utf8'),compatibilityDate:'2026-08-06',cf:false,durableObjects:{SUMMARY:{className:'TestSummary',useSQLite:true}},serviceBindings:{ENGINE:async request=>{sourceReads++;if(fail)return new Response('Test failure',{status:503});const path=new URL(request.url).pathname;assert.equal(request.method,'GET');assert(['/ledger-health','/statistics'].includes(path));if(path==='/statistics'){sourcePages++;if(hook){const f=hook;hook=null;await f()}}return(await mf.getWorker('engine')).fetch(request)}},outboundService:()=>{providers++;throw Error('PROVIDER_FORBIDDEN')}}]});
 const engine=await mf.getWorker('engine'),summary=await mf.getWorker('summary');
 const importRows=async part=>{const r=await engine.fetch('https://local.test/__qa/import',{method:'POST',body:JSON.stringify(part)});assert.equal(r.status,200);return r.json()};
 const get=async(path)=>{const r=await summary.fetch('https://local.test'+path);assert.equal(r.status,200,'SUMMARY_HTTP_'+r.status+':'+await r.clone().text());return r.json()};
 const reset=()=>summary.fetch('https://local.test/__qa/check');
 fail=true;const coldReads=sourceReads;for(let i=0;i<3;i++){const r=await summary.fetch('https://cold.local.test/summary');assert.equal(r.status,503)}assert.equal(sourceReads-coldReads,1);fail=false;results.push('Cold source outage has a shared five-second cooldown, no request burst');
 for(let i=0;i<rows.length;i+=500)await importRows(rows.slice(i,i+500));
 const health=async()=> (await engine.fetch('https://local.test/ledger-health')).json();
 const baseline=await health();assert.equal(baseline.ledgerTotal,rows.length);for(const k of ['settledTotal','pending','unresolved','win','loss','push','halfWin','halfLoss'])assert.equal(baseline[k],input.meta[k],'RECORDED_'+k);assert.deepEqual(baseline.byMarket,input.meta.byMarket);
 results.push('All recorded Ledger counters and market totals unchanged after isolated import');
 const t=performance.now(),small=await get('/summary'),coldSummaryMs=performance.now()-t;
 assert.equal(small.ledgerTotal,rows.length);assert.equal(small.contentRevision,baseline.contentRevision);
 assert.deepEqual(small.daily,formulas.aggregate(rows));
 const counts={all:rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};for(const row of rows)counts[registry.familyOf(row)]++;assert.deepEqual(small.marketCounts,counts);
 results.push('Actual Engine + Summary DO aggregation equals unchanged current Website formulas for every market');
 const allPages=async first=>{const all=[...first.rows];let cursor=first.nextCursor;while(cursor){const p=await get('/history?'+new URLSearchParams({cursor,limit:2000}));assert.equal(p.statisticsSnapshotId,first.statisticsSnapshotId);all.push(...p.rows);cursor=p.nextCursor}return all};
 let first=await get('/history'),all=await allPages(first);assert.equal(all.length,rows.length);assert.equal(new Set(all.map(x=>x.id)).size,rows.length);const frozen=structuredClone(all);
 results.push('Complete immutable history without missing or duplicate IDs');
 const priorPages=sourcePages,priorRevision=small.contentRevision;await new Promise(r=>setTimeout(r,5));await importRows(rows.slice(0,1));await reset();const noOp=await get('/summary');assert.equal(noOp.contentRevision,priorRevision);assert.equal(sourcePages,priorPages);assert(noOp.asOf>=small.asOf);
 results.push('No-op Engine sync advances freshness with zero Summary history rereads');
 const mutation={...rows.find(r=>r.status==='SETTLED'),id:'isolated-mutation-'+Date.now(),createdAt:Date.now(),settledAt:Date.now()};await importRows([mutation]);await reset();const changed=await get('/summary');assert.equal(changed.ledgerTotal,rows.length+1);assert(changed.contentRevision>priorRevision);assert.deepEqual(await allPages(first),frozen);
 results.push('Actual Ledger insert during an open reader does not alter any page of the old published snapshot');
 // Source changes while constructing a new generation: retry boundedly, publish only a complete generation.
 await importRows([{...mutation,id:'before-build'}]);await reset();hook=()=>importRows([{...mutation,id:'during-build'}]);const concurrent=await get('/summary');assert.equal(concurrent.ledgerTotal,rows.length+3);const latest=await get('/history');assert.equal((await allPages(latest)).length,rows.length+3);
 results.push('Ledger write during Summary build is fenced and rebuilt without mixing revisions');
 const pending={...rows.find(r=>r.status==='PENDING')};if(pending.id){await importRows([{...pending,status:'SETTLED',result:'WIN',settledAt:Date.now(),finalScore:{home:2,away:1}}]);await reset();const settled=await get('/summary');assert(settled.contentRevision>concurrent.contentRevision);assert.equal(settled.total,concurrent.total+1);results.push('Pending to settlement correction changes revision and preserves exact aggregate totals')}
 fail=true;await reset();const saved=await get('/summary');assert(saved.stale);assert.equal(saved.ledgerTotal,rows.length+3);fail=false;results.push('Source outage preserves last verified summary, explicitly stale');
 assert.equal(providers,0);const denied=await summary.fetch('https://local.test/summary',{method:'POST'});assert.equal(denied.status,404);results.push('No provider request, Production storage or mutation endpoint');
 const proof={ok:true,checks:results.length,results,recordedRows:rows.length,baseline,sourcePages,sourceReads,providerRequests:providers,productionWrites:0,coldSummaryMs,environment:'Local workerd two actual Durable Objects; not hosted Production'};
 await writeFile(D+'/qa/integration.json',JSON.stringify(proof,null,2));console.log('INTEGRATED_TEST '+JSON.stringify({ok:true,checks:results.length,recordedRows:rows.length,coldSummaryMs,sourcePages}));
 return {mf,engine,summary,input,rows,proof,reset,get,health,metrics:()=>({sourcePages,sourceReads,providers}),dispose:()=>mf.dispose()};
}
if(process.argv[1]?.endsWith('/integration.mjs')){const context=await integrated();await context.dispose()}
