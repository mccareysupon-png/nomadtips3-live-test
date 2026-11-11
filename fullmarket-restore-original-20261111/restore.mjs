import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const EXPECT_CURRENT='bf5f0cbc-54eb-4a15-b50f-5d898e2dd56d';
const RESTORE='00a5e28b-b565-4b90-88b9-959eb0e0cb07';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);return j.result}
async function active(){const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');return v[0].version_id}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function settings(){return api(`/scripts/${SCRIPT}/settings`)}
async function schedules(){return api(`/scripts/${SCRIPT}/schedules`)}
async function activate(id,msg){return api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
function textOf(v){const m=v.modules.find(x=>x.name===v.main_module)||v.modules.find(x=>x.name==='index.js');assert(m,'MAIN_MISSING');return Buffer.from(m.content_base64,'base64').toString('utf8')}

let changed=false;
try{
  const before=await active(); assert.equal(before,EXPECT_CURRENT,'ACTIVE_VERSION_DRIFT');
  const cur=await version(EXPECT_CURRENT),old=await version(RESTORE);
  const curText=textOf(cur),oldText=textOf(old);
  assert(curText.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110'),'CURRENT_LAZY_MARKER_MISSING');
  assert(curText.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'CURRENT_PERF_PATCH_MISSING');
  assert(!oldText.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110'),'RESTORE_STILL_LAZY');
  assert(oldText.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'RESTORE_PERF_PATCH_MISSING');
  assert(oldText.includes("saved.active)?saved.active:'bet365'"),'RESTORE_DEFAULT_BOOKMAKER_NOT_FOUND');
  const settingsBefore=await settings(), schedulesBefore=await schedules();

  await activate(RESTORE,'Restore original Full Market default rendering; preserve performance patch');
  changed=true;
  for(let i=0;i<25;i++){if(await active()===RESTORE)break;await delay(1000)}
  assert.equal(await active(),RESTORE,'RESTORE_NOT_ACTIVE');

  let ok=false,last='';
  for(let i=0;i<20;i++){
    const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?restore='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    const t=await r.text(); last=t;
    if(r.ok && !t.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110') && t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110') && t.includes("saved.active)?saved.active:'bet365'")){ok=true;break}
    await delay(1000);
  }
  assert(ok,'PUBLIC_RESTORE_NOT_VISIBLE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');
  console.log('PREVIOUS_ACTIVE='+EXPECT_CURRENT);
  console.log('FINAL_PRODUCTION='+RESTORE);
  console.log('LAZY_REMOVED=1');
  console.log('FULL_MARKET_DEFAULT_RESTORED=1');
  console.log('PERF_PATCH_PRESERVED=1');
  console.log('RESTORE_SUCCESS=1');
}catch(e){
  console.error(e.stack||e);
  try{
    if(changed && await active()===RESTORE){
      await activate(EXPECT_CURRENT,'Rollback Full Market restore after failed verification');
      for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}
      console.log('ROLLBACK_ACTIVE='+(await active()));
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
