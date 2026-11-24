// TEST-only owner price-chain diagnosis; read Full Market board-cache only.
// Hard reject if Full Market reports upstream requests. Never call fixture-odds.
// Legacy 1X2, Live, BTTS CLOSED, all prediction/price ledgers stay unchanged.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDS_MISSING');
const test='ball46-prematch-only-test-20261120',root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+test+'.mccarey-supon.workers.dev',auth='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status+' '+JSON.stringify(j.errors??[]).slice(0,250));return j.result;
}
async function version(n){return (await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
const protect=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
const protectedBefore=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await version(n)])));
const oldId=await version(test),versionData=await cf('/workers/'+test+'/versions/'+oldId+'?include=modules');
const settings=await cf('/scripts/'+test+'/settings');
const code=Object.fromEntries(versionData.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const main=versionData.main_module,src=code[main];
assert(src.includes("import {buildOuValueModels as buildOuV3Preview"),'V3_MODEL_NOT_ACTIVE');
assert(src.includes("BTTS_PROJECT_CLOSED"),'BTTS_FENCE_NOT_ACTIVE');
assert(!src.includes("/ou-fullmarket-cache-audit-test"),'ALREADY_INSTALLED');
const anchor=" if(path==='/ou-v3-stage-one-audit-test'&&req.method==='GET'){";
assert.equal(src.split(anchor).length,2,'NO_V3_AUDIT_ANCHOR');
const alias="import {extractFullMarketOuOffers as auditOuOffers,chooseBestOuValue as auditOuSelect} from './ou-value-screener-v2-test.mjs';";
const intro="import {DurableObject} from 'cloudflare:workers';";
assert.equal(src.split(intro).length,2,'NO_MAIN_IMPORT_ANCHOR');
const lines=[
" if(path==='/ou-fullmarket-cache-audit-test'&&req.method==='GET'){",
"  const fixtures=await this.ctx.storage.get('botFixtures')??[];",
"  const all=buildOuV3Preview(this.db,fixtures,now,{maxFixtures:350});",
"  const eligible=all.models.slice(0,70);",
"  const ids=eligible.map(m=>String(m.fixtureId));",
"  if(!this.env.FULL_MARKET)return json({error:'FULL_MARKET_BINDING_MISSING',providerCalls:0});",
"  let payload=null,err=null,status=0;",
"  try{",
"   const r=await this.env.FULL_MARKET.fetch('https://full-market.internal/board-cache',{",
"    method:'POST',headers:{'content-type':'application/json',accept:'application/json'},",
"    body:JSON.stringify({fixtureIds:ids}),signal:AbortSignal.timeout(16000)});",
"   status=r.status;if(r.ok)payload=await r.json();",
"   else err='FULLMARKET_CACHE_HTTP_'+r.status;",
"  }catch(e){err=String(e?.message??e).slice(0,90)}",
"  if(payload&&!(payload.ok===true&&payload.externalRequestsAdded===0&&payload.entries&&typeof payload.entries==='object')){",
"   err='CACHE_RESPONSE_UNVERIFIED_OR_UPSTREAM_NOT_ZERO';payload=null;",
"  }",
"  const byId=payload?.entries??{};",
"  const rows=eligible.map(m=>{",
"   const entry=byId[String(m.fixtureId)]??null;",
"   const data=entry?.fullOdds?.data??entry?.fullOdds??null;",
"   const books=Array.isArray(data?.bookmakers)?data.bookmakers:[];",
"   const mark=books.filter(x=>x?.odds?.goal_line||x?.odds?.goal_line_fixed);",
"   const parsed=auditOuOffers(entry,m.fixtureId,now,m.kickoff);",
"   const best=parsed.offers.length?auditOuSelect(m,parsed.offers,now):null;",
"   return {fixtureId:m.fixtureId,match:m.home+' – '+m.away,",
"    homeHistory:m.homeHistory,awayHistory:m.awayHistory,",
"    cachePresent:!!entry,cacheStale:entry?.stale??null,",
"    cacheAgeSec:Number.isFinite(entry?.fetchedAt)?Math.round((now*1000-entry.fetchedAt)/1000):null,",
"    rawBookmakers:books.length,rawBooksWithOu:mark.length,",
"    parsedState:parsed.status,offers:parsed.offers.length,",
"    sampleOffers:parsed.offers.slice(0,10).map(q=>({bookmaker:q.bookmaker,line:q.line,over:q.over,under:q.under,stage:q.stage})),",
"    evPassing:best?.passed??0,topQuote:best?.selected?{bookmaker:best.selected.bookmaker,side:best.selected.side,",
"     line:best.selected.line,price:best.selected.price,ev:best.selected.ev}:null};",
"  });",
"  const attempts=Array.from(this.db.exec('SELECT fixture_id,business_day,requested_at,completed_at,state,bookmaker,line,price,ev,error,upstream_added FROM b46_ou_value_v2_provider_attempt_test ORDER BY requested_at DESC LIMIT 15'));",
"  return json({code:'B46_OU_FULLMARKET_PRICE_CACHE_READONLY_AUDIT',",
"   checkedAtUTC:new Date(now*1000).toISOString(),",
"   cacheHttpStatus:status,cacheError:err,cacheVerified:!!payload,",
"   totalUpcomingModeled:all.models.length,cacheKeys:Object.keys(byId).length,",
"   cacheEligiblePresent:rows.filter(x=>x.cachePresent).length,",
"   priceOffersValid:rows.filter(x=>x.offers>0).length,",
"   priceEvPassing:rows.filter(x=>x.evPassing>0).length,",
"   staleOrMissing:rows.filter(x=>!x.offers).length,",
"   rows,priorPaidAttempts:attempts,providerCalls:0,paidUpstreamAdded:0,",
"   pricesMutated:false,productionWrites:0});",
" }"
].join('\n');
code[main]=src.replace(intro,intro+'\n'+alias).replace(anchor,lines+'\n'+anchor);
const metadata={main_module:main,compatibility_date:versionData.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(versionData.compatibility_flags?.length?{compatibility_flags:versionData.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [n,s] of Object.entries(code))form.append(n,new Blob([s],{type:'application/javascript+module'}),n);
assert.equal(await version(test),oldId,'CONCURRENT_TEST_VERSION');
await cf('/scripts/'+test+'?bindings_inherit=strict',{method:'PUT',body:form});
let newId=null;
for(let i=0;i<45;i++){
 const id=await version(test);
 if(id!==oldId){
  const v=await cf('/workers/'+test+'/versions/'+id+'?include=modules');
  const modules=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(modules).length===Object.keys(code).length&&Object.entries(code).every(([n,s])=>modules[n]===s)){newId=id;break}
 }
 await new Promise(ok=>setTimeout(ok,850));
}
assert(newId,'NEW_CODE_NOT_VERIFIED');
await cf('/scripts/'+test+'/deployments',{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify({
 strategy:'percentage',versions:[{version_id:newId,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let audit=null;
for(let i=0;i<25;i++){
 await new Promise(ok=>setTimeout(ok,i===0?2000:1300));
 const r=await fetch(host+'/ou-fullmarket-cache-audit-test',{headers:{authorization:auth},cache:'no-store',signal:AbortSignal.timeout(40000)});
 if(r.ok){const d=await r.json();if(d.code==='B46_OU_FULLMARKET_PRICE_CACHE_READONLY_AUDIT'){audit=d;break}}
}
assert(audit,'CACHE_PRICE_AUDIT_ROUTE_NOT_VISIBLE');
assert(audit.providerCalls===0&&audit.paidUpstreamAdded===0,'PAID_PRICE_REQUEST_REGRESSION');
const after=Object.fromEntries(await Promise.all(protect.map(async n=>[n,await version(n)])));
assert.deepEqual(after,protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_PRICE_TRACE_SUMMARY '+JSON.stringify({
 checked:audit.checkedAtUTC,modeled:audit.totalUpcomingModeled,
 cacheHttpStatus:audit.cacheHttpStatus,cacheVerified:audit.cacheVerified,
 cacheError:audit.cacheError,cacheEntries:audit.cacheKeys,
 cachedAmongModeled:audit.cacheEligiblePresent,validOuAmongModeled:audit.priceOffersValid,
 evPassing:audit.priceEvPassing,unavailable:audit.staleOrMissing,
 extraPaidRequests:0,productionChanges:0}));
console.log('B46_PRICE_TRACE_PER_FIXTURE '+JSON.stringify(audit.rows).slice(0,31000));
console.log('B46_PRICE_TRACE_PREVIOUS_ATTEMPTS '+JSON.stringify(audit.priorPaidAttempts).slice(0,20000));
console.log('B46_PRICE_TRACE_READONLY_PASS');
