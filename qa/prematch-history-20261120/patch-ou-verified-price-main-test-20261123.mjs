// Cloudflare TEST only: wire O/U 2.5 verified price pickup into existing DO + 15m cron.
// No changes to BTTS CLOSED, 1X2 formula, Engine, HUB, HCR, or any production code.
const one=(s,a,b,label)=>{
 const n=s.split(a).length-1;
 if(n!==1)throw Error('OU_TEST_MAIN_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
export function patchOuVerifiedPriceMain(input){
 if(typeof input!=='string'||!input.includes('class PrematchStore extends DurableObject')||
  !input.includes("return {state:'BTTS_PROJECT_CLOSED',providerCalls:0,productionWrites:0}")||
  !input.includes("path==='/ou-cycle-test'&&req.method==='POST'")||
  !input.includes("console.log('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')"))
  throw Error('ACTIVE_TEST_WORKER_NOT_AS_EXPECTED');
 let s=input;
 s=one(s,
  "import {initOu,screenOu,recordOu,settleOu,syncOuSnapshot,readOuLedger,readOuSnapshot,historicalOuBacktest,OU_POLICY} from './ou-math-v1-test.mjs';",
  "import {initOu,screenOu,recordOu,settleOu,syncOuSnapshot,readOuLedger,readOuSnapshot,historicalOuBacktest,OU_POLICY} from './ou-math-v1-test.mjs';\n"+
  "import {initOuPricePickup,readOuPricePickupState,runOuPricePickup,OUV1_PICKUP_POLICY} from './ou-price-pickup-v1-test.mjs';",
  'IMPORT_VERIFIED_OU_PICKUP');
 s=one(s,
  "initOu(this.db);initBttsPricePickup(this.db)}",
  "initOu(this.db);initBttsPricePickup(this.db);initOuPricePickup(this.db)}",
  'INIT_INDEPENDENT_OU_QUOTE_LEDGER');
 const method=[
 " async runOuPricePickupTick(now){",
 "  if(this.ouPriceInFlight)return this.ouPriceInFlight;",
 "  this.ouPriceInFlight=(async()=>{",
 "   const fixtures=await this.ctx.storage.get('botFixtures')??[];",
 "   const feed=await this.ctx.storage.get('botFeedState')??null;",
 "   return runOuPricePickup(this.db,{fixtures,now,feedAt:feed?.at,",
 "    hubreview:async()=>{",
 "     if(!this.env.HUB)return {ok:false};",
 "     try{",
 "      const r=await this.env.HUB.fetch('https://hub.internal/health',",
 "       {method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});",
 "      if(!r.ok)return {ok:false};",
 "      return await r.json();",
 "     }catch{return {ok:false}}",
 "    },",
 "    provider:async path=>{",
 "     if(!/^\\/v1\\/fixtures\\/[1-9]\\d*\\/odds\\?market=goalline_fixed$/.test(path))",
 "      throw Error('OU_PROVIDER_PATH_NOT_ALLOWLISTED');",
 "     if(!this.env.FIVEDOLLAR_API_KEY)throw Error('OU_TEST_PROVIDER_KEY_MISSING');",
 "     const r=await fetch('https://api.5dollarfootballapi.com'+path,{",
 "      method:'GET',redirect:'manual',cache:'no-store',",
 "      headers:{authorization:'Bearer '+this.env.FIVEDOLLAR_API_KEY,accept:'application/json'},",
 "      signal:AbortSignal.timeout(OUV1_PICKUP_POLICY.maxProviderTimeoutMs)});",
 "     const raw=r.headers.get('x-ratelimit-remaining');",
 "     const remaining=raw!==null&&/^\\d+$/.test(raw)?Number(raw):null;",
 "     if(!r.ok)return {ok:false,status:r.status,remaining};",
 "     return {ok:true,status:200,body:await r.json(),remaining};",
 "    }",
 "   });",
 "  })().finally(()=>{this.ouPriceInFlight=null});",
 "  return this.ouPriceInFlight;",
 " }",
 ].join('\n');
 s=one(s," async rememberLeagueCatalog(snapshot){",
   method+"\n\n async rememberLeagueCatalog(snapshot){",
   'OWNER_OU_QUOTE_PICKUP_METHOD');
 s=one(s,
 "if(path==='/ou-cycle-test'&&req.method==='POST'){",
 [
 "   // Owner-only O/U price transport. Request is permanently claimed before fetch.",
 "   if(path==='/ou-price-pickup-state'&&req.method==='GET')",
 "    return json(readOuPricePickupState(this.db,now));",
 "   if(path==='/ou-price-pickup-tick'&&req.method==='POST')",
 "    return json(await this.runOuPricePickupTick(now));",
 "if(path==='/ou-cycle-test'&&req.method==='POST'){"
 ].join('\n'),
 'PRICING_OWNER_ROUTES');
 const original="console.log('BTTS_CYCLE_DISABLED_PROJECT_CLOSED')";
 const updated=original+
  ";const q=await stub.fetch('https://prematch.internal/ou-price-pickup-tick',{method:'POST'});"+
  "if(q.ok){const result=await q.json();console.log('OU_2P5_PRICE_PICKUP_TEST '+result.state+' providerCalls='+(result.providerCalls??0))}"+
  "else console.log('OU_2P5_PRICE_PICKUP_ERROR '+q.status)";
 s=one(s,original,updated,'FIFTEEN_MIN_QUOTE_TICK');
 const guards=["initOuPricePickup(this.db)","path==='/ou-price-pickup-state'",
  "path==='/ou-price-pickup-tick'",
  "https://prematch.internal/ou-price-pickup-tick",
  "OUV1_PICKUP_POLICY.maxProviderTimeoutMs","BTTS_PROJECT_CLOSED",
  "path==='/ou-cycle-test'&&req.method==='POST'"];
 for(const x of guards)if(!s.includes(x))throw Error('GUARD_LOST_'+x);
 if(s.includes("import {initOuPricePickup,readOuPricePickupState,runOuPricePickup,OUV1_PICKUP_POLICY} from './ou-price-pickup-v1-test.mjs';")!==true)throw Error('NEW_IMPORT_MISSING');
 return {code:s,scope:'ISOLATED_PREMATCH_TEST',
  existingBttsClosed:true,oneX2ModelUntouched:true,ouMathFormulaUntouched:true,
  hubUnchanged:true,engineUnchanged:true,productionUnchanged:true,
  maxNewPaidProviderCallsPerLondonDay:1,autoCron:'15_MIN_GATED'};
}
