// Two real, isolated Workerd DOs. This never connects to Production storage.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildEngineTest} from './build-current-engine-test.mjs';
import {projectLedgerRow} from './persisted-read-store.mjs';
const require=createRequire(new URL('./.runtime/package.json',import.meta.url)),{Miniflare}=require('miniflare'),{build}=require('esbuild');
const dir=fileURLToPath(new URL('./',import.meta.url));await buildEngineTest();
const engineCode=`import {Nomad343Engine} from './qa/engine-candidate.js';
export class IsolatedEngine extends Nomad343Engine{
 async scanIfDue(){throw Error('PROVIDER_SCAN_FORBIDDEN')}
 async fetch(request){const u=new URL(request.url);if(u.pathname==='/__qa/import'&&request.method==='POST')return Response.json(await this.upsertLedgerRows(await request.json()));return super.fetch(request)}
}
export default{fetch(request,env){return env.LEDGER.get(env.LEDGER.idFromName('isolated-live-copy')).fetch(request)}};`;
const registry=await readFile(new URL('./qa/live-base/registry.js',import.meta.url),'utf8');
await writeFile(new URL('./qa/current-registry.mjs',import.meta.url),'const window={};\n'+registry+'\nexport const registry=window.BALL46_MARKET_REGISTRY;');
const summaryCode=`import {DurableObject} from 'cloudflare:workers';
import {PersistedReadStore} from './persisted-read-store.mjs';import {PinnedSourceReader} from './pinned-source-reader.mjs';import {registry} from './qa/current-registry.mjs';
export class IsolatedSummary extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.store=new PersistedReadStore(ctx.storage);this.reader=new PinnedSourceReader(this.store,env.ENGINE,{registry,budgetMs:120000})}
 async fetch(request){const u=new URL(request.url);if(u.pathname==='/__qa/refresh'){try{return Response.json(await this.reader.refresh())}catch(e){return Response.json({ok:false,error:e.message},{status:503})}}
 if(u.pathname==='/summary')return Response.json(await this.store.summary());
 const out=await this.store.view({revision:Number(u.searchParams.get('revision')),page:Number(u.searchParams.get('page')||1)});return Response.json(out,{status:out.status||200});}
}
export default{fetch(request,env){return env.SUMMARY.get(env.SUMMARY.idFromName('isolated-read-model')).fetch(request)}};`;
async function bundle(contents){return(await build({stdin:{contents,resolveDir:dir,sourcefile:'qa-entry.mjs'},bundle:true,format:'esm',platform:'browser',external:['cloudflare:*'],write:false})).outputFiles[0].text}
const scripts=await Promise.all([bundle(engineCode),bundle(summaryCode)]);let mf,pages=0,reads=0,providers=0,hook=null,fail=false;
mf=new Miniflare({workers:[
 {name:'engine',script:scripts[0],modules:true,compatibilityDate:'2026-08-06',cf:false,durableObjects:{LEDGER:{className:'IsolatedEngine',useSQLite:true}},outboundService:()=>{providers++;throw Error('PROVIDER_FORBIDDEN')}},
 {name:'summary',script:scripts[1],modules:true,compatibilityDate:'2026-08-06',cf:false,durableObjects:{SUMMARY:{className:'IsolatedSummary',useSQLite:true}},serviceBindings:{ENGINE:async request=>{const p=new URL(request.url).pathname;assert.equal(request.method,'GET');assert(['/ledger-health','/statistics'].includes(p));reads++;if(fail)return new Response('QA source outage',{status:503});if(p==='/statistics'){pages++;if(hook){const f=hook;hook=null;await f()}}return(await mf.getWorker('engine')).fetch(request)}},outboundService:()=>{providers++;throw Error('PROVIDER_FORBIDDEN')}}
]});
try{
 const engine=await mf.getWorker('engine'),summary=await mf.getWorker('summary'),input=JSON.parse(await readFile(new URL('./qa/live-ledger.json',import.meta.url),'utf8'));
 const rows=input.rows.map(r=>projectLedgerRow(r.status==='PENDING'?{...r,entryMinute:r.signalEntryMinute??r.entryMinute,result:null}:r));
 async function insert(part){const r=await engine.fetch('https://engine.local.test/__qa/import',{method:'POST',body:JSON.stringify(part)});assert.equal(r.status,200,await r.clone().text());return r.json()}
 const health=async()=> (await engine.fetch('https://engine.local.test/ledger-health')).json();
 const get=async path=>(await summary.fetch('https://summary.local.test'+path)).json();
 const refresh=()=>summary.fetch('https://summary.local.test/__qa/refresh',{method:'POST'});
 const checks=[];
 for(let i=0;i<rows.length;i+=400)await insert(rows.slice(i,i+400));
 const firstHealth=await health();assert.equal(firstHealth.ledgerTotal,rows.length);assert.equal(firstHealth.settledTotal,input.first.total);checks.push('Actual Engine imported every fresh real row with unchanged settled total');
 let r=await refresh();assert.equal(r.status,200,await r.clone().text());let s=await get('/summary');assert.equal(s.ledgerTotal,rows.length);assert.equal(s.settledTotal,input.first.total);for(const key of ['win','loss','push','halfWin','halfLoss','pending','unresolved'])assert.equal(s[key],input.first[key],key);checks.push('Actual Engine to persisted read-model totals match every original outcome bucket');
 const counts={all:rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};const rc={window:{}};
 // Model partition is verified against the pure current Production registry.
 const {default:vm}=await import('node:vm');vm.runInNewContext(registry,rc);for(const row of rows)counts[rc.window.BALL46_MARKET_REGISTRY.familyOf(row)]++;
 assert.deepEqual(s.marketCounts,counts);checks.push('All eight market counters agree with current Production registry');
 const oldRevision=s.contentRevision,originalPage=await get('/view?revision='+oldRevision);assert.equal(originalPage.rows.length,50);
 const oldSource=(await health()).contentRevision,beforePages=pages;await insert(rows.slice(0,1));assert.equal((await health()).contentRevision,oldSource);r=await refresh();assert.equal(r.status,200);assert.equal((await get('/summary')).contentRevision,oldRevision);assert.equal(pages,beforePages);checks.push('No-op real Engine sync changes neither revision nor history-read count');
 const example=rows.find(r=>r.status==='SETTLED'),mutation={...example,id:'qa-only-new-signal',createdAt:Date.now(),settledAt:Date.now()};await insert([mutation]);
 hook=()=>insert([{...mutation,id:'qa-only-during-page'}]);r=await refresh();assert.equal(r.status,200,await r.clone().text());s=await get('/summary');assert.equal(s.ledgerTotal,rows.length+2);assert(s.contentRevision>oldRevision);assert.equal((await summary.fetch('https://summary.local.test/view?revision='+oldRevision)).status,409);checks.push('Ledger update during source pagination retries and never publishes a mixed generation');
 const good=structuredClone(s);let churn=0;const busy=async()=>{churn++;await insert([{...mutation,id:'qa-only-churn-'+churn}]);hook=busy};await insert([{...mutation,id:'qa-only-start-churn'}]);hook=busy;r=await refresh();hook=null;assert.equal(r.status,503);assert.equal(churn,3);s=await get('/summary');assert.equal(s.contentRevision,good.contentRevision);assert(s.stale);checks.push('Continuous source writes stop after three attempts and keep last-good data explicitly stale');
 r=await refresh();assert.equal(r.status,200,await r.clone().text());s=await get('/summary');assert.equal(s.ledgerTotal,rows.length+6);checks.push('After source churn ends, a complete current generation is published');
 fail=true;r=await refresh();assert.equal(r.status,503);const saved=await get('/summary');assert(saved.stale);assert.equal(saved.ledgerTotal,s.ledgerTotal);fail=false;checks.push('Source outage preserves previous results with stale flag');
 r=await refresh();assert.equal(r.status,200);assert(!(await get('/summary')).stale);assert.equal(providers,0);checks.push('Source recovery works with zero provider calls or Production writes');
 const result={ok:true,checks:checks.length,results:checks,sourceRows:rows.length,sourceReads:reads,sourcePages:pages,providerRequests:providers,productionWrites:0,runtime:'Two isolated real Workerd SQLite Durable Objects'};
 await writeFile(new URL('./qa/pinned-feed-runtime-result.json',import.meta.url),JSON.stringify(result,null,2));console.log('PINNED_FEED_RUNTIME',JSON.stringify(result));
}finally{await mf.dispose()}
