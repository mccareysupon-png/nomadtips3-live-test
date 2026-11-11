import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const EXPECT_CURRENT='89063a40-8b5f-4c09-96c1-a19139f4c701';
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
function typeFor(m,main){if(m.content_type)return m.content_type;if(m.name===main||/\.m?js$/.test(m.name))return 'application/javascript+module';if(m.name.endsWith('.html'))return 'text/html';if(m.name.endsWith('.css'))return 'text/css';return 'application/octet-stream'}

const START='  /* B46_FULLMARKET_LAZY_ONDEMAND_20261110: Full Market two-level lazy rendering, no additional network request. */';
const END="  const h=new Headers(response.headers); h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0'); h.delete('content-length'); h.set('x-ball46-betsson','20261005');";

async function publicCheck(expectLazy){
  let last='';
  for(let i=0;i<20;i++){
    const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?restorefull='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    const t=await r.text(); last=t;
    if(expectLazy){
      if(r.ok&&t.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110')&&t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'))return t;
    }else{
      if(r.ok&&!t.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110')&&t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110')&&t.includes("saved.active)?saved.active:'bet365'")&&t.includes("slug=String(button.dataset.fmbBook||'bet365')"))return t;
    }
    await delay(1000);
  }
  throw new Error('PUBLIC_CHECK_FAILED expectLazy='+expectLazy+' lastLen='+last.length);
}

let candidate='',activated=false;
try{
  assert.equal(await active(),EXPECT_CURRENT,'ACTIVE_VERSION_DRIFT');
  await publicCheck(true);
  const current=await version(EXPECT_CURRENT),settingsBefore=await settings(),schedulesBefore=await schedules();
  const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');assert(main,'MAIN_MISSING');
  const src=Buffer.from(main.content_base64,'base64').toString('utf8');
  const s=src.indexOf(START); assert(s>=0,'LAZY_BLOCK_START_MISSING');
  const e=src.indexOf(END,s); assert(e>s,'LAZY_BLOCK_END_MISSING');
  assert.equal(src.indexOf(START,s+1),-1,'MULTIPLE_LAZY_BLOCKS');
  const lazyBlock=src.slice(s,e);
  assert(lazyBlock.includes("saved.active===clicked?'':clicked"),'LAZY_CLICK_TOGGLE_MISSING');
  assert(lazyBlock.includes("panelSig='__collapsed__'"),'LAZY_COLLAPSED_PANEL_MISSING');
  const patched=src.slice(0,s)+src.slice(e);
  assert(!patched.includes(START),'LAZY_BLOCK_STILL_PRESENT');
  assert(patched.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'PERF_PATCH_LOST');
  assert(patched.includes(END),'HEADERS_ANCHOR_LOST');

  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_UPLOAD');
  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':'B46_FULLMARKET_ORIGINAL_20261111','workers/message':'Restore original Full Market rendering; keep current Production and performance patch'}};
  if(current.placement)metadata.placement=current.placement;
  const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){const bytes=m.name===main.name?Buffer.from(patched):Buffer.from(m.content_base64,'base64');form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name)}
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});candidate=uploaded?.id;assert(candidate,'CANDIDATE_MISSING');
  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  let changed=0;
  for(const m of current.modules){const cm=cv.modules.find(x=>x.name===m.name);assert(cm,'MODULE_MISSING:'+m.name);if(m.name===main.name){if(cm.content_base64!==m.content_base64)changed++;const t=Buffer.from(cm.content_base64,'base64').toString('utf8');assert(!t.includes(START),'CANDIDATE_LAZY_BLOCK_PRESENT');assert(t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'CANDIDATE_PERF_PATCH_MISSING')}else assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name)}
  assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');
  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_ACTIVATE');

  await activate(candidate,'Restore original Full Market rendering; preserve current Production changes');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
  await publicCheck(false);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');
  console.log('BASE_ACTIVE='+EXPECT_CURRENT);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('CHANGED_MODULES=1');
  console.log('LAZY_REMOVED=1');
  console.log('FULL_MARKET_DEFAULT_RESTORED=1');
  console.log('PERF_PATCH_PRESERVED=1');
  console.log('SURGICAL_RESTORE_SUCCESS=1');
}catch(e){
  console.error(e.stack||e);
  try{if(activated&&candidate&&await active()===candidate){await activate(EXPECT_CURRENT,'Rollback surgical Full Market restore after failed verification');for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}console.log('ROLLBACK_ACTIVE='+(await active()))}}catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
