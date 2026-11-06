import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const MARK_START='<script id="b46-favorite-v11-20261106">';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
let base=null,candidate=null,activated=false;

async function api(path,options={}){
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json();assert(r.ok&&j.success===true,`CF_ERROR ${r.status} ${JSON.stringify(j.errors||j)}`);return j.result;
}
async function active(){
  const d=await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
  const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_NOT_SINGLE_VERSION');
  return v[0].version_id;
}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function activate(id,msg){
  await api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
async function settings(){return api(`/scripts/${SCRIPT}/settings`)}
async function schedules(){return api(`/scripts/${SCRIPT}/schedules`)}

try{
  base=await active();
  const current=await version(base);
  const index=current.modules.find(m=>m.name==='assets/index.html');assert(index,'INDEX_MISSING');
  const src=Buffer.from(index.content_base64,'base64').toString('utf8');

  const start=src.indexOf(MARK_START);
  assert(start>=0,'FAVORITE_SCRIPT_NOT_FOUND');
  const end=src.indexOf('</script>',start);
  assert(end>start,'FAVORITE_SCRIPT_END_NOT_FOUND');
  const patched=src.slice(0,start)+src.slice(end+9);

  assert(!patched.includes('b46-favorite-v11-20261106'),'FAVORITE_SCRIPT_STILL_PRESENT');
  assert(!patched.includes('BALL46_FAVORITE_V1_TEST_20261106'),'FAVORITE_CODE_STILL_PRESENT');

  const settingsBefore=await settings();
  const schedulesBefore=await schedules();
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');

  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':'B46_REMOVE_FAVORITE_20261106','workers/message':'Remove BALL46 Favorite feature completely'}};
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name==='assets/index.html'?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
    let type=m.content_type;
    if(!type){if(m.name===current.main_module||/\.m?js$/.test(m.name))type='application/javascript+module';else if(m.name.endsWith('.html'))type='text/html';else if(m.name.endsWith('.css'))type='text/css';else type='application/octet-stream';}
    form.append(m.name,new Blob([bytes],{type}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});assert(uploaded?.id,'CANDIDATE_ID_MISSING');candidate=uploaded.id;

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64');
    if(m.name==='assets/index.html')assert.equal(sha(got),sha(Buffer.from(patched)),'INDEX_HASH_BAD');
    else assert.equal(sha(got),sha(Buffer.from(m.content_base64,'base64')),`UNRELATED_MODULE_CHANGED:${m.name}`);
  }

  await activate(candidate,'Remove Favorite feature completely');
  activated=true;
  for(let i=0;i<20;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const activeNow=await version(candidate);
  const activeIndex=activeNow.modules.find(m=>m.name==='assets/index.html');assert(activeIndex,'ACTIVE_INDEX_MISSING');
  const activeHtml=Buffer.from(activeIndex.content_base64,'base64').toString('utf8');
  assert(!activeHtml.includes('b46-favorite-v11-20261106'),'ACTIVE_FAVORITE_SCRIPT_PRESENT');
  assert(!activeHtml.includes('BALL46_FAVORITE_V1_TEST_20261106'),'ACTIVE_FAVORITE_CODE_PRESENT');
  assert(!activeHtml.includes('data-b46-favorite-toggle'),'ACTIVE_FAVORITE_TOGGLE_PRESENT');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('BALL46_FAVORITE_COMPLETE_REMOVAL_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback after Favorite removal verification failure');
      for(let i=0;i<20;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
