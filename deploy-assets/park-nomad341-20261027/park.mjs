// One-time guarded settings-only parking of isolated NOMAD 3.41 test Worker.
// Do not deploy any source; only ENGINE_CYCLE_MODE may change. Never log credentials or secret values.
// Requires explicit owner approval provided in conversation Oct 27, 2026.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('missing CI Cloudflare credentials');
const SCRIPT='nomadtips3-live-engine-5usd-shadow';
const EXPECTED_VERSION='12d4c568-c795-42a8-9d99-4d680affddba';
const API='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/scripts/'+SCRIPT;
const health='https://nomadtips3-live-engine-5usd-shadow.mccarey-supon.workers.dev/fiveusd-native';
const headers={Authorization:'Bearer '+token};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fail=(why)=>{throw new Error(why)};
const req=async(path,init={})=>{
 const response=await fetch(API+path,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(25000)});
 const payload=await response.json().catch(()=>({}));
 return {http:response.status,ok:response.ok&&payload?.success===true,data:payload.result??null,errors:(payload.errors||[]).map(x=>x.code).slice(0,5)};
};
const deployInfo=async()=>{
 const x=await req('/deployments?per_page=3');if(!x.ok)fail('deployments_read_failed_'+x.http);
 const a=(Array.isArray(x.data)?x.data:x.data?.deployments||[])[0];
 const live=(a?.versions||[]).filter(v=>v.percentage>0);
 if(live.length!==1||Number(live[0].percentage)!==100)fail('unexpected_traffic_split');
 return {id:a.id,version:live[0].version_id};
};
const settings=async()=>{
 const x=await req('/settings');if(!x.ok)fail('settings_read_failed_'+x.http);
 const list=x.data?.bindings;
 if(!Array.isArray(list))fail('settings_bindings_missing');
 const plain=list.find(b=>b.name==='ENGINE_CYCLE_MODE'&&b.type==='plain_text');
 if(!plain)fail('cycle_setting_missing');
 return {bindings:list,mode:plain.text};
};
const bindingShape=b=>({name:b.name,type:b.type,namespace:b.namespace_id||b.namespace||null,script:b.script_name||b.service||null});
const sameBindings=(a,b)=>JSON.stringify(a.map(bindingShape).sort((x,y)=>x.name.localeCompare(y.name)))===JSON.stringify(b.map(bindingShape).sort((x,y)=>x.name.localeCompare(y.name)));
const publicHealth=async()=>{
 try{const r=await fetch(health,{method:'GET',signal:AbortSignal.timeout(15000)});
 const j=await r.json().catch(()=>({}));
 return {http:r.status,contract:j.runtimeContract||null,mode:j.mode||null,hasKey:Boolean(j.hasKey),last60:j.rate?.live?.usedLast60s??null,lastFetch:j.live?.fetchedAt??j.snapshot?.live?.fetchedAt??null,cycle:j.cadence?.cycleMs??null};
 }catch{return {http:0};}
};
const beforeDeploy=await deployInfo();
const before=await settings();
const beforeHealth=await publicHealth();
console.log('PARK_341_PREFLIGHT='+JSON.stringify({deployment:beforeDeploy,mode:before.mode,bindings:before.bindings.map(bindingShape),health:beforeHealth}));
if(beforeDeploy.version!==EXPECTED_VERSION)fail('active_version_changed_abort');
if(before.mode==='on_demand'){console.log('PARK_341_ALREADY_ON_DEMAND');process.exit(0)}
if(before.mode!=='continuous')fail('unknown_existing_cycle_mode');
if(before.bindings.length!==10)fail('unexpected_binding_count');
if(!before.bindings.some(b=>b.type==='secret_text'&&b.name==='FIVEDOLLAR_API_KEY'))fail('5usd_secret_missing_before');
if(!before.bindings.some(b=>b.type==='durable_object_namespace'&&b.name==='ENGINE'))fail('DO_binding_missing_before');
if(beforeHealth.http!==200||beforeHealth.contract!=='341-5usd-test-authority-v1'||beforeHealth.cycle!==3000)fail('unexpected_shadow_contract');
const modified=before.bindings.map(b=>b.name==='ENGINE_CYCLE_MODE'?{...b,text:'on_demand'}:b);
// A full binding list is supplied to preserve DO and secret-name references.
const form=new FormData();
form.set('settings',JSON.stringify({bindings:modified,annotations:{'workers/message':'Park ONLY NOMAD 3.41 shadow 3-second alarm, BALL46 issue #370'}}));
let patch;
try{patch=await req('/settings',{method:'PATCH',body:form});}catch(e){console.log('PARK_341_PATCH_NETWORK_ERROR');throw e;}
console.log('PARK_341_PATCH='+JSON.stringify({http:patch.http,ok:patch.ok,errors:patch.errors}));
const after=await settings();
const afterDeployment=await deployInfo();
console.log('PARK_341_POST_PATCH='+JSON.stringify({deployment:afterDeployment,mode:after.mode,bindingsCount:after.bindings.length,namesPreserved:sameBindings(before.bindings,after.bindings)}));
async function restoreIfSafe(reason){
 console.log('PARK_341_ROLLBACK_ATTEMPT='+reason);
 const current=await deployInfo();
 // Roll back only the isolated shadow script, never any BALL46 worker.
 if(current.version===EXPECTED_VERSION){console.log('PARK_341_ROLLBACK_ALREADY_ACTIVE');return}
 const rollback=await req('/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:EXPECTED_VERSION,percentage:100}],annotations:{'workers/message':'Revert shadow parking (issue #370)'}})});
 console.log('PARK_341_ROLLBACK_RESULT='+JSON.stringify({http:rollback.http,ok:rollback.ok,errors:rollback.errors}));
}
if(!patch.ok){
 if(after.mode!=='continuous'||!sameBindings(before.bindings,after.bindings))await restoreIfSafe('patch_failure_mutated_settings');
 fail('patch_failed_abort');
}
if(!sameBindings(before.bindings,after.bindings)||after.mode!=='on_demand'){
 await restoreIfSafe('invariants_failed');
 fail('patch_binding_or_mode_invariants_failed');
}
if(afterDeployment.version===EXPECTED_VERSION){
 console.log('PARK_341_SETTINGS_PATCH_NOT_DEPLOYED_ACTIVE_PREVIOUS');
 // Do not invent or auto-release a new version without a version-binding check.
}else{
 console.log('PARK_341_NEW_ACTIVE_VERSION='+afterDeployment.version);
}
await sleep(3800);
const h=await publicHealth();
console.log('PARK_341_POST_HEALTH='+JSON.stringify(h));
console.log('PARK_341_RESULT='+JSON.stringify({settingsUpdated:after.mode==='on_demand',activeVersion:afterDeployment.version,alarmStopped:h.lastFetch!=null&&h.lastFetch===beforeHealth.lastFetch,health:h}));
