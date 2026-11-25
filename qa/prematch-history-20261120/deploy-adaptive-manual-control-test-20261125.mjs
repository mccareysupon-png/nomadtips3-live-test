// Deploy only a guarded Adaptive Formula Control TEST page + risk gates to the existing TEST Worker.
// Preserve every existing module byte-for-byte except main, add two additive modules; no paid APIs.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const ownerHash='234523cfd7f1c9e515ff13380276c821505044438575bf9792d15a7c8dc2a7d6';
const repoPath='qa/prematch-history-20261120/';
const worker='ball46-prematch-only-test-20261120';
const protectedWorkers=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343',
 'nomadtips3-full-market-343-ball46','ball46-premium-match-colors-test-20261120'];
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'TEST_CREDENTIALS_REQUIRED');
const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const host='https://'+worker+'.mccarey-supon.workers.dev';
const ownerAuthorization='Bearer '+createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
async function cf(path,options={}){
 const res=await fetch(api+path,{...options,headers:{authorization:'Bearer '+token,...options.headers},
  signal:AbortSignal.timeout(60000)});
 const v=await res.json();assert(res.ok&&v.success,path+' HTTP '+res.status+' '+JSON.stringify(v.errors||[]).slice(0,250));return v.result;
}
async function active(name){return (await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id}
async function owners(path,method='GET',body,auth=ownerAuthorization){
 const res=await fetch(host+path,{method,headers:{authorization:auth,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(35000)});
 const v=await res.json().catch(()=>null);return {http:res.status,v};
}
function once(s,needle,replacement){
 const count=s.split(needle).length-1;assert.equal(count,1,'ANCHOR_DRIFT_'+needle.slice(0,80)+'_'+count);
 return s.replace(needle,replacement);
}
function patch(s){
 assert(s.includes("DISABLED_ADAPTIVE_ONLY"),'EXPECTED_ADAPTIVE_ONLY_BASELINE');
 assert(s.includes("runAdaptiveOu(this.db,{fixtures,now,market})"),'ADAPTIVE_RUN_ANCHOR_MISSING');
 assert(!s.includes("B46_ADAPTIVE_FORMULA_CONTROL_TEST_V1"),'ALREADY_PATCHED');
 const imported="import {runAdaptiveOu,readAdaptiveStats} from './b46-adaptive-ou-ledger-v1-test.mjs';";
 s=once(s,imported,imported+
  "\nimport {adaptiveControlOverview,adaptiveControlCommand,applyAdaptiveAutoStops,adaptiveActiveSelections} from './b46-adaptive-formula-control-risk-test.mjs';"+
  "\nimport {adaptiveControlHtml} from './b46-adaptive-manual-control-page-test.mjs';");
 const run="const result=await runAdaptiveOu(this.db,{fixtures,now,market});";
 s=once(s,run,"const beforeRiskGuard=applyAdaptiveAutoStops(this.db,now);\n  "+run+
  "\n  const afterRiskGuard=applyAdaptiveAutoStops(this.db,now);");
 const result="stats:result.stats,providerCalls:0,productionWrites:0});";
 s=once(s,result,"stats:result.stats,riskGuard:{before:beforeRiskGuard,after:afterRiskGuard},providerCalls:0,productionWrites:0});");
 const internal="if(path==='/ou-adaptive-research-state-test'&&req.method==='GET'){";
 const additions=[
 "if(path==='/adaptive-control-api-test'&&req.method==='GET'){",
 " if(req.headers.get('x-b46-control-role')!=='OWNER')return json({error:'OWNER_ONLY'},403);",
 " return json(adaptiveControlOverview(this.db,now));",
 "}",
 "if(path==='/adaptive-control-active-test'&&req.method==='GET'){",
 " if(req.headers.get('x-b46-control-role')!=='OWNER')return json({error:'OWNER_ONLY'},403);",
 " return json(adaptiveActiveSelections(this.db,now));",
 "}",
 "if((path==='/adaptive-control-api-test'||path==='/adaptive-control-dot-test')&&req.method==='POST'){",
 " const role=req.headers.get('x-b46-control-role');",
 " if((path==='/adaptive-control-api-test'&&role!=='OWNER')||(path==='/adaptive-control-dot-test'&&role!=='DOT'))",
 "  return json({error:'ROLE_DENIED'},403);",
 " const body=await req.text();if(body.length>3072)return json({error:'BODY_LIMIT'},413);",
 " let command;try{command=JSON.parse(body)}catch{return json({error:'INVALID_JSON'},400)}",
 " const result=adaptiveControlCommand(this.db,now,command,role);",
 " return json(result,result.ok?200:400);",
 "}",
 " "
 ].join('\n');
 s=once(s,internal,additions+internal);
 const external="if(req.method==='GET'&&p==='/preview')";
 const e=[
 "if(req.method==='GET'&&p==='/adaptive-control-test')",
 " return new Response(adaptiveControlHtml,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex,nofollow','content-security-policy':\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'\"}});",
 "if((p==='/adaptive-control-api-test'||p==='/adaptive-control-active-test'||p==='/adaptive-control-dot-test')&&['GET','POST'].includes(req.method)){",
 " const bearer=req.headers.get('authorization')||'';",
 " const supplied=bearer.startsWith('Bearer ')?bearer.slice(7):'';",
 " if(!supplied||supplied.length>170)return new Response('Unauthorized',{status:401});",
 " async function digestKey(a,b){",
 "  const d=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a)));",
 "  let mismatch=0;for(let i=0;i<32;i++)mismatch|=d[i]^parseInt(b.slice(2*i,2*i+2),16);",
 "  return mismatch===0;",
 " }",
 " let role=null;",
 " if(p==='/adaptive-control-dot-test'){",
 "  const secret=env.B46_ADAPTIVE_DOT_KEY;",
 "  if(!secret||req.method!=='POST')return new Response('Dot not configured',{status:403});",
 "  const match=await digestKey(supplied,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)))).map(x=>x.toString(16).padStart(2,'0')).join(''));",
 "  if(match)role='DOT';",
 " }else{",
 "  if(await digestKey(supplied,'"+ownerHash+"'))role='OWNER';",
 "  if(!role&&env.OWNER_SECRET){",
 "   const shadow=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.OWNER_SECRET)))).map(x=>x.toString(16).padStart(2,'0')).join('');",
 "   if(await digestKey(supplied,shadow))role='OWNER';",
 "  }",
 " }",
 " if(!role)return new Response('Unauthorized',{status:401});",
 " if(req.method==='POST'){",
 "  const origin=req.headers.get('origin');",
 "  if(origin&&origin!==new URL(req.url).origin)return new Response('Wrong origin',{status:403});",
 " }",
 " const head=new Headers({'accept':'application/json','x-b46-control-role':role});",
 " let payload;",
 " if(req.method==='POST'){payload=await req.text();if(payload.length>3072)return new Response('Body limit',{status:413});head.set('content-type','application/json');}",
 " const remote=new Request('https://prematch.internal'+p,{method:req.method,headers:head,...(payload!==undefined?{body:payload}:{})});",
 " const store=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));",
 " const result=await store.fetch(remote);",
 " const headers=new Headers(result.headers);headers.set('cache-control','no-store');headers.set('x-robots-tag','noindex,nofollow');",
 " return new Response(result.body,{status:result.status,headers});",
 "}",
 " "
 ].join('');
 s=once(s,external,e+external);
 return s;
}
const base=await active(worker);
const [installed,settings,cron,originalState,originalActive,protectedBefore]=await Promise.all([
 cf('/workers/'+worker+'/versions/'+base+'?include=modules'),
 cf('/scripts/'+worker+'/settings'),cf('/scripts/'+worker+'/schedules'),
 owners('/ou-adaptive-research-state-test'),owners('/prematch-ou-engine-state'),
 Promise.all(protectedWorkers.map(active))
]);
assert.equal(originalState.http,200);assert.equal(originalState.v?.formulas?.length,42);
assert.equal(originalState.v?.legacyOuIssuance,'disabled');
assert.equal(originalActive.v?.policy?.version,'B46_PREMATCH_OU_ENGINE_V1_TEST');
assert(cron.schedules?.some(x=>x.cron==='*/15 * * * *'));
const map=new Map(installed.modules.map(x=>[x.name,Buffer.from(x.content_base64,'base64')]));
const main=installed.main_module;assert.equal(main,'prematch-only-worker.mjs');
const old=map.get(main).toString('utf8');assert(!old.includes("p==='/adaptive-control-test'"));
const changed=patch(old);map.set(main,Buffer.from(changed));
for(const file of ['b46-adaptive-formula-control-risk-test.mjs','b46-adaptive-manual-control-page-test.mjs']){
 assert(!map.has(file),'MODULE_ALREADY_EXISTS_'+file);
 map.set(file,await readFile(repoPath+file));
}
const tmp=await mkdtemp(join(tmpdir(),'b46-control-'));
for(const [name,buf] of map){
 if(name===main||name.startsWith('b46-adaptive-')&&name.includes('control')){
  const path=join(tmp,name);await writeFile(path,buf);
  execFileSync(process.execPath,['--check',path],{stdio:'inherit'});
 }
}
assert.equal(await active(worker),base,'ACTIVE_VERSION_CHANGED_WHILE_BUILDING');
const metadata={main_module:main,compatibility_date:installed.compatibility_date,
 bindings:settings.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(installed.compatibility_flags?.length?{compatibility_flags:installed.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const [name,content] of map)form.append(name,new Blob([content],{type:'application/javascript+module'}),name);
const inactive=await cf('/scripts/'+worker+'/versions?bindings_inherit=strict',{method:'POST',body:form});
assert(inactive.id);
const uploaded=await cf('/workers/'+worker+'/versions/'+inactive.id+'?include=modules');
assert.equal(uploaded.modules.length,map.size);
for(const mod of uploaded.modules)assert(map.get(mod.name)?.equals(Buffer.from(mod.content_base64,'base64')),'MODULE_BYTES_MISMATCH_'+mod.name);
assert.equal(await active(worker),base,'CONCURRENT_TEST_DEPLOY_DETECTED');
await cf('/scripts/'+worker+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:inactive.id,percentage:100}]})});
let observed=null;
for(let i=0;i<25;i++){
 const r=await owners('/adaptive-control-api-test');
 if(r.http===200&&r.v?.formulas?.length===42){observed=r;break}
 await new Promise(resolve=>setTimeout(resolve,1400));
}
assert(observed,'CONTROL_API_NOT_VISIBLE_AFTER_DEPLOY');
assert.equal(observed.v.summary.running,42,'UNEXPECTED_INITIAL_PAUSE');
assert.equal(observed.v.summary.autoEnabled,0,'AUTO_ENABLED_WITHOUT_OWNER_CONSENT');
const controlPage=await fetch(host+'/adaptive-control-test',{signal:AbortSignal.timeout(25000)});
const pageText=await controlPage.text();
assert(controlPage.ok&&pageText.includes('Adaptive Formula Control'),'CONTROL_PAGE_NOT_ACTIVE');
assert.equal((await owners('/adaptive-control-dot-test','POST',{formula:'A02',action:'PAUSE_IF_DD'})).http,403);
assert.equal((await owners('/ou-adaptive-research-state-test')).v?.formulas?.length,42);
assert.equal((await owners('/prematch-ou-engine-tick','POST')).v?.status,'DISABLED_ADAPTIVE_ONLY');
assert.deepEqual(await Promise.all(protectedWorkers.map(active)),protectedBefore,'PROTECTED_WORKER_CHANGED');
assert.equal(await active(worker),inactive.id);
const nextCron=await cf('/scripts/'+worker+'/schedules');
assert.deepEqual(nextCron.schedules.map(x=>x.cron),cron.schedules.map(x=>x.cron));
const selected='A10',before=observed.v.formulas.find(x=>x.formula===selected);
assert(before&&before.mode==='RUN'&&before.settled===0,'SMOKE_FORMULA_NOT_CLEAN');
let r=await owners('/adaptive-control-api-test','POST',{formula:selected,action:'PAUSE'});assert(r.http===200&&r.v.ok);
r=await owners('/adaptive-control-api-test');assert.equal(r.v.formulas.find(x=>x.formula===selected).mode,'PAUSED_MANUAL');
r=await owners('/adaptive-control-api-test','POST',{formula:selected,action:'RUN'});assert(r.http===200&&r.v.ok);
r=await owners('/adaptive-control-api-test');assert.equal(r.v.formulas.find(x=>x.formula===selected).mode,'RUN');
assert.equal(r.v.summary.running,42);
const afterState=await owners('/ou-adaptive-research-state-test');
assert.equal(afterState.v?.formulas?.length,originalState.v?.formulas?.length);
assert.equal(afterState.v?.records?.length,originalState.v?.records?.length);
console.log('BALL46_ADAPTIVE_MANUAL_CONTROL_TEST_DEPLOY_SUCCESS '+JSON.stringify({
 previous:base,version:inactive.id,url:host+'/adaptive-control-test',
 formulas:r.v.formulas.length,ownerApiAuthenticated:true,manualPauseRunPassed:true,dotNoSecretRejected:true,
 autoEnabledByDefault:0,shadowLedgerPreserved:true,cron:nextCron.schedules.map(x=>x.cron),
 protectedWorkersPreserved:true,providerCalls:0,productionWrites:0
}));
