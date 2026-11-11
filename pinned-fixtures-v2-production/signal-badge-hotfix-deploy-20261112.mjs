import assert from 'node:assert/strict';
import fs from 'node:fs';

const SCRIPT='ball46-production';
const EXPECT_CURRENT='1894505b-2fac-4d4c-99eb-9312af4dfcb5';
const TARGET_MODULE='screen-refresh-5s-20261104.txt';
const MARKER='B46_PIN_V2_SIGNAL_BADGE_FIX_PROD_20261112';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result}
async function active(){const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');return v[0].version_id}
async function version(id){return api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}
async function settings(){return api('/scripts/'+SCRIPT+'/settings')}
async function schedules(){return api('/scripts/'+SCRIPT+'/schedules')}
async function activate(id,msg){return api('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
function typeFor(m,main){if(m.content_type)return m.content_type;if(m.name===main||/\.m?js$/.test(m.name))return'application/javascript+module';if(m.name.endsWith('.html'))return'text/html';if(m.name.endsWith('.css'))return'text/css';return'application/octet-stream'}
function patchSource(src){
  assert(src.includes('B46_PIN_V2_FRESH_20261111'),'PIN_V2_BASE_MISSING');
  assert(!src.includes(MARKER),'SIGNAL_FIX_ALREADY_PRESENT');
  const anchor="function b46PinPaint(row){if(!row)return;";
  assert.equal(src.split(anchor).length-1,1,'PIN_PAINT_ANCHOR_COUNT');
  const helper="function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');if(!Number.isInteger(n)||n<=0){badge?.remove();return;}if(!badge){badge=document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden=\"true\"></i><b></b><span></span>';host.append(badge);}const number=String(n),label=n===1?'Signal':'Signals';if(badge.children[1].textContent!==number)badge.children[1].textContent=number;if(badge.children[2].textContent!==label)badge.children[2].textContent=label;badge.setAttribute('aria-label',number+' active '+label.toLowerCase())}\nconst "+MARKER+"=true;\nfunction b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);";
  const out=src.replace(anchor,helper);
  assert(out.includes("data-inline-signal-count"),'SIGNAL_METADATA_SOURCE_MISSING');
  assert(out.includes("b46PinSignalBadge(row);"),'SIGNAL_BADGE_CALL_MISSING');
  assert(!helper.includes('fetch('),'EXTRA_API_DETECTED');
  return out;
}
let candidate='',activated=false;
try{
  assert.equal(await active(),EXPECT_CURRENT,'ACTIVE_VERSION_DRIFT');
  const current=await version(EXPECT_CURRENT),settingsBefore=await settings(),schedulesBefore=await schedules();
  const html=current.modules.find(m=>m.name==='assets/index.html');assert(html,'HTML_MODULE_MISSING');
  const htmlSrc=Buffer.from(html.content_base64,'base64').toString('utf8');assert(htmlSrc.includes('B46_PIN_V2_MOBILE_TAP_GREEN_20261112'),'MOBILE_HOTFIX_MISSING');
  const mod=current.modules.find(m=>m.name===TARGET_MODULE);assert(mod,'TARGET_MODULE_MISSING');
  const src=Buffer.from(mod.content_base64,'base64').toString('utf8');
  const patched=patchSource(src);
  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':MARKER,'workers/message':'Restore Signal badge after Favorite move using existing inline metadata'}};if(current.placement)metadata.placement=current.placement;
  const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){let bytes=Buffer.from(m.content_base64,'base64');if(m.name===TARGET_MODULE)bytes=Buffer.from(patched);form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name)}
  const uploaded=await api('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});candidate=uploaded?.id;assert(candidate,'CANDIDATE_MISSING');
  fs.writeFileSync('pinned-fixtures-v2-production/signal-badge-hotfix-state.json',JSON.stringify({base:EXPECT_CURRENT,candidate,script:SCRIPT,target:TARGET_MODULE},null,2));
  const cv=await version(candidate);assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  let changed=0;for(const m of current.modules){const cm=cv.modules.find(x=>x.name===m.name);assert(cm,'MODULE_MISSING:'+m.name);if(cm.content_base64!==m.content_base64)changed++;if(m.name!==TARGET_MODULE)assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name)}assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  await activate(candidate,'Restore Signal badge after Favorite move using existing inline metadata');activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');
  const live=await version(candidate);const liveMod=live.modules.find(m=>m.name===TARGET_MODULE);const liveSrc=Buffer.from(liveMod.content_base64,'base64').toString('utf8');
  assert(liveSrc.includes(MARKER),'LIVE_MARKER_MISSING');assert(liveSrc.includes("data-inline-signal-count"),'LIVE_SIGNAL_METADATA_SOURCE_MISSING');assert(liveSrc.includes("b46PinSignalBadge(row);"),'LIVE_SIGNAL_BADGE_CALL_MISSING');
  console.log('BASE_ACTIVE='+EXPECT_CURRENT);console.log('FINAL_PRODUCTION='+candidate);console.log('CHANGED_MODULES=1');console.log('SIGNAL_BADGE_FIX=1');console.log('FIX_EXTRA_API=0');console.log('BINDINGS_PRESERVED=1');console.log('SCHEDULES_PRESERVED=1');console.log('SIGNAL_BADGE_DEPLOY_SUCCESS=1');
}catch(e){console.error(e.stack||e);try{if(activated&&candidate&&await active()===candidate){await activate(EXPECT_CURRENT,'Rollback Signal badge hotfix after failed deploy verification');for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}console.log('ROLLBACK_ACTIVE='+(await active()))}}catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}process.exit(1)}
