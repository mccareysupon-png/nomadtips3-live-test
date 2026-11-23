// BALL46 isolated TEST only; no LIVE/Production deployment or new API client.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CF_CREDS_REQUIRED');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const target='ball46-prematch-only-test-20261120';
const expected='790a4965-5053-41f0-8bec-bc4bcf98f43d';
const main='prematch-only-worker.mjs',add='prematch-ou-engine-v1-test.mjs';
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120',
 'ball46-prematch-ui-test-v5-20261120','ball46-prematch-performance-test-20261121'];
async function cf(p,opts={}){
 const r=await fetch(base+p,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+p+'_'+r.status+'_'+JSON.stringify(j.errors??[]));return j.result;
}
const version=async name=>{
 const d=await cf('/scripts/'+name+'/deployments?per_page=1');
 const id=d.deployments?.[0]?.versions?.[0]?.version_id;
 assert(id,'VERSION_NOT_FOUND_'+name);return id;
};
const protectedBefore=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.equal(await version(target),expected,'TEST_VERSION_CHANGED_ABORT');
const installed=await cf('/workers/'+target+'/versions/'+expected+'?include=modules');
assert.equal(installed.main_module,main);assert.equal(installed.modules.length,30);
assert(!installed.modules.some(m=>m.name===add));
const mainModule=installed.modules.find(m=>m.name===main);
assert(mainModule?.content_base64);
const original=Buffer.from(mainModule.content_base64,'base64').toString('utf8');
assert(original.includes('async runOuValueV2Shadow(now){')&&
 original.includes("path==='/ou-value-v2-state'&&req.method==='GET'")&&
 original.includes("OU_VALUE_V2_SHADOW_SCREEN_TEST")&&
 original.includes("OU_2P5_CAPTURE_AT_ISSUE_TEST")&&
 original.includes("BTTS_HISTORY_API_DISABLED_PROJECT_CLOSED")&&
 original.includes("DISABLED_POST_ISSUE_REPRICE"),'SOURCE_PATTERN_DRIFT');
const source=fs.readFileSync('qa/prematch-history-20261120/'+add,'utf8');
assert(source.includes("needs1X2Odds:false")&&source.includes("runPreMatchOuEngineV1")&&
 source.includes("captureOneValueV2Price")&&source.includes("liveEngineCalls:0"));
