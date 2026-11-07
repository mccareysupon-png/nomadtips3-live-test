import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const OLD="BALL46 | Live Betting Tips, Football Scores &amp; Signals";
const NEW="BALL46 | Live Predictions, Football Scores &amp; Signals";
const OLD_GUARD="if(!h.includes('Live Betting Tips'))throw Error";
const NEW_GUARD="if(!h.includes('Live Predictions'))throw Error";
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
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
  assert(current.main_module&&Array.isArray(current.modules),'ACTIVE_MODULES_MISSING');
  const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');
  assert(main,'INDEX_MODULE_MISSING');
  const txt=Buffer.from(main.content_base64,'base64').toString('utf8');
  assert.equal(txt.split(OLD).length-1,1,'OLD_TITLE_COUNT_NOT_ONE');
  assert.equal(txt.split(OLD_GUARD).length-1,1,'OLD_GUARD_COUNT_NOT_ONE');
  assert.equal(txt.includes(NEW),false,'NEW_TITLE_ALREADY_PRESENT');
  assert.equal(txt.includes(NEW_GUARD),false,'NEW_GUARD_ALREADY_PRESENT');
  const patched=txt.replace(OLD,NEW).replace(OLD_GUARD,NEW_GUARD);
  assert.equal(patched.split(NEW).length-1,1,'NEW_TITLE_COUNT_NOT_ONE');
  assert.equal(patched.split(NEW_GUARD).length-1,1,'NEW_GUARD_COUNT_NOT_ONE');
  assert.equal(patched.includes(OLD),false,'OLD_TITLE_REMAINS');
  assert.equal(patched.includes(OLD_GUARD),false,'OLD_GUARD_REMAINS');

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
    annotations:{'workers/tag':'B46_TITLE_LIVE_PREDICTIONS_20261107','workers/message':'Change BALL46 browser title to Live Predictions only'}
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name===main.name?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  candidate=uploaded?.id;
  assert(candidate,'CANDIDATE_ID_MISSING');

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name); assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64');
    if(m.name===main.name){
      const t=got.toString('utf8');
      assert(t.includes(NEW),'CANDIDATE_NEW_TITLE_MISSING');
      assert(t.includes(NEW_GUARD),'CANDIDATE_NEW_GUARD_MISSING');
      assert(!t.includes(OLD),'CANDIDATE_OLD_TITLE_REMAINS');
      assert(!t.includes(OLD_GUARD),'CANDIDATE_OLD_GUARD_REMAINS');
    } else {
      assert.equal(got.toString('base64'),m.content_base64,`UNRELATED_MODULE_CHANGED:${m.name}`);
    }
  }
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'BALL46 title: Live Predictions, Football Scores & Signals');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const final=await version(candidate);
  const finalMain=final.modules.find(m=>m.name===main.name);
  const finalTxt=Buffer.from(finalMain.content_base64,'base64').toString('utf8');
  assert(finalTxt.includes(NEW),'ACTIVE_NEW_TITLE_MISSING');
  assert(finalTxt.includes(NEW_GUARD),'ACTIVE_NEW_GUARD_MISSING');
  assert(!finalTxt.includes(OLD),'ACTIVE_OLD_TITLE_REMAINS');
  assert(!finalTxt.includes(OLD_GUARD),'ACTIVE_OLD_GUARD_REMAINS');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  const r=await fetch('https://ball46.com/?titleQa='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(r.ok,'PUBLIC_HTTP_'+r.status);
  const html=await r.text();
  assert(html.includes('BALL46 | Live Predictions, Football Scores &amp; Signals'),'PUBLIC_TITLE_NOT_UPDATED');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('OLD_TITLE='+OLD);
  console.log('NEW_TITLE='+NEW);
  console.log('BALL46_TITLE_LIVE_PREDICTIONS_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback BALL46 title change after failed verification');
      for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
