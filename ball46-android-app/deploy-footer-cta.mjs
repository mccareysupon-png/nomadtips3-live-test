import assert from 'node:assert/strict';
import fs from 'node:fs';

const SCRIPT='ball46-production';
const TARGET='assets/index.html';
const APK='https://github.com/mccareysupon-png/nomadtips3-live-test/releases/download/ball46-android-v1.0.0-beta1/BALL46-Android-v1.0.0-beta1.apk';
const ICON='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/f4954aa4468b2101fd081e54d427582fa167ec3c/ball46-android-app/app/src/main/res/drawable/ball46_icon.png';
const MARK='B46_ANDROID_DOWNLOAD_FOOTER_20261112';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
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

function patch(src){
  assert(!src.includes(MARK),'ANDROID_FOOTER_ALREADY_PRESENT');
  const footer='<footer id="b46-site-footer-v1" aria-label="Ball46 footer">';
  const bottom='    <div class="b46f-bottom">';
  assert.equal(src.split(footer).length-1,1,'FOOTER_ANCHOR_COUNT');
  assert.equal(src.split(bottom).length-1,1,'FOOTER_BOTTOM_ANCHOR_COUNT');

  const style=`<style id="b46-android-download-footer-style">/* ${MARK} */
#b46-site-footer-v1 .b46f-app-download{margin:18px 0 16px;display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid rgba(49,212,163,.34);border-radius:16px;background:linear-gradient(135deg,rgba(49,212,163,.10),rgba(49,212,163,.035));box-shadow:0 12px 34px rgba(0,0,0,.16)}
#b46-site-footer-v1 .b46f-app-icon{width:58px;height:58px;flex:0 0 58px;border-radius:15px;object-fit:cover;box-shadow:0 7px 20px rgba(0,0,0,.28)}
#b46-site-footer-v1 .b46f-app-copy{min-width:0;flex:1}
#b46-site-footer-v1 .b46f-app-copy strong{display:block;color:var(--text,#f5f7f6);font:900 15px/1.2 Arial,sans-serif;letter-spacing:.01em}
#b46-site-footer-v1 .b46f-app-copy span{display:block;margin-top:5px;color:var(--muted,#9ca8a3);font:700 10px/1.45 Arial,sans-serif}
#b46-site-footer-v1 .b46f-app-btn{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 17px;border-radius:12px;background:#31D4A3;color:#04120f!important;text-decoration:none!important;font:900 11px/1 Arial,sans-serif;letter-spacing:.02em;box-shadow:0 8px 22px rgba(49,212,163,.18);transition:transform .16s ease,filter .16s ease}
#b46-site-footer-v1 .b46f-app-btn:hover{filter:brightness(1.05);transform:translateY(-1px)}
#b46-site-footer-v1 .b46f-app-btn small{margin-left:7px;font:800 8px/1 Arial,sans-serif;opacity:.72}
@media(max-width:760px){#b46-site-footer-v1 .b46f-app-download{display:grid;grid-template-columns:52px 1fr;gap:11px 12px;padding:13px}#b46-site-footer-v1 .b46f-app-icon{width:52px;height:52px;border-radius:13px}#b46-site-footer-v1 .b46f-app-copy strong{font-size:14px}#b46-site-footer-v1 .b46f-app-btn{grid-column:1/-1;width:100%;box-sizing:border-box}}
</style>`;

  const card=`    <div class="b46f-app-download" id="b46-android-download">
      <img class="b46f-app-icon" src="${ICON}" alt="BALL46 Android app icon" width="58" height="58" loading="lazy" decoding="async">
      <div class="b46f-app-copy">
        <strong>BALL46 for Android</strong>
        <span>Install the Android beta for quick access to BALL46.</span>
      </div>
      <a class="b46f-app-btn" href="${APK}" rel="noopener noreferrer" aria-label="Download BALL46 Android APK">Download Android APK <small>v1.0 Beta</small></a>
    </div>
`;

  return src.replace(footer,style+footer).replace(bottom,card+bottom);
}

let candidate='',activated=false,base='';
try{
  const apkHead=await fetch(APK,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(30000)});
  assert(apkHead.ok,'APK_DOWNLOAD_NOT_AVAILABLE:'+apkHead.status);

  base=await active();
  const current=await version(base),settingsBefore=await settings(),schedulesBefore=await schedules();
  const mod=current.modules.find(m=>m.name===TARGET);assert(mod,'TARGET_MODULE_MISSING');
  const src=Buffer.from(mod.content_base64,'base64').toString('utf8');
  const patched=patch(src);

  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':MARK,'workers/message':'Add BALL46 Android download card to site footer'}};if(current.placement)metadata.placement=current.placement;
  const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){let bytes=Buffer.from(m.content_base64,'base64');if(m.name===TARGET)bytes=Buffer.from(patched);form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name)}
  const uploaded=await api('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});candidate=uploaded?.id;assert(candidate,'CANDIDATE_MISSING');

  fs.writeFileSync('ball46-android-app/footer-deploy-state.json',JSON.stringify({base,candidate,target:TARGET,apk:APK},null,2));

  const cv=await version(candidate);assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  let changed=0;for(const m of current.modules){const cm=cv.modules.find(x=>x.name===m.name);assert(cm,'MODULE_MISSING:'+m.name);if(cm.content_base64!==m.content_base64)changed++;if(m.name!==TARGET)assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name)}assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');
  assert.equal(await active(),base,'PRODUCTION_DRIFT_BEFORE_ACTIVATE');

  const candHtml=Buffer.from(cv.modules.find(m=>m.name===TARGET).content_base64,'base64').toString('utf8');
  assert(candHtml.includes(MARK),'CANDIDATE_MARKER_MISSING');
  assert(candHtml.includes(APK),'CANDIDATE_APK_LINK_MISSING');
  assert(candHtml.includes('Download Android APK'),'CANDIDATE_CTA_MISSING');

  await activate(candidate,'Add BALL46 Android download card to site footer');activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');

  const live=await version(candidate);const liveHtml=Buffer.from(live.modules.find(m=>m.name===TARGET).content_base64,'base64').toString('utf8');
  assert(liveHtml.includes(MARK),'LIVE_MARKER_MISSING');assert(liveHtml.includes(APK),'LIVE_APK_LINK_MISSING');
  console.log('BASE_ACTIVE='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('CHANGED_MODULES=1');console.log('APK_LINK_OK=1');console.log('ANDROID_FOOTER_CTA=1');console.log('BINDINGS_PRESERVED=1');console.log('SCHEDULES_PRESERVED=1');console.log('ANDROID_FOOTER_DEPLOY_SUCCESS=1');
}catch(e){console.error(e.stack||e);try{if(activated&&candidate&&base&&await active()===candidate){await activate(base,'Rollback Android footer CTA after failed verification');for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}console.log('ROLLBACK_ACTIVE='+(await active()))}}catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}process.exit(1)}
