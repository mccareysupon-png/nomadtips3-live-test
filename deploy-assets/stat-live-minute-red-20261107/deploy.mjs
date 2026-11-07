import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);
  return j.result;
}
async function active(){
  const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  return v[0].version_id;
}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function settings(){return api(`/scripts/${SCRIPT}/settings`)}
async function schedules(){return api(`/scripts/${SCRIPT}/schedules`)}
async function activate(id,msg){
  return api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
function typeFor(m,main){
  if(m.content_type)return m.content_type;
  if(m.name===main||/\.m?js$/.test(m.name))return 'application/javascript+module';
  if(m.name.endsWith('.txt'))return 'text/plain';
  if(m.name.endsWith('.html'))return 'text/html';
  return 'application/octet-stream';
}
let base=null,candidate=null,activated=false;
try{
  base=await active();
  const current=await version(base);
  const html=current.modules.find(m=>m.name==='assets/index.html');
  assert(html,'INDEX_HTML_MODULE_MISSING');
  const htmlTxt=Buffer.from(html.content_base64,'base64').toString('utf8');
  const marker='B46_STAT_LIVE_MINUTE_RED_TRANSPARENT_20261107';
  assert(!htmlTxt.includes(marker),'PATCH_ALREADY_PRESENT');
  assert(htmlTxt.includes('</body>'),'BODY_END_MISSING');

  const patch=`
<style id="b46-stat-live-minute-red-transparent-20261107">
/* B46_STAT_LIVE_MINUTE_RED_TRANSPARENT_20261107 */
body[data-workspace-view="statistics"] .sp-results .sp-result.b46-stat-live-minute,
body[data-workspace-view="statistics"] .sp-results .sp-result.b46-stat-live-minute *{
  color:#EF4444!important;
}
body[data-workspace-view="statistics"] .sp-results .sp-result.b46-stat-live-minute{
  background:transparent!important;
  border-color:transparent!important;
  box-shadow:none!important;
}
</style>
<script id="b46-stat-live-minute-red-transparent-runtime-20261107">
(()=>{
  'use strict';
  const re=/^[\\s•·]*\\d{1,3}(?:'|’|′)\\s*$/;
  const paint=root=>{
    const scope=root&&root.querySelectorAll?root:document;
    scope.querySelectorAll('body[data-workspace-view="statistics"] .sp-results .sp-result').forEach(el=>{
      el.classList.toggle('b46-stat-live-minute',re.test((el.textContent||'').trim()));
    });
  };
  const start=()=>{
    paint(document);
    const panel=document.querySelector('.workspace-panel[data-workspace-panel="statistics"]')||document.body;
    const mo=new MutationObserver(records=>{
      for(const r of records){
        const node=r.target.nodeType===1?r.target:r.target.parentElement;
        if(node)paint(node.closest?.('.sp-results')||panel);
      }
    });
    mo.observe(panel,{subtree:true,childList:true,characterData:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
</script>`;

  const patchedHtml=htmlTxt.replace('</body>',patch+'\n</body>');
  assert(patchedHtml.includes(marker),'PATCH_MARKER_MISSING');

  const settingsBefore=await settings();
  const schedulesBefore=await schedules();
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');

  const metadata={
    main_module:current.main_module,
    compatibility_date:current.compatibility_date,
    compatibility_flags:current.compatibility_flags||[],
    bindings:current.bindings,
    keep_assets:true,
    assets:{config:current.assets?.config},
    annotations:{'workers/tag':'B46_STAT_LIVE_MINUTE_RED_20261107','workers/message':'Statistics live minute red with transparent pill; preserve blink'}
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name==='assets/index.html'?Buffer.from(patchedHtml):Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  candidate=uploaded?.id;
  assert(candidate,'CANDIDATE_ID_MISSING');

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64');
    if(m.name==='assets/index.html'){
      const t=got.toString('utf8');
      assert(t.includes(marker),'CANDIDATE_PATCH_MISSING');
      assert(t.includes("animation:b46-live-minute-mark-blink 1s step-end infinite")||t.includes("b46gn-minute-red-tick-20261019 1s step-end infinite"),'EXISTING_BLINK_ANIMATION_NOT_FOUND');
      assert(t.includes('WIN'),'WIN_RENDERING_CONTEXT_MISSING');
    }else{
      assert.equal(got.toString('base64'),m.content_base64,`UNRELATED_MODULE_CHANGED:${m.name}`);
    }
  }

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Statistics live minute red/transparent; preserve blink');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const final=await version(candidate);
  const finalHtml=final.modules.find(m=>m.name==='assets/index.html');
  const finalTxt=Buffer.from(finalHtml.content_base64,'base64').toString('utf8');
  assert(finalTxt.includes(marker),'ACTIVE_PATCH_MISSING');
  assert(finalTxt.includes("animation:b46-live-minute-mark-blink 1s step-end infinite")||finalTxt.includes("b46gn-minute-red-tick-20261019 1s step-end infinite"),'ACTIVE_BLINK_ANIMATION_LOST');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  let visible=false;
  for(let i=0;i<20;i++){
    const r=await fetch('https://ball46.com/?statMinuteQa='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    const t=await r.text();
    if(r.ok&&t.includes(marker)){visible=true;break}
    await delay(1000);
  }
  assert(visible,'PUBLIC_PATCH_NOT_VISIBLE');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('STAT_LIVE_MINUTE_RED_TRANSPARENT=1');
  console.log('BLINK_PRESERVED=1');
  console.log('B46_STAT_LIVE_MINUTE_RED_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback Statistics live minute style after failed verification');
      for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
