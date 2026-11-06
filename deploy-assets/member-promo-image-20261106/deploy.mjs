import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const BUNDLE_MODULE='member-promo-assets-20261104.txt';
const PUBLIC_IMAGE='/b46-member-promo-20261104.jpg';
const OLD_IMAGE_VERSION='1';
const NEW_IMAGE_VERSION='2';
const OLD_IMAGE_REF=PUBLIC_IMAGE+'?v='+OLD_IMAGE_VERSION;
const NEW_IMAGE_REF=PUBLIC_IMAGE+'?v='+NEW_IMAGE_VERSION;
const IMAGE_PART_DIR='assets';
const IMAGE_PART_PREFIX='ball46-member-promo-20261106.b64.part';
const EXPECTED_IMAGE_SHA='af96ad4867d5239be8da13d3089cf8bc7424e9cce8f70a87be9df197b8a2580a';
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
  const j=await r.json();
  assert(r.ok&&j.success===true,`CF_ERROR ${r.status} ${JSON.stringify(j.errors||j)}`);
  return j.result;
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
  if(m.name.endsWith('.txt'))return 'text/plain';
  if(m.name.endsWith('.html'))return 'text/html';
  return 'application/octet-stream';
}
function loadNewImage(){
  const parts=readdirSync(IMAGE_PART_DIR).filter(n=>n.startsWith(IMAGE_PART_PREFIX)).sort();
  assert.deepEqual(parts,[
    IMAGE_PART_PREFIX+'00',IMAGE_PART_PREFIX+'01',IMAGE_PART_PREFIX+'02',
    IMAGE_PART_PREFIX+'03',IMAGE_PART_PREFIX+'04',IMAGE_PART_PREFIX+'05'
  ],'IMAGE_PART_SET_BAD');
  const b64=parts.map(n=>readFileSync(IMAGE_PART_DIR+'/'+n,'utf8').trim()).join('');
  assert.equal(b64.length,50760,'IMAGE_BASE64_LENGTH_BAD');
  const image=Buffer.from(b64,'base64');
  assert.equal(image.length,38070,'NEW_IMAGE_BYTES_BAD');
  assert.equal(image.toString('base64'),b64,'IMAGE_BASE64_CORRUPT');
  assert.equal(sha(image),EXPECTED_IMAGE_SHA,'NEW_IMAGE_SHA_MISMATCH');
  assert(image[0]===0xff&&image[1]===0xd8,'NEW_IMAGE_NOT_JPEG');
  return image;
}
async function publicImage(){
  const u=new URL(PUBLIC_IMAGE,ORIGIN);
  u.searchParams.set('v',NEW_IMAGE_VERSION);
  u.searchParams.set('promoImageQa',Date.now());
  const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(r.ok,`PUBLIC_IMAGE_HTTP_${r.status}`);
  assert(String(r.headers.get('content-type')||'').toLowerCase().includes('image/jpeg'),'PUBLIC_IMAGE_TYPE_BAD');
  return Buffer.from(await r.arrayBuffer());
}

