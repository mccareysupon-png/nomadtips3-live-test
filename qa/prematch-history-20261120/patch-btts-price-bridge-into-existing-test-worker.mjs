// Patch only the existing isolated TEST PreMatch main module.
// No 1X2, historical truck, HCR, engine, receiver or production changes.
function once(s,a,b,label){
 const n=s.split(a).length-1;
 if(n!==1)throw Error('B46_BTTS_PRICE_BRIDGE_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
}
const pickupMethod="\n async runBttsPricePickupTick(now){\n  if(this.bttsPriceInFlight)return this.bttsPriceInFlight;\n  this.bttsPriceInFlight=(async()=>{\n   const fixtures=await this.ctx.storage.get('botFixtures')??[];\n   const quotes=await this.ctx.storage.get('prematchBttsBet365QuotesV1')??{};\n   const feed=await this.ctx.storage.get('botFeedState')??null;\n   return runBttsPricePickup(this.db,{\n    fixtures,quotes,now,feedAt:feed?.at,\n    hubreview:async()=>{\n     if(!this.env.HUB)return {ok:false};\n     try{\n      const r=await this.env.HUB.fetch('https://hub.internal/health',\n       {headers:{accept:'application/json'},signal:AbortSignal.timeout(13000)});\n      if(!r.ok)return {ok:false};\n      const h=await r.json();\n      return {ok:h.ok===true,retryAfterSec:h.retryAfterSec??0,lastError:h.lastError??null};\n     }catch{return {ok:false}}\n    },\n    provider:async path=>{\n     if(!this.env.FIVEDOLLAR_API_KEY)throw Error('MISSING_TEST_ODDS_PROVIDER_CREDENTIAL');\n     const response=await fetch('https://api.5dollarfootballapi.com'+path,{\n      headers:{authorization:'Bearer '+this.env.FIVEDOLLAR_API_KEY,accept:'application/json'},\n      redirect:'manual',signal:AbortSignal.timeout(26000)});\n     const header=response.headers.get('x-ratelimit-remaining');\n     const remaining=header!==null&&/^\\d+$/.test(header)?Number(header):null;\n     if(response.status===429)return {ok:false,status:429,remaining};\n     if(!response.ok)return {ok:false,status:response.status,remaining};\n     return {ok:true,status:200,body:await response.json(),remaining};\n    },\n    onQuote:async(f,parsed,observed)=>{\n     const prior=await this.ctx.storage.get('prematchBttsBet365QuotesV1')??{};\n     const merged=mergeBet365BttsQuotes(prior,f,parsed,observed);\n     if(JSON.stringify(prior)!==JSON.stringify(merged.quotes))\n      await this.ctx.storage.put('prematchBttsBet365QuotesV1',merged.quotes);\n     if(merged.state!=='PRICED')return {issued:null};\n     const issued=await this.recordQualifiedBtts(observed,fixtures,merged.quotes);\n     if(issued.added)syncPreMarketStatsRegistry(this.db,observed);\n     return {issued,quoteState:merged.state};\n    }\n   });\n  })().finally(()=>{this.bttsPriceInFlight=null});\n  return this.bttsPriceInFlight;\n }\n";
export function patchBttsPriceBridgeMain(main){
 if(typeof main!=='string'||!main.includes("export class PrematchStore extends DurableObject{")||
   !main.includes("path==='/btts-cycle-test'")||
   !main.includes("const b=await stub.fetch('https://prematch.internal/btts-cycle-test'"))
   throw Error('NOT_THE_EXISTING_BTTS_TEST_MAIN');
 let s=main;
 s=once(s,
   "import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';",
   "import {initPreMarketStatsRegistry,syncPreMarketStatsRegistry,readPreMarketStatsRegistry,auditPreMarketStatsRegistry} from './prematch-stats-registry-test.mjs';\n"+
   "import {initBttsPricePickup,bttsPricePickupState,runBttsPricePickup} from './btts-priced-fixture-pickup-test.mjs';",
   'MODULE_IMPORT');
 s=once(s,
   'initBttsPickLedger(this.db);initPreMarketStatsRegistry(this.db)}',
   'initBttsPickLedger(this.db);initPreMarketStatsRegistry(this.db);initBttsPricePickup(this.db)}',
   'DURABLE_SQL_INIT');
 s=once(s," async rememberLeagueCatalog(snapshot){",
   pickupMethod+"\n async rememberLeagueCatalog(snapshot){",'QUOTE_TRANSPORT_METHOD');
 s=once(s,
   " if(path==='/btts-shadow'&&req.method==='GET'){",
   " if(path==='/btts-price-pickup-state'&&req.method==='GET')return json({system:'BTTS_PRICE_PICKUP_TEST',transport:bttsPricePickupState(this.db,now),providerCalls:0});\n"+
   " if(path==='/btts-price-pickup-tick'&&req.method==='POST')return json(await this.runBttsPricePickupTick(now));\n"+
   " if(path==='/btts-shadow'&&req.method==='GET'){",
   'OWNER_ONLY_PRICE_PICKUP_ROUTES');
 s=once(s,
   "const b=await stub.fetch('https://prematch.internal/btts-cycle-test',{method:'POST'});console.log('BTTS_TEST_ONLY_CYCLE '+b.status)",
   "const quoteTick=await stub.fetch('https://prematch.internal/btts-price-pickup-tick',{method:'POST'});"+
   "if(quoteTick.ok){const q=await quoteTick.json();console.log('BTTS_BET365_PRICE_PICKUP '+q.state+' upstreamCalls='+(q.providerCalls??0)+' selected='+(q.selected?.length??0))}"+
   "else console.log('BTTS_BET365_PRICE_PICKUP_ERROR '+quoteTick.status);"+
   "const b=await stub.fetch('https://prematch.internal/btts-cycle-test',{method:'POST'});console.log('BTTS_TEST_ONLY_CYCLE '+b.status)",
   'CRON_AFTER_FEED_BEFORE_BTTS_CYCLE');
 if(!s.includes("runBttsPricePickup(this.db")||
    !s.includes("'/btts-price-pickup-state'")||
    !s.includes("'https://prematch.internal/btts-price-pickup-tick'"))
    throw Error('PRICE_BRIDGE_DID_NOT_INSTALL');
 return {code:s,scope:'TEST_BTTS_QUOTE_FETCH_AND_EVALUATE_ONLY',changedExistingTransport:false};
}
