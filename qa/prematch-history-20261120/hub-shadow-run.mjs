import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {patchHub} from './hub-clone-patch.mjs';
import {DatabaseSync} from 'node:sqlite';
import {init,totals,coverage,dailyPlan,DAY,ingest} from './history.mjs';
import {initBackfill,processLeaguePage,planSummary} from './backfill.mjs';
import {initJohn,prepareCatalog,registerCatalogCurrent,prepareDay,observeUnresolved,prepareUnknown,executeJohnStep} from './john-sync.mjs';
import {fixture} from './sample.mjs';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const hub='nomadtips3-5usd-hub-343';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const active=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;const v=await cf('/workers/'+hub+'/versions/'+active+'?include=modules');
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'b46-hub-shadow-'));const dir=new URL('.',import.meta.url);
try{
 await fs.writeFile(path.join(tmp,'package.json'),'{"type":"module"}');
 for(const m of v.modules.filter(m=>m.content_base64&&/\.(m?js)$/.test(m.name))){
  const s=Buffer.from(m.content_base64,'base64').toString();
  assert(!m.name.includes('/')&&!m.name.includes('..'));
  await fs.writeFile(path.join(tmp,m.name),m.name===v.main_module?patchHub(s):s);
 }
 for(const f of ['hub-history-authority.mjs','history-gateway.mjs'])await fs.copyFile(new URL(f,dir),path.join(tmp,f));
 // From this point, the network is entirely disabled; all provider responses
 // originate from the deterministic mock. No API keys or production bindings.
 const realFetch=globalThis.fetch;
 let now=Date.now(),remaining=40,calls=[],mode=200,mockPayload=null;
 const hdr=()=>({'x-ratelimit-limit':'40','x-ratelimit-remaining':String(remaining),'x-ratelimit-reset':String(Math.floor(now/1000)+30)});
 const transport=async url=>{const u=new URL(url);assert.equal(u.hostname,'api.5dollarfootballapi.com');calls.push(u.pathname+u.search);remaining--;return Response.json(mockPayload?.(u)??{success:1,data:[],pagination:{page:1,has_more:false}},{status:mode,headers:mode===429?{...hdr(),'retry-after':'120'}:hdr()})};
 globalThis.fetch=transport;
 class Storage{
  constructor(){this.data=new Map();this.serial=Promise.resolve()}
  async get(k){return structuredClone(this.data.get(k))}
  async put(k,v){this.data.set(k,structuredClone(v))}
  async transaction(f){const run=this.serial.then(async()=>{const backup=new Map(this.data);try{return await f(this)}catch(e){this.data=backup;throw e}});this.serial=run.catch(()=>{});return run}
 }
 const mod=await import(pathToFileURL(path.join(tmp,v.main_module)).href);
 const {BulkSpeedPolicy,TELEMETRY}=await import(pathToFileURL(path.join(tmp,'speed-policy.mjs')).href);
 const {HistoryAuthority,historyHandler}=await import(pathToFileURL(path.join(tmp,'hub-history-authority.mjs')).href);
 const store=new Storage(),policy=new BulkSpeedPolicy(store,()=>now);
 const shadow={bulkSpeed:policy};const stub={fetch:(url,init)=>mod.__testAttachHistory(shadow,new Request(url,init))};
 const env={HUB:{idFromName:()=>0,get:()=>stub}};
 const live=()=>mod.__testBulk('https://api.5dollarfootballapi.com/v1/fixtures?status=live','test-key',policy,'ALARM_LIVE');
 const rich=()=>mod.__testRich('https://api.5dollarfootballapi.com/v1/fixtures/123/odds','test-key',mod.__testRichRPC(env));
 const req=()=>new Request('https://hub.internal/internal/prematch-history/page',{method:'POST',headers:{'x-test':'ok','content-type':'application/json'},body:JSON.stringify({path:'/v1/leagues/123/fixtures?status=finished&season=26%2F27&per_page=100&page=1'})});
 const a=new HistoryAuthority(policy,{clock:()=>now,enabled:true,coordinated:true});
 const handler=historyHandler({policy,authority:a,authorize:r=>r.headers.get('x-test')==='ok',transport:p=>transport('https://api.5dollarfootballapi.com'+p),clock:()=>now});
 const hist=async()=>await(await handler(req())).json();
 const off=historyHandler({policy,authority:new HistoryAuthority(policy,{clock:()=>now}),authorize:()=>true,transport:()=>{throw Error('DISABLED_TRANSPORT')},clock:()=>now});
 assert.equal((await(await off(req())).json()).reason,'HISTORY_DISABLED');assert.equal(calls.length,0);
 await live();assert.equal(calls.length,1);await rich();assert.equal(calls.length,2);
 let t=await policy.telemetry();assert(t.requests.some(x=>x.kind==='ALARM_LIVE')&&t.requests.some(x=>x.kind==='RICH_ODDS'));assert.equal(t.pending.length,0);assert.equal(t.provider.remaining,38);
 assert.equal((await hist()).status,200);assert.equal(calls.length,3);assert.equal((await hist()).reason,'HISTORY_PACE');assert.equal(calls.length,3);
 now+=61000;remaining=40;await live();let lease=await policy.before('https://api.5dollarfootballapi.com/v1/fixtures','TODAY');
 assert.equal((await hist()).reason,'LIVE_PRIORITY');await policy.failed(lease);
 mode=429;assert.equal((await hist()).status,429);mode=200;assert.equal((await hist()).reason,'PROVIDER_COOLDOWN');const n=calls.length;await assert.rejects(live);assert.equal(calls.length,n);
 // Actual public router still blocks Rich; no network request from viewers.
 const viewer=await mod.default.fetch(new Request('https://example.invalid/rich-odds?fixture_id=123'),{},{});assert.equal(viewer.status,410);assert.equal(calls.length,n);
 // Every successful, mock provider call came through one policy.
 t=await policy.telemetry();assert.equal(t.response429,1);assert.equal(t.pending.length,0);

 // Run the actual persisted John queue against the same shadow authority and
 // real bulk/rich transport wrappers, never against the live provider.
 const sqlite=new DatabaseSync(':memory:');
 const db={exec:(s,...args)=>{const q=sqlite.prepare(s);return /^\s*SELECT/i.test(s)?q.all(...args):(q.run(...args),[])},transaction:fn=>{sqlite.exec('BEGIN');try{const out=fn();sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 init(db);initBackfill(db);initJohn(db);
 const sec=()=>Math.floor(now/1000),cycle=()=>dailyPlan(sec()).cycle;
 const page=(data,p=1,more=false)=>({success:1,data,pagination:{page:p,has_more:more}});
 const refTime=sec()-30*DAY;
 const training=Array.from({length:20},(_,i)=>fixture(1000+i,refTime-i*DAY, i<10?1:2, 100+i, i%4, i%3));
 let dailyFixture;
 mockPayload=u=>{
   const p=Number(u.searchParams.get('page')??1);
   if(u.pathname==='/v1/leagues')return page([{id:123,seasons:[{season:'26/27',current:true}]}]);
   if(u.pathname==='/v1/leagues/123/fixtures')return page(training.slice((p-1)*10,p*10),p,p===1);
   if(u.pathname==='/v1/fixtures'&&u.searchParams.get('status')==='finished'){
    const start=Number(u.searchParams.get('start_time')),end=Number(u.searchParams.get('end_time'));
    if(dailyFixture&&dailyFixture.kickoff_ts>=start&&dailyFixture.kickoff_ts<end)return page([dailyFixture]);
    return page([]);
   }
   if(u.pathname==='/v1/fixtures/9911')return {success:1,data:fixture(9911,refTime,7,8,1,1)};
   return page([]);
 };
 const bridge=async path=>(await handler(new Request('https://hub.internal/internal/prematch-history/page',{method:'POST',headers:{'x-test':'ok','content-type':'application/json'},body:JSON.stringify({path})}))).json();
 const advance=async (ms=61000)=>{now+=ms;remaining=40;await live()};
 await advance(121000);
 const ck=prepareCatalog(db,'shadow-one-time',sec()-180*DAY);
 const step=key=>executeJohnStep(db,{key,now:sec(),centralGateway:bridge});
 assert.equal((await step(ck)).state,'complete');
 const catalogCount=calls.length;
 assert.equal((await step(ck)).requests,0);assert.equal(calls.length,catalogCount);
 assert.deepEqual(registerCatalogCurrent(db,[123],sec()),{ready:1,missing:0,noSeason:0});
 const seed=()=>processLeaguePage(db,{scope:'season:26/27',league:123,now:sec(),centralGateway:bridge});
 await advance();assert.equal((await seed()).state,'pending');
 assert.equal(totals(db).fixtures,10);
 await advance();assert.equal((await seed()).state,'complete');
 assert.equal(totals(db).fixtures,20);
 const latest=calls.length;
 assert.equal((await seed()).requests,0);assert.equal(calls.length,latest);
 const h=coverage(db,1,sec()+3600,sec()),aw=coverage(db,2,sec()+3600,sec());
 assert(h.complete&&aw.complete);assert.equal(h.count,10);assert.equal(aw.count,10);
 assert.equal(planSummary(db).backfillRequests,2);
 // Both daily windows created once, including next-day correction. One
 // synthetic new result inserted, next day score corrected, same ID remains.
 await advance();
 const first=prepareDay(db,sec());
 const window=first.windows.find(w=>w.kind==='daily');
 dailyFixture=fixture(9910,window.start+1,1,2,2,0);
 const pending=()=>db.exec("SELECT * FROM john_tasks WHERE state='pending' AND kind IN ('daily','recheck') ORDER BY task_key");
 for(const task of pending()){await advance();assert.equal((await step(task.task_key)).state,'complete')}
 assert.equal(totals(db).fixtures,21);
 const done=calls.length;prepareDay(db,sec());
 for(const task of db.exec("SELECT * FROM john_tasks WHERE cycle=?",first.cycle))assert.equal((await step(task.task_key)).requests,0);
 assert.equal(calls.length,done);
 await advance(DAY*1000);dailyFixture={...dailyFixture,goals:{home:2,away:2}};
 prepareDay(db,sec());
 for(const task of pending()){await advance();assert.equal((await step(task.task_key)).state,'complete')}
 assert.equal(totals(db).fixtures,21);
 assert.equal(db.exec('SELECT COUNT(*) AS n FROM result_version WHERE fixture_id=?',9910)[0].n,2);
 assert.equal(coverage(db,1,sec()+3600,sec()).matches[0].result,'D');
 const unknown=fixture(9911,refTime,7,8,null,null,'unknown');
 ingest(db,[unknown],sec());observeUnresolved(db,[unknown],sec());prepareUnknown(db,sec());
 const uk=db.exec("SELECT task_key FROM john_tasks WHERE kind='unknown' AND state='pending'")[0].task_key;
 await advance();assert.equal((await step(uk)).state,'complete');
 assert.equal(totals(db).unknown,0);assert.equal(totals(db).fixtures,22);
 assert.equal((await step(uk)).requests,0);
 const n2=calls.length;registerCatalogCurrent(db,[123],sec());assert.equal((await seed()).requests,0);assert.equal(calls.length,n2);
 assert.equal(calls.filter(x=>x.startsWith('/v1/leagues?')).length,1);
 const seeds=calls.filter(x=>x.startsWith('/v1/leagues/123/fixtures')&&x.includes('season=26%2F27'));
 // First two policy probe calls preceded the queue; the actual seed itself is exactly two pages.
 assert.equal(planSummary(db).backfillRequests,2);
 assert.equal(calls.filter(x=>x.startsWith('/v1/teams/')).length,0);
 const evidence={catalogRequests:1,seedRequests:2,initialFixtures:20,homeHistory:h.count,awayHistory:aw.count,dailyAndCorrectionRequests:db.exec("SELECT SUM(attempts) AS n FROM john_tasks WHERE kind IN ('daily','recheck')")[0].n,unknownRequests:1,finalFixtures:totals(db).fixtures,duplicates:db.exec('SELECT COUNT(*) AS n FROM (SELECT fixture_id,observed,COUNT(*) AS n FROM result_version GROUP BY fixture_id,observed HAVING COUNT(*)>1)')[0].n,perTeamCalls:0,realProviderCalls:0,scope:'SYNTHETIC_ONLY'};
 assert.equal(evidence.duplicates,0);
 sqlite.close();console.log('JOHN_SHADOW_E2E',JSON.stringify(evidence));

 globalThis.fetch=realFetch;
 const after=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 console.log('SHARED_HUB_SHADOW',JSON.stringify({active,unchanged:after===active,actualSourcePatched:true,liveRichHistorySameTelemetry:true,shadowCalls:calls.length,realProviderCalls:0,viewerBlocked:true,historyDefaultOff:true,rateLimitShared:true,historyPacing:true,livePriority:true,productionDeployed:false}));
 assert.equal(after,active);
}finally{await fs.rm(tmp,{recursive:true,force:true})}