try{
  const image=loadNewImage();
  base=await active();
  const current=await version(base);
  const bundleMod=current.modules.find(m=>m.name===BUNDLE_MODULE);
  assert(bundleMod,'CURRENT_PROMO_BUNDLE_MISSING');

  const oldBundleBytes=Buffer.from(bundleMod.content_base64,'base64');
  const bundle=JSON.parse(oldBundleBytes.toString('utf8'));
  assert(Array.isArray(bundle.assets),'PROMO_BUNDLE_ASSETS_MISSING');
  const imageAsset=bundle.assets.find(a=>a?.path===PUBLIC_IMAGE);
  assert(imageAsset,'PROMO_IMAGE_ASSET_MISSING');
  assert.equal(imageAsset.type,'image/jpeg','PROMO_IMAGE_TYPE_DRIFT');
  assert(typeof imageAsset.base64==='string'&&imageAsset.base64.length>1000,'PROMO_OLD_IMAGE_BASE64_MISSING');
  const oldImage=Buffer.from(imageAsset.base64,'base64');
  assert.equal(Number(imageAsset.bytes),oldImage.length,'PROMO_OLD_IMAGE_BYTES_METADATA_BAD');
  assert.equal(String(imageAsset.sha),sha(oldImage),'PROMO_OLD_IMAGE_SHA_METADATA_BAD');
  assert.notEqual(sha(oldImage),EXPECTED_IMAGE_SHA,'NEW_IMAGE_EQUALS_OLD_IMAGE');

  assert.equal(String(imageAsset.version),OLD_IMAGE_VERSION,'PROMO_IMAGE_VERSION_DRIFT');
  assert(typeof bundle.head==='string','PROMO_HEAD_MISSING');
  assert.equal(bundle.head.split(OLD_IMAGE_REF).length-1,1,'PROMO_HEAD_IMAGE_REF_COUNT_BAD');
  const oldHead=bundle.head;
  const beforeSnapshot=bundle.assets.map(a=>({path:a.path,type:a.type,version:a.version,sha:a.sha,bytes:a.bytes}));
  imageAsset.base64=image.toString('base64');
  imageAsset.version=NEW_IMAGE_VERSION;
  imageAsset.sha=EXPECTED_IMAGE_SHA;
  imageAsset.bytes=image.length;
  bundle.head=bundle.head.replace(OLD_IMAGE_REF,NEW_IMAGE_REF);
  assert(bundle.head.includes(NEW_IMAGE_REF),'PROMO_HEAD_NEW_IMAGE_REF_MISSING');
  assert(!bundle.head.includes(OLD_IMAGE_REF),'PROMO_HEAD_OLD_IMAGE_REF_REMAINS');
  assert.notEqual(bundle.head,oldHead,'PROMO_HEAD_NOT_CHANGED');
  const afterSnapshot=bundle.assets.map(a=>({path:a.path,type:a.type,version:a.version,sha:a.sha,bytes:a.bytes}));
  const changed=beforeSnapshot.map((x,i)=>JSON.stringify(x)!==JSON.stringify(afterSnapshot[i])?afterSnapshot[i].path:null).filter(Boolean);
  assert.deepEqual(changed,[PUBLIC_IMAGE],'ONLY_IMAGE_METADATA_MUST_CHANGE');

  const patchedBundle=Buffer.from(JSON.stringify(bundle));
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
    const bytes=m.name===BUNDLE_MODULE?patchedBundle:Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  assert(uploaded?.id,'CANDIDATE_ID_MISSING'); candidate=uploaded.id;

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64');
    if(m.name===BUNDLE_MODULE)assert.equal(sha(got),sha(patchedBundle),'PROMO_BUNDLE_HASH_BAD');
    else assert.equal(sha(got),sha(Buffer.from(m.content_base64,'base64')),`UNRELATED_MODULE_CHANGED:${m.name}`);
  }

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Replace BALL46 member promo image 2026-11-06');
  activated=true;
  for(let i=0;i<20;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  let served;
  for(let i=0;i<10;i++){
    served=await publicImage();
    if(sha(served)===EXPECTED_IMAGE_SHA)break;
    await delay(1200);
  }
  assert.equal(sha(served),EXPECTED_IMAGE_SHA,'PUBLIC_IMAGE_HASH_MISMATCH');
  assert.equal(served.length,image.length,'PUBLIC_IMAGE_SIZE_MISMATCH');
  const htmlResponse=await fetch(ORIGIN+'/?promoHtmlQa='+Date.now(),{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(htmlResponse.ok,'PUBLIC_HTML_HTTP_'+htmlResponse.status);
  const html=await htmlResponse.text();
  assert(html.includes(NEW_IMAGE_REF),'PUBLIC_HTML_NEW_IMAGE_REF_MISSING');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('OLD_IMAGE_SHA='+sha(oldImage));
  console.log('OLD_IMAGE_BYTES='+oldImage.length);
  console.log('NEW_IMAGE_SHA='+EXPECTED_IMAGE_SHA);
  console.log('NEW_IMAGE_BYTES='+image.length);
  console.log('PUBLIC_IMAGE_BYTES='+served.length);
  console.log('BUNDLE_MODULE='+BUNDLE_MODULE);
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
