import assert from 'node:assert/strict';
import fs from 'node:fs';
const SCRIPT='ball46-production';
const EXPECT_CURRENT='fbdde527-b04f-4675-8e4e-485f8406a1e2';
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
function one(src,a,b,label){const n=src.split(a).length-1;assert.equal(n,1,label+'_COUNT_'+n);return src.replace(a,b)}
function patchHtml(html){
 assert(html.includes('B46_PIN_V2_MOBILE_20261111'),'MOBILE_PIN_V2_BASE_MISSING');
 assert(!html.includes('B46_PIN_V2_MOBILE_TAP_GREEN_20261112'),'HOTFIX_ALREADY_PRESENT');
 html=one(html,'#b46gn-cards .b46-pin-v2-mobile{position:absolute;z-index:auto;left:8px;right:auto;top:50%;transform:translateY(-50%);width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font:700 18px/1 Arial,sans-serif;color:#d4a900;background:rgba(4,18,16,.58);cursor:pointer;user-select:none;touch-action:manipulation}','#b46gn-cards .b46-pin-v2-mobile{position:absolute;z-index:12;left:6px;right:auto;top:50%;transform:translateY(-50%);width:30px;height:30px;display:grid;place-items:center;border-radius:50%;font:700 19px/1 Arial,sans-serif;color:#31D4A3;background:rgba(4,18,16,.72);cursor:pointer;user-select:none;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}','MOBILE_STAR_STYLE');
 html=one(html,'#b46gn-cards .b46-pin-v2-mobile[data-on="1"]{color:#f2c94c;text-shadow:0 0 8px rgba(242,201,76,.28)}','#b46gn-cards .b46-pin-v2-mobile[data-on="1"]{color:#31D4A3;text-shadow:0 0 8px rgba(49,212,163,.32)}','MOBILE_STAR_ON_STYLE');
 html=one(html,"s.setAttribute('aria-label',on?'Unpin match':'Pin match to top')","s.setAttribute('aria-label',on?'Unpin match':'Pin match to top');s.setAttribute('role','button');s.tabIndex=0",'MOBILE_STAR_ACCESS');
 html=one(html,"function bind(){const r=document.querySelector('#b46gn-results');if(!r||r.dataset.b46PinV2Bound==='1')return false;r.dataset.b46PinV2Bound='1';r.addEventListener('click'","function bind(){const r=document.querySelector('#b46gn-results');if(!r||document.documentElement.dataset.b46PinV2MobileBound==='1')return false;document.documentElement.dataset.b46PinV2MobileBound='1';document.addEventListener('click'",'MOBILE_CAPTURE');
 html=one(html,'/* B46_PIN_V2_MOBILE_20261111 */','/* B46_PIN_V2_MOBILE_20261111 */ /* B46_PIN_V2_MOBILE_TAP_GREEN_20261112 */','HOTFIX_MARKER');
 return html;
}
let candidate='',activated=false;
try{
 assert.equal(await active(),EXPECT_CURRENT,'ACTIVE_VERSION_DRIFT');
 const current=await version(EXPECT_CURRENT),settingsBefore=await settings(),schedulesBefore=await schedules();
 const html=current.modules.find(m=>m.name==='assets/index.html');assert(html,'HTML_MODULE_MISSING');
 const htmlSrc=Buffer.from(html.content_base64,'base64').toString('utf8'),htmlPatched=patchHtml(htmlSrc);
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':'B46_PIN_V2_MOBILE_TAP_GREEN_20261112','workers/message':'Mobile Favorite star tap fix + BALL46 green'}};if(current.placement)metadata.placement=current.placement;
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
 for(const m of current.modules){let bytes=Buffer.from(m.content_base64,'base64');if(m.name===html.name)bytes=Buffer.from(htmlPatched);form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name)}
 const uploaded=await api('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});candidate=uploaded?.id;assert(candidate,'CANDIDATE_MISSING');
 fs.writeFileSync('pinned-fixtures-v2-production/mobile-hotfix-state.json',JSON.stringify({base:EXPECT_CURRENT,candidate,script:SCRIPT},null,2));
 const cv=await version(candidate);assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
 let changed=0;for(const m of current.modules){const cm=cv.modules.find(x=>x.name===m.name);assert(cm,'MODULE_MISSING:'+m.name);if(cm.content_base64!==m.content_base64)changed++;if(m.name!==html.name)assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name)}assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
 assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
 await activate(candidate,'Mobile Favorite star tap fix + BALL46 green');activated=true;for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
 assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');
 console.log('BASE_ACTIVE='+EXPECT_CURRENT);console.log('FINAL_PRODUCTION='+candidate);console.log('CHANGED_MODULES=1');console.log('MOBILE_STAR_TAP_FIX=1');console.log('MOBILE_STAR_GREEN_31D4A3=1');console.log('BINDINGS_PRESERVED=1');console.log('SCHEDULES_PRESERVED=1');console.log('MOBILE_HOTFIX_DEPLOY_SUCCESS=1');
}catch(e){console.error(e.stack||e);try{if(activated&&candidate&&await active()===candidate){await activate(EXPECT_CURRENT,'Rollback mobile Favorite hotfix after failed deploy verification');for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}console.log('ROLLBACK_ACTIVE='+(await active()))}}catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}process.exit(1)}
