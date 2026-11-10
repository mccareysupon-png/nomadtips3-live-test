import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {before,after,patchMain} from './patch.mjs';
const dependencies="function oddsContainerHasData(value) {\n  if (Array.isArray(value)) return value.length > 0;\n  if (!value || typeof value !== \"object\") return false;\n  if (!Object.keys(value).length) return false;\n  const containers = [\n    value.bookmakers,\n    value.odds,\n    value.markets,\n    value?.data?.bookmakers,\n    value?.data?.odds,\n    value?.data?.markets\n  ];\n  if (containers.some((v) => Array.isArray(v) ? v.length > 0 : Boolean(v && typeof v === \"object\" && Object.keys(v).length))) return true;\n  return Object.keys(value).some((k) => /bet365|pinnacle|williamhill|ladbrokes|vcbet|1xbet|bwin|easybets|interwetten|betfair|snai|macauslot|betsson|betathome|18bet|10bet|12bet|coral|crown|bookmaker/i.test(String(k)));\n}\n\nfunction boardHasBookmakerOdds(board) {\n  const fixtures = Array.isArray(board?.fixtures) ? board.fixtures : [];\n  return fixtures.some(\n    (fixture) => oddsContainerHasData(fixture?.providerOdds) || oddsContainerHasData(fixture?.fullOdds) || oddsContainerHasData(fixture?.odds)\n  );\n}\n\nfunction engineRequest(request, path) {\n  const upstream = new URL(request.url);\n  upstream.protocol = \"https:\";\n  upstream.hostname = \"engine.internal\";\n  upstream.pathname = path;\n  return new Request(upstream, request);\n}\n\nfunction hubRequest(request, path) {\n  const upstream = new URL(request.url);\n  upstream.protocol = \"https:\";\n  upstream.hostname = \"hub.internal\";\n  upstream.pathname = path;\n  return new Request(upstream, request);\n}\n";
const results=[];
const fixture={fixtureId:'test-1',boardState:'live',minute:73,goals:{home:2,away:1},providerOdds:{bookmakers:[{name:'Bet365',odds:{home:1.9}}]}};
const base={ok:true,version:'test',fixtures:[fixture],counts:{live:1}};
const snapshot={...base,cacheOnly:true,externalRequestsAdded:0,stale:false,fetchedAt:1700000000000,ageMs:1000,liveFetchedAt:1700000000000};
function harness(source, options={}) {
  const calls=[],logs=[];
  const run=new Function('enrichBoardWithCachedFullMarket','console',dependencies+source+';return engineBoardResponse')(
    async board=>{calls.push('FULL_MARKET_CACHE');return {board,changed:options.enriched===true}},
    {error:code=>logs.push(code)});
  const env={ENGINE:{fetch:async r=>{calls.push({service:'ENGINE',method:r.method,url:r.url});
    if(options.engine==='throw')throw Error('SECRET_FAULT_MESSAGE');
    if(options.engine==='invalid')return new Response('{broken',{headers:{'content-type':'application/json'}});
    return Response.json(options.engineBoard||base,{status:options.engineStatus||200,headers:{'x-original':'retained','cache-control':'no-store'}})}},
    HUB:{fetch:async r=>{calls.push({service:'HUB',method:r.method,url:r.url});
      if(options.hub==='throw')throw Error('SECRET_HUB_MESSAGE');
      if(options.hub==='invalid')return new Response('{broken');
      return Response.json(options.hubBoard||snapshot,{status:options.hubStatus||200})}}};
  return {calls,logs,run:()=>run(new Request('https://ball46.com/api/engine/board?test=1'),env)};
}
async function check(name, options, verify){const h=harness(after,options),r=await h.run(),body=await r.text();const j=JSON.parse(body);assert(!body.includes('SECRET_'));assert.notEqual(r.status,599);await verify({h,r,j,body});results.push({name,ok:true});}
const hubCount=h=>h.calls.filter(c=>c.service==='HUB').length;
await check('Healthy response remains byte and header identical',{},async({h,r,body})=>{const old=await harness(before).run();assert.equal(body,await old.text());assert.deepEqual([...r.headers],[...old.headers]);assert.equal(hubCount(h),0)});
await check('Healthy cached enrichment retained',{enriched:true},({j,r})=>{assert.equal(r.headers.get('x-ball46-board-source'),'engine-plus-central-full-market-cache');assert.deepEqual(j.fixtures,[fixture])});
await check('Engine rejection recovers exact fresh scores',{engine:'throw'},({h,j,r})=>{assert.equal(r.status,200);assert.equal(hubCount(h),1);assert.equal(j.engineBoardFallbackReason,'ENGINE_BOARD_FETCH_FAILED');assert.deepEqual(j.fixtures,snapshot.fixtures);assert.equal(j.fetchedAt,snapshot.fetchedAt);assert.equal(j.ageMs,1000);assert.equal(j.stale,false);assert.equal(j.externalRequestsAdded,0);assert.deepEqual(h.logs,['B46_BOARD_ENGINE_FETCH_FAILED'])});
await check('Malformed Engine JSON uses valid fresh HUB',{engine:'invalid'},({j,r})=>{assert.equal(r.status,200);assert.equal(j.engineBoardFallbackReason,'ENGINE_BOARD_INVALID_JSON')});
await check('Original HTTP 500 fallback remains available',{engineStatus:500},({j,r})=>{assert.equal(r.status,200);assert.equal(j.engineBoardFallbackReason,'ENGINE_BOARD_ERROR')});
await check('Odds-empty Engine retains existing fallback reason',{engineBoard:{...base,fixtures:[{...fixture,providerOdds:null}]}},({j})=>assert.equal(j.engineBoardFallbackReason,'ENGINE_BOARD_ODDS_EMPTY'));
await check('No-odds fresh HUB recovers scores after exception',{engine:'throw',hubBoard:{...snapshot,fixtures:[{...fixture,providerOdds:null}]}},({j,r})=>{assert.equal(r.status,200);assert.equal(j.fixtures[0].goals.home,2)});
for(const [name,options] of [['HUB throws',{hub:'throw'}],['HUB invalid JSON',{hub:'invalid'}],['HUB HTTP error',{hubStatus:503}],['HUB stale',{hubBoard:{...snapshot,stale:true}}],['HUB freshness unknown',{hubBoard:{...snapshot,stale:undefined}}],['HUB not cache-only',{hubBoard:{...snapshot,cacheOnly:false}}],['HUB provider requests unknown',{hubBoard:{...snapshot,externalRequestsAdded:undefined}}],['HUB added upstream request',{hubBoard:{...snapshot,externalRequestsAdded:1}}],['HUB invalid timestamp',{hubBoard:{...snapshot,fetchedAt:null}}],['HUB unknown age',{hubBoard:{...snapshot,ageMs:null}}],['HUB invalid fixtures',{hubBoard:{...snapshot,fixtures:null}}],['HUB not ok',{hubBoard:{...snapshot,ok:false}}]]) {
  await check(name+' returns controlled unavailable',{engine:'throw',...options},({j,r})=>{assert.equal(r.status,503);assert.equal(j.ok,false);assert.equal(j.error,'ENGINE_BOARD_FETCH_FAILED');assert.equal(j.fixtures,undefined);assert.equal(r.headers.get('cache-control'),'no-store')});
}
await check('Valid odds-empty Engine survives failed HUB',{engineBoard:{...base,fixtures:[{...fixture,providerOdds:null}]},hub:'throw'},({r,j})=>{assert.equal(r.status,200);assert.equal(r.headers.get('x-original'),'retained');assert.equal(j.engineBoardFallback,undefined)});
await check('Original HTTP error survives failed HUB',{engineStatus:502,hub:'throw'},({r})=>assert.equal(r.status,502));
await check('Malformed Engine and malformed HUB return 503',{engine:'invalid',hub:'invalid'},({r,j})=>{assert.equal(r.status,503);assert.equal(j.error,'ENGINE_BOARD_INVALID_JSON')});
await check('Service paths remain GET board and GET snapshot',{engine:'throw'},({h})=>{assert.deepEqual(h.calls.filter(c=>typeof c==='object'),[{service:'ENGINE',method:'GET',url:'https://engine.internal/board?test=1'},{service:'HUB',method:'GET',url:'https://hub.internal/snapshot?test=1'}])});
assert.throws(()=>patchMain('unrelated'),/SOURCE_DRIFT/);
assert.throws(()=>patchMain(before+before),/SOURCE_DRIFT/);
assert.equal(patchMain('prefix\n'+before+'\nsuffix').replace(after,before),'prefix\n'+before+'\nsuffix');
results.push({name:'Source guards reject drift and duplicate adapters; inverse diff preserves all other bytes',ok:true});
const report={ok:true,checks:results.length,networkCalls:0,productionWrites:0,results};
await writeFile(new URL('./test-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
