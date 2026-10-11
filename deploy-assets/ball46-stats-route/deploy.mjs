import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const worker='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const oldCode="export default {...__B46_BASE_WORKER__,async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET'){";
const newCode="export default {...__B46_BASE_WORKER__,async fetch(request,env,ctx){const url=new URL(request.url);if(request.method==='GET' && url.pathname==='/statistics.html')return Response.redirect(new URL('/index.html?view=statistics',url).toString(),302);if(request.method==='GET'){";
const hash=s=>createHash('sha256').update(s).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const canonical=v=>JSON.stringify(v,(key,value)=>key==='annotations'?undefined:(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value));
const log=(label,obj)=>console.log(label,JSON.stringify(obj));
mkdirSync('audit',{recursive:true});
const save=(file,obj)=>writeFileSync('audit/'+file,JSON.stringify(obj,null,2));
async function api(path,opt={}){
  assert(account&&token,'MISSING_CLOUDFLARE_AUTH');
  const r=await fetch(root+path,{...opt,headers:{Authorization:'Bearer '+token,...opt.headers},signal:AbortSignal.timeout(60000)});
  const j=await r.json().catch(()=>null);
  assert(r.ok&&j?.success===true,'CLOUDFLARE_API_FAILED_'+r.status+'_'+path+':'+JSON.stringify(j?.errors||[]).slice(0,320));
  return j.result;
}
async function activeId(){
  const d=await api('/scripts/'+worker+'/deployments'),versions=d.deployments?.[0]?.versions||[];
  assert(versions.length===1&&Number(versions[0].percentage)===100,'PRODUCTION_VERSION_NOT_EXCLUSIVE');
  return versions[0].version_id;
}
const version=id=>api('/workers/'+worker+'/versions/'+id+'?include=modules');
const settings=()=>api('/scripts/'+worker+'/settings');
const schedules=()=>api('/scripts/'+worker+'/schedules');
const bindings=v=>canonical((v.bindings||[]).map(b=>({...b})).sort((a,b)=>a.name.localeCompare(b.name)));
const settingView=s=>canonical(Object.fromEntries(Object.entries(s).filter(([key])=>key!=='annotations')));
function patch(source){
  assert(source.includes('function noStoreUiAsset('),'FRONTEND_WRAPPER_SIGNATURE_MISSING');
  assert(source.includes('__B46_BASE_WORKER__'),'ACTIVE_FRONTEND_ROUTER_MISSING');
  assert.equal(source.split(oldCode).length,2,'ACTIVE_EXPORT_WRAPPER_NOT_UNIQUE');
  assert(!source.includes("url.pathname==='/statistics.html')return Response.redirect"),'REDIRECT_ALREADY_INSTALLED');
  const result=source.replace(oldCode,newCode);
  assert.equal(result,source.slice(0,source.indexOf(oldCode))+newCode+source.slice(source.indexOf(oldCode)+oldCode.length));
  return result;
}
async function routeCheck(host,expectedRedirect){
  const path=expectedRedirect?'/statistics.html':'/index.html?view=statistics';
  const url='https://'+host+path+(path.includes('?')?'&':'?')+'stats_restore_verify='+Date.now();
  const res=await fetch(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(25000)});
  const loc=res.headers.get('location')||'';
  const ok=expectedRedirect
    ? res.status===302&&loc.includes('/index.html?view=statistics')
    : res.status===200;
  assert(ok,'PUBLIC_ROUTE_QA_FAILED_'+host+'_'+res.status+'_'+loc.slice(0,160));
  return{host,status:res.status,location:loc.slice(0,200)};
}
async function activate(id,message){
  return api('/scripts/'+worker+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})});
}
async function waitForActive(id){
  for(let i=0;i<12;i++){if(await activeId()===id)return;await pause(2000)}
  throw Error('WORKER_NOT_ACTIVE_AFTER_DEPLOY');
}
let prior=null,candidate=null,activated=false;
try{
  prior=await activeId();
  const [before,beforeSettings,beforeSchedules]=await Promise.all([version(prior),settings(),schedules()]);
  const main=before.modules?.find(m=>m.name===before.main_module);
  assert(main?.content_base64,'MAIN_MODULE_UNAVAILABLE');
  const source=Buffer.from(main.content_base64,'base64').toString('utf8');
  const target=patch(source),shaBefore=hash(source),shaAfter=hash(target);
  assert.equal(before.modules.length,11,'FRONTEND_MODULE_LAYOUT_CHANGED');
  await routeCheck('www.ball46.com',false);
  const beforeResponse=await fetch('https://www.ball46.com/statistics.html?before='+Date.now(),{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(25000)});
  assert.equal(beforeResponse.status,200,'LEGACY_ROUTE_NOT_CURRENTLY_BROKEN_200');
  const beforeText=await beforeResponse.text();
  assert(beforeText.includes('Statistics')&&beforeText.includes('feedState'),'LEGACY_PAGE_SIGNATURE_CHANGED');
  save('checkpoint.json',{worker,prior,shaBefore,shaAfter,bytes:source.length,moduleCount:before.modules.length,at:new Date().toISOString()});
  log('SITE_STATS_PREFLIGHT_PASS',{prior,shaBefore,shaAfter,onlyLegacyRoute:true,main:before.main_module,moduleCount:before.modules.length});
  assert.equal(await activeId(),prior,'FRONTEND_CHANGED_DURING_PREFLIGHT');
  const metadata={
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags||[],
    bindings:(before.bindings||[]).map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:'latest'}:{...b}),
    annotations:{'workers/message':'Ball46 legacy /statistics.html 302 to single-page current Statistics ONLY',
      'workers/commit_sha':process.env.GITHUB_SHA||''}
  };
  for(const key of ['logpush','observability','limits','placement','tail_consumers'])if(beforeSettings[key]!=null)metadata[key]=beforeSettings[key];
  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const m of before.modules){
    const bytes=m.name===before.main_module?Buffer.from(target):Buffer.from(m.content_base64,'base64');
    form.set(m.name,new Blob([bytes],{type:m.content_type}),m.name);
  }
  const uploaded=await api('/scripts/'+worker+'/versions?bindings_inherit=strict',{method:'POST',body:form});
  candidate=uploaded?.id;assert(candidate,'CANDIDATE_ID_MISSING');
  const uploadedVersion=await version(candidate),candidateMain=uploadedVersion.modules?.find(m=>m.name===uploadedVersion.main_module);
  assert(candidateMain?.content_base64,'CANDIDATE_SOURCE_MISSING');
  assert.equal(hash(Buffer.from(candidateMain.content_base64,'base64')),shaAfter,'CANDIDATE_MAIN_SOURCE_DIFFERS');
  assert.equal(uploadedVersion.modules.length,before.modules.length,'MODULE_COUNT_CHANGED');
  assert.equal(uploadedVersion.main_module,before.main_module,'MAIN_MODULE_CHANGED');
  for(const m of before.modules){
    if(m.name===before.main_module)continue;
    const match=uploadedVersion.modules?.find(x=>x.name===m.name);
    assert(match?.content_base64,'CANDIDATE_ASSET_MODULE_MISSING_'+m.name);
    assert.equal(hash(Buffer.from(match.content_base64,'base64')),hash(Buffer.from(m.content_base64,'base64')),'OTHER_MODULE_CHANGED_'+m.name);
  }
  assert.equal(bindings(uploadedVersion),bindings(before),'FRONTEND_BINDINGS_CHANGED');
  assert.equal(uploadedVersion.compatibility_date,before.compatibility_date,'COMPAT_DATE_CHANGED');
  assert.equal(await activeId(),prior,'ANOTHER_FRONTEND_DEPLOY_INTERVENED');
  await activate(candidate,'Redirect only legacy Ball46 Stats to live single-page Statistics');
  activated=true;
  await waitForActive(candidate);
  const current=await version(candidate);
  assert.equal(hash(Buffer.from(current.modules.find(x=>x.name===current.main_module).content_base64,'base64')),shaAfter,'ACTIVE_SOURCE_NOT_PATCHED');
  assert.equal(settingView(await settings()),settingView(beforeSettings),'FRONTEND_SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(beforeSchedules),'FRONTEND_SCHEDULES_CHANGED');
  assert.equal(bindings(current),bindings(before),'FRONTEND_BINDINGS_CHANGED_AFTER');
  const routeResults=[];
  for(const host of ['www.ball46.com','ball46.com']){
    routeResults.push(await routeCheck(host,true));
    routeResults.push(await routeCheck(host,false));
  }
  const status=await fetch('https://www.ball46.com/api/engine/statistics?paged=1&restored='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});
  const stats=await status.json().catch(()=>null);
  assert(status.ok&&stats?.ok===true&&Array.isArray(stats?.rows)&&stats.rows.length>0,'LIVE_STATISTICS_DATA_MISSING');
  const success={worker,oldVersion:prior,newVersion:candidate,shaBefore,shaAfter,routeResults,
    ledgerTotal:stats.ledgerTotal,settledTotal:stats.total,pending:stats.pending,
    settingsPreserved:true,bindingsPreserved:true,schedulesPreserved:true};
  save('success.json',success);
  log('SITE_STATS_REDIRECT_SUCCESS',success);
}catch(error){
  save('failure.json',{error:String(error?.stack||error),prior,candidate,activated});
  console.error('SITE_STATS_REDIRECT_FAILED',String(error?.stack||error));
  if(activated&&candidate&&prior){
    try{if(await activeId()===candidate){
      await activate(prior,'Rollback Ball46 Statistics legacy route redirect following failed QA');
      await waitForActive(prior);log('SITE_STATS_ROLLBACK_SUCCESS',{prior});
    }}catch(e){console.error('SITE_STATS_ROLLBACK_FAILED',String(e?.message||e))}
  }
  process.exitCode=1;
}
