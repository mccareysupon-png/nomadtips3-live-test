import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{validDisplaySnapshot,projectLiveDisplay}from'./model.mjs';
let passed=0;const results=[];function test(name,fn){fn();passed++;results.push(name)}
const t=Date.now(),base=[{fixtureId:'x',boardState:'live',minute:60,goals:{home:0,away:0,halfHome:0,halfAway:0},providerOdds:{keep:true},events:[{kind:'corner'}],home:{name:'Home'},away:{name:'Away'}},{fixtureId:'y',boardState:'scheduled',minute:0,goals:{home:null,away:null}}],snap=(extra={})=>({ok:true,cacheOnly:true,externalRequestsAdded:0,fetchedAt:t,liveFetchedAt:t,fixtures:[{fixtureId:'x',boardState:'live',minute:61,goals:{home:1,away:0}}],...extra}),board={hubFetchedAt:t-10000};
test('valid cache snapshot accepted',()=>assert(validDisplaySnapshot(snap(),t)));
for(const[name,extra]of[['provider response',{cacheOnly:false}],['side effects',{externalRequestsAdded:1}],['stale flag',{stale:true}],['old data',{fetchedAt:t-90001}],['old LIVE despite fresh TODAY',{liveFetchedAt:t-90001}],['future data',{fetchedAt:t+6000}],['error payload',{ok:false}],['missing fixtures',{fixtures:null}]]){
test('reject '+name,()=>assert(!validDisplaySnapshot(snap(extra),t)));}
test('score/minute advance',()=>{const r=projectLiveDisplay(base,snap(),board,t);assert.equal(r[0].minute,61);assert.equal(r[0].goals.home,1)});
test('provider score correction may decrease',()=>{const r=projectLiveDisplay(projectLiveDisplay(base,snap(),board,t),snap({fixtures:[{fixtureId:'x',boardState:'live',minute:62,goals:{home:0,away:0}}]}),board,t);assert.equal(r[0].goals.home,0)});
test('no fixture removal or creation',()=>{const r=projectLiveDisplay(base,snap({fixtures:[...snap().fixtures,{fixtureId:'new',boardState:'live'}]}),board,t);assert.deepEqual(r.map(f=>f.fixtureId),['x','y']);assert.equal(r[1],base[1])});
test('odds/events/team references preserved',()=>{const r=projectLiveDisplay(base,snap(),board,t);for(const k of['providerOdds','events','home','away'])assert.equal(r[0][k],base[0][k])});
test('older snapshot never overwrites newer board',()=>assert.equal(projectLiveDisplay(base,snap(),{hubFetchedAt:t+1},t),base));
test('same data preserves fixture reference',()=>assert.equal(projectLiveDisplay(base,snap({fixtures:[base[0]]}),board,t)[0],base[0]));
test('partial goals preserve other score fields',()=>{const r=projectLiveDisplay(base,snap({fixtures:[{fixtureId:'x',goals:{home:2}}]}),board,t);assert.deepEqual(r[0].goals,{home:2,away:0,halfHome:0,halfAway:0})});
test('invalid goals cannot overwrite',()=>{const r=projectLiveDisplay(base,snap({fixtures:[{fixtureId:'x',goals:{home:-1,away:null}}]}),board,t);assert.equal(r[0],base[0])});
test('FT transition and subsequent FT correction',()=>{const ft={fixtureId:'x',boardState:'finished',status:'Finished',statusCode:'FT',goals:{home:2,away:1}};const r=projectLiveDisplay(base,snap({fixtures:[ft]}),board,t);assert.equal(r[0].boardState,'finished');assert.equal(projectLiveDisplay(r,snap({fixtures:[{...ft,goals:{home:1,away:1}}]}),board,t)[0].goals.home,1)});
const inspection=JSON.parse(await readFile(new URL('./audit/inspection.json',import.meta.url))),contracts=inspection.contracts;
test('legacy Engine board can invoke scan; do not accelerate it',()=>assert(contracts.some(c=>c.worker.includes('engine')&&c.name==='fetch'&&c.source.includes('await this.scanIfDue()'))));
const snapshotContract=contracts.filter(c=>c.worker.includes('hub')&&c.name==='snapshot').at(-1);assert(snapshotContract.source.includes('cacheOnly: true'));assert(!snapshotContract.source.includes('refreshIfDue'));
const factory=new Function('VERSION2','STALE_MS2','now3','return class{'+snapshotContract.source+'}'),Hub=factory('TEST',90000,()=>t),hub=new Hub();let provider=0,engine=0;Object.assign(hub,{meta:async()=>({fetchedAt:t,liveFetchedAt:t}),state:async()=>({}),control:async()=>({liveRefreshSeconds:10}),readRows:async()=>base,refreshIfDue:async()=>{provider++;throw Error('PROVIDER_FORBIDDEN')}});
for(let i=0;i<100;i++){const x=await hub.snapshot();assert.equal(x.cacheOnly,true);assert.equal(x.externalRequestsAdded,0)}
test('100 exact current cache getter reads add no provider or Engine calls',()=>{assert.equal(provider,0);assert.equal(engine,0)});
const routeContract=contracts.find(c=>c.worker==='ball46-production'&&c.name==='fetch'&&c.source.includes('url.pathname.startsWith("/api/hub/")'));
const Site=new Function('hubRequest','return class{'+routeContract.source+'}')((request,path)=>new Request('https://hub.internal'+path,request)),site=new Site();
for(let i=0;i<100;i++){const response=await site.fetch(new Request('https://ball46.com/api/hub/snapshot'),{HUB:{fetch:async request=>{assert.equal(new URL(request.url).pathname,'/snapshot');return Response.json(await hub.snapshot());}},ENGINE:{fetch:async()=>{engine++;throw Error('ENGINE_FORBIDDEN');}}});assert.equal((await response.json()).cacheOnly,true);}
test('100 current website HUB routes add no Engine scan or provider call',()=>{assert.equal(engine,0);assert.equal(provider,0)});
const after=await readFile(new URL('./stage/dashboard-after.js',import.meta.url),'utf8');
test('5s path uses HUB snapshot, baseline loops unchanged',()=>{assert(after.includes("fetch('/api/hub/snapshot?_='"));for(const v of ['POLL_MS=30_000','SIGNAL_POLL_MS=30_000','SCOREBAR_STATS_POLL_MS=60_000'])assert(after.includes(v));});
await writeFile(new URL('./audit/unit-tests.json',import.meta.url),JSON.stringify({ok:true,passed,results,cacheReads:100,providerRequestsAdded:0,engineScansAddedByFastLoop:0},null,2));console.log(JSON.stringify({ok:true,passed}));