execFileSync(process.execPath,['--check','qa/prematch-history-20261120/'+add]);
const insertMethod=" async runPreMatchOuEngine(now){\n  if(this.b46PreMatchOuInFlight)return this.b46PreMatchOuInFlight;\n  this.b46PreMatchOuInFlight=(async()=>{\n   const cursor=Number(await this.ctx.storage.get('b46PreMatchOuEngineCursor')??0);\n   const errorState=async(status,error)=>{\n    const result={engine:'B46_PREMATCH_OU_ENGINE_V1_TEST',status,at:now,\n     cursorIn:cursor,cursorOut:cursor,error:String(error?.message??error).slice(0,110),\n     providerCalls:0,liveEngineCalls:0,productionWrites:0};\n    await this.ctx.storage.put('b46PreMatchOuEngineLast',result);return result;\n   };\n   if(!this.env.HUB||!this.env.FULL_MARKET)\n    return errorState('REQUIRED_SERVICE_BINDING_MISSING','HUB_OR_FULL_MARKET');\n   let snapshot;\n   try{\n    const r=await this.env.HUB.fetch('https://hub.internal/snapshot',{\n     method:'GET',signal:AbortSignal.timeout(15000)});\n    if(!r.ok)throw Error('HUB_SNAPSHOT_HTTP_'+r.status);\n    snapshot=await r.json();\n   }catch(e){return errorState('HUB_SNAPSHOT_UNAVAILABLE',e)}\n   const market=async(path,opts={})=>{\n    if(!(path==='/board-cache'&&opts.method==='POST'||\n     path==='/health'&&opts.method==='GET'||\n     /^\\/fixture-odds\\?fixtureId=[1-9]\\d*$/.test(path)&&opts.method==='GET'))\n      throw Error('PREMATCH_FULL_MARKET_PATH_DENIED');\n    const init={method:opts.method,headers:{accept:'application/json'},\n     signal:AbortSignal.timeout(14000)};\n    if(opts.method==='POST'){init.headers['content-type']='application/json';\n     init.body=JSON.stringify(opts.body??{})}\n    const r=await this.env.FULL_MARKET.fetch('https://full-market.internal'+path,init);\n    if(!r.ok)throw Error('PREMATCH_FULL_MARKET_HTTP_'+r.status);\n    return r.json();\n   };\n   const hubHealth=async()=>{\n    try{const r=await this.env.HUB.fetch('https://hub.internal/health',{\n      method:'GET',signal:AbortSignal.timeout(9000)});\n     return r.ok?await r.json():{ok:false};\n    }catch{return {ok:false}}\n   };\n   let result;\n   try{result=await runPreMatchOuEngineV1(this.db,{\n     snapshot,now,market,hubHealth,cursor,\n     enablePaidQuoteFallback:true\n    })}\n   catch(e){return errorState('PREMATCH_OU_ENGINE_ERROR',e)}\n   await this.ctx.storage.put('b46PreMatchOuEngineCursor',result.cursorOut);\n   const answer={...result,at:now,\n    hubSnapshotAt:snapshot.fetchedAt??null,\n    quota:readOuValueV2BridgeState(this.db,now).sharedOuDailyBudget,\n    replacedLegacyV2Cron:true};\n   await this.ctx.storage.put('b46PreMatchOuEngineLast',answer);\n   return answer;\n  })();\n  try{return await this.b46PreMatchOuInFlight}\n  finally{this.b46PreMatchOuInFlight=null}\n }\n";
const insertRoutes="  if(path==='/prematch-ou-engine-state'&&req.method==='GET')\n   return json({engine:'B46_PREMATCH_OU_ENGINE_V1_TEST',policy:PREMATCH_OU_ENGINE_V1_POLICY,\n    last:await this.ctx.storage.get('b46PreMatchOuEngineLast')??null,\n    cursor:await this.ctx.storage.get('b46PreMatchOuEngineCursor')??0,\n    quota:readOuValueV2BridgeState(this.db,now).sharedOuDailyBudget,\n    shadowCount:readOuValueShadow(this.db,100).length,\n    providerCallsThisRead:0,productionWrites:0,liveEngineCalls:0});\n  if(path==='/prematch-ou-engine-tick'&&req.method==='POST')\n   return json(await this.runPreMatchOuEngine(now));\n";
const insertAuto="ctx.waitUntil(stub.fetch('https://prematch.internal/prematch-ou-engine-tick',{method:'POST'}).then(async r=>{\n if(!r.ok){console.log('PREMATCH_OU_ENGINE_TEST_HTTP_'+r.status);return}\n const v=await r.json();\n console.log('PREMATCH_OU_ENGINE_TEST status='+v.status+\n  ' checked='+(v.scan?.checked??0)+' modeled='+(v.scan?.modeled??0)+\n  ' priced='+(v.scan?.pricedFixtures??0)+\n  ' locked='+(v.locked?.added??0)+\n  ' paid='+(v.providerCalls??0));\n}).catch(e=>console.log('PREMATCH_OU_ENGINE_TEST_ERR '+String(e).slice(0,90))));";
const replaceOnce=(s,before,after,tag)=>{
 const n=s.split(before).length-1;assert.equal(n,1,'ANCHOR_DRIFT_'+tag+'_'+n);return s.replace(before,after);
};
let next=original;
next=replaceOnce(next,
 "import {captureOneValueV2Price,readOuValueV2BridgeState,OU_VALUE_V2_BRIDGE_POLICY} from './ou-value-v2-provider-bridge-test.mjs';",
 "import {captureOneValueV2Price,readOuValueV2BridgeState,OU_VALUE_V2_BRIDGE_POLICY} from './ou-value-v2-provider-bridge-test.mjs';\n"+
 "import {runPreMatchOuEngineV1,PREMATCH_OU_ENGINE_V1_POLICY} from './prematch-ou-engine-v1-test.mjs';",'MODULE_IMPORT');
next=replaceOnce(next," async runOuValueV2Shadow(now){",insertMethod+" async runOuValueV2Shadow(now){",'DO_ENGINE_METHOD');
next=replaceOnce(next,
 "  if(path==='/ou-value-v2-state'&&req.method==='GET')",
 insertRoutes+"  if(path==='/ou-value-v2-state'&&req.method==='GET')",'ENGINE_ROUTES');
