import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const IMAGE_MODULE='b46-member-promo-20261103a.bin';
const PUBLIC_IMAGE='/ball46-member-promo-20261103a.jpg';
const NEW_IMAGE='assets/ball46-member-promo-20261106.jpg';
const MARK='B46_MEMBER_PROMO_IMAGE_20261106';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
let base=null,candidate=null,activated=false;

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json(); assert(r.ok&&j.success===true,`CF_ERROR ${r.status} ${JSON.stringify(j.errors||j)}`); return j.result;
}
async function active(){
  const d=await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_NOT_SINGLE_VERSION');
  return v[0].version_id;
}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function activate(id,msg){
  await api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
async function settings(){return api(`/scripts/${SCRIPT}/settings`)}
async function schedules(){return api(`/scripts/${SCRIPT}/schedules`)}
function typeFor(m,main){
  if(m.content_type)return m.content_type;
  if(m.name===main||/\.m?js$/.test(m.name))return 'application/javascript+module';
  if(m.name.endsWith('.html'))return 'text/html';
  if(m.name.endsWith('.css'))return 'text/css';
  if(m.name.endsWith('.bin'))return 'application/octet-stream';
  return 'application/octet-stream';
}
async function publicImage(){
  const u=new URL(PUBLIC_IMAGE,ORIGIN);u.searchParams.set('promoImageQa',Date.now());
  const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(r.ok,`PUBLIC_IMAGE_HTTP_${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

try{
  const image=readFileSync(NEW_IMAGE);
  assert(image.length>20000,'NEW_IMAGE_TOO_SMALL');
  assert(image[0]===0xff&&image[1]===0xd8,'NEW_IMAGE_NOT_JPEG');
  const imageSha=sha(image);

  base=await active();
  const current=await version(base);
  const old=current.modules.find(m=>m.name===IMAGE_MODULE);
  assert(old,'MEMBER_PROMO_IMAGE_MODULE_MISSING');
  const oldBytes=Buffer.from(old.content_base64,'base64');
  assert.notEqual(sha(oldBytes),imageSha,'NEW_IMAGE_EQUALS_OLD_IMAGE');

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
    annotations:{'workers/tag':MARK,'workers/message':'Replace BALL46 member promo image only'}
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name===IMAGE_MODULE?image:Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  assert(uploaded?.id,'CANDIDATE_ID_MISSING');candidate=uploaded.id;

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64');
    if(m.name===IMAGE_MODULE)assert.equal(sha(got),imageSha,'NEW_IMAGE_MODULE_HASH_BAD');
    else assert.equal(sha(got),sha(Buffer.from(m.content_base64,'base64')),`UNRELATED_MODULE_CHANGED:${m.name}`);
  }

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Replace BALL46 member promo image 2026-11-06');
  activated=true;
  for(let i=0;i<20;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  let served=null;
  for(let i=0;i<8;i++){
    served=await publicImage();
    if(sha(served)===imageSha)break;
    await delay(1200);
  }
  assert.equal(sha(served),imageSha,'PUBLIC_IMAGE_HASH_MISMATCH');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('OLD_IMAGE_SHA='+sha(oldBytes));
  console.log('NEW_IMAGE_SHA='+imageSha);
  console.log('PUBLIC_IMAGE_BYTES='+served.length);
  console.log('BALL46_MEMBER_PROMO_IMAGE_REPLACE_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback member promo image after failed verification');
      for(let i=0;i<20;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