const oldV2="const v=await stub.fetch('https://prematch.internal/ou-value-v2-run',{method:'POST'});if(v.ok){const result=await v.json(); console.log('OU_VALUE_V2_SHADOW_SCREEN_TEST inspected='+(result.checked??0)+' pricedFixtures='+(result.pricedFixtures??0)+' selected='+(result.recorded?.added??0)+' providerCalls=0')}else console.log('OU_VALUE_V2_SHADOW_SCREEN_ERROR '+v.status)";
next=replaceOnce(next,oldV2,"console.log('PREMATCH_OU_REPLACES_V2_OLD_CRON')",'NO_DOUBLE_V2_CRON');
next=replaceOnce(next,"export default {async scheduled(event,env){","export default {async scheduled(event,env,ctx){",'SCHEDULED_CTX');
const stub="const stub=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));";
next=replaceOnce(next,stub,stub+insertAuto,'AUTO_INDEPENDENT_CRON');
assert(next.includes("path==='/prematch-ou-engine-state'")&&
 next.includes("path==='/prematch-ou-engine-tick'")&&
 next.includes("PREMATCH_OU_REPLACES_V2_OLD_CRON")&&
 next.includes("OU_2P5_CAPTURE_AT_ISSUE_TEST")&&
 next.includes("BTTS_HISTORY_API_DISABLED_PROJECT_CLOSED")&&
 next.includes("DISABLED_POST_ISSUE_REPRICE")&&!next.includes(oldV2),'POST_PATCH_DRIFT');
fs.writeFileSync('/tmp/b46-prematch-ou-engine-test-deployed.mjs',next);
execFileSync(process.execPath,['--check','/tmp/b46-prematch-ou-engine-test-deployed.mjs']);
const settings=await cf('/scripts/'+target+'/settings');
assert.deepEqual(settings.bindings.map(x=>x.name).sort(),['FIVEDOLLAR_API_KEY','FULL_MARKET','HUB','OWNER_SECRET','STORE']);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const originalHashes=Object.fromEntries(installed.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]));
assert.equal(await version(target),expected,'PRE_UPLOAD_VERSION_DRIFT');
console.log('B46_PREMATCH_ENGINE_PREFLIGHT '+JSON.stringify({
 target,expected,modulesBefore:30,modulesAfter:31,modifiedExisting:[main],
 added:add,protectedBefore,originalV2CronReplaced:true,
 sharedOuQuoteLimitOnePerLondonDay:true,paidCallsDuringDeploy:0}));
const metadata={main_module:main,compatibility_date:installed.compatibility_date||'2026-11-20',
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const m of installed.modules)
 form.append(m.name,new Blob([m.name===main?next:Buffer.from(m.content_base64,'base64')],{type:'application/javascript+module'}),m.name);
form.append(add,new Blob([source],{type:'application/javascript+module'}),add);
await cf('/scripts/'+target+'?bindings_inherit=strict',{method:'PUT',body:form});
let newVersion=null,verified=null;
for(let i=0;i<40;i++){
 const id=await version(target);
 if(id!==expected){
  const v=await cf('/workers/'+target+'/versions/'+id+'?include=modules');
  const entry=v.modules.find(m=>m.name===main),lib=v.modules.find(m=>m.name===add);
  if(v.modules.length===31&&entry&&lib&&
   Buffer.from(entry.content_base64,'base64').toString('utf8')===next&&
   Buffer.from(lib.content_base64,'base64').toString('utf8')===source){
   newVersion=id;verified=v;break;
  }
 }
 await new Promise(r=>setTimeout(r,1000));
}
assert(newVersion&&verified,'ACTIVE_TEST_VERSION_NOT_FOUND');
for(const m of installed.modules){
 if(m.name===main)continue;
 const deployed=verified.modules.find(x=>x.name===m.name);
 assert(deployed,'OLD_MODULE_MISSING_'+m.name);
 assert.equal(hash(Buffer.from(deployed.content_base64,'base64')),originalHashes[m.name],
  'OLD_MODULE_MUTATED_'+m.name);
}
assert.deepEqual((await cf('/scripts/'+target+'/settings')).bindings.map(x=>x.name).sort(),settings.bindings.map(x=>x.name).sort());
const protectedAfter=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
assert.deepEqual(protectedAfter,protectedBefore,'PROTECTED_WORKER_CHANGED');
console.log('B46_PREMATCH_OU_ENGINE_TEST_DEPLOY_PASS '+JSON.stringify({
 worker:target,previous:expected,newVersion,
 engine:'B46_PREMATCH_OU_ENGINE_V1_TEST',
 hubSource:'GET HUB /snapshot',priceSource:'FULL_MARKET existing service',
 cycle:'*/15 * * * *',oldV2CronReplaced:true,
 original1x2BtssHistoryAndLegacyOuModulesByteUnchanged:true,
 protectedWorkersUnchanged:true,paidApiCallsDuringDeploy:0,productionWrites:0}));
