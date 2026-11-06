import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const DIRECT_ORIGIN='https://ball46-production.mccarey-supon.workers.dev';
const BUNDLE_MODULE='member-promo-assets-20261104.txt';
const NEW_IMAGE_PATH='/b46-member-promo-20261104-clean.webp';
const EXPECTED_IMAGE_SHA='0891355727916dd5ffb00a513b9b1eede7b34ec8fea0c24b4ce1c98a6730fb11';
const EXPECTED_IMAGE_BYTES=259750;
const EXPECTED_B64_LENGTH=346336;
const PART_PREFIX='promo.webp.b64.part';
const MARK='B46_MEMBER_PROMO_CLEAN_20261106';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
let base=null,candidate=null,activated=false;

function loadImage(){
  const names=readdirSync('assets').filter(n=>n.startsWith(PART_PREFIX)).sort();
  const expected=Array.from({length:10},(_,i)=>PART_PREFIX+String(i).padStart(2,'0'));
  assert.deepEqual(names,expected,'IMAGE_PART_SET_BAD');
  const b64=names.map(n=>readFileSync('assets/'+n,'utf8').trim()).join('');
  assert.equal(b64.length,EXPECTED_B64_LENGTH,'IMAGE_BASE64_LENGTH_BAD');
  const image=Buffer.from(b64,'base64');
  assert.equal(image.length,EXPECTED_IMAGE_BYTES,'IMAGE_BYTES_BAD');
  assert.equal(image.toString('base64'),b64,'IMAGE_BASE64_ROUNDTRIP_BAD');
  assert.equal(sha(image),EXPECTED_IMAGE_SHA,'IMAGE_SHA_BAD');
  assert.equal(image.subarray(0,4).toString('ascii'),'RIFF','IMAGE_NOT_RIFF');
  assert.equal(image.subarray(8,12).toString('ascii'),'WEBP','IMAGE_NOT_WEBP');
  return image;
}
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
  if(m.name.endsWith('.bin'))return 'application/octet-stream';
  return 'application/octet-stream';
}
async function publicBytes(origin,path){
  const u=new URL(path,origin);
  u.searchParams.set('promoCleanQa',Date.now().toString());
  const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(r.ok,`PUBLIC_HTTP:${origin}:${r.status}`);
  return {bytes:Buffer.from(await r.arrayBuffer()),type:String(r.headers.get('content-type')||'').toLowerCase()};
}
async function publicHtml(origin){
  const u=new URL('/',origin);
  u.searchParams.set('promoCleanHtmlQa',Date.now().toString());
  const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(r.ok,`PUBLIC_HTML_HTTP:${origin}:${r.status}`);
  return r.text();
}

try{
  const image=loadImage(); // MUST pass before any Cloudflare mutation.
  base=await active();
  const current=await version(base);
  assert(current.main_module&&Array.isArray(current.modules)&&current.modules.length,'ACTIVE_MODULES_MISSING');
  const bundleMod=current.modules.find(m=>m.name===BUNDLE_MODULE);
  assert(bundleMod,'CURRENT_PROMO_BUNDLE_MISSING');

  const oldBundleBytes=Buffer.from(bundleMod.content_base64,'base64');
  const bundle=JSON.parse(oldBundleBytes.toString('utf8'));
  assert(Array.isArray(bundle.assets),'PROMO_BUNDLE_ASSETS_MISSING');
  assert(typeof bundle.head==='string','PROMO_HEAD_MISSING');

  const candidates=bundle.assets.filter(a=>a&&typeof a.path==='string'&&/^\/b46-member-promo-20261104(?:-clean)?\.(?:jpe?g|webp)$/i.test(a.path));
  assert.equal(candidates.length,1,'PROMO_IMAGE_ASSET_COUNT_BAD');
  const imageAsset=candidates[0];
  assert(typeof imageAsset.base64==='string'&&imageAsset.base64.length>1000,'OLD_IMAGE_BASE64_MISSING');
  const oldImage=Buffer.from(imageAsset.base64,'base64');
  assert.equal(Number(imageAsset.bytes),oldImage.length,'OLD_IMAGE_BYTES_METADATA_BAD');
  assert.equal(String(imageAsset.sha),sha(oldImage),'OLD_IMAGE_SHA_METADATA_BAD');
  assert.notEqual(sha(oldImage),EXPECTED_IMAGE_SHA,'IMAGE_ALREADY_ACTIVE');

  const oldPath=imageAsset.path;
  const oldVersion=String(imageAsset.version??'');
  assert(oldVersion,'OLD_IMAGE_VERSION_MISSING');
  const oldRef=oldPath+'?v='+oldVersion;
  assert.equal(bundle.head.split(oldRef).length-1,1,'PROMO_HEAD_OLD_REF_COUNT_BAD');

  const parsedVersion=Number(oldVersion);
  const newVersion=Number.isFinite(parsedVersion)?String(parsedVersion+1):'clean-20261106';
  const newRef=NEW_IMAGE_PATH+'?v='+newVersion;

  const beforeAssets=bundle.assets.map(a=>JSON.stringify(a));
  const oldHead=bundle.head;
  imageAsset.path=NEW_IMAGE_PATH;
  imageAsset.type='image/webp';
  imageAsset.base64=image.toString('base64');
  imageAsset.version=newVersion;
  imageAsset.sha=EXPECTED_IMAGE_SHA;
  imageAsset.bytes=image.length;
  bundle.head=bundle.head.replace(oldRef,newRef);

  assert.equal(bundle.head.split(newRef).length-1,1,'PROMO_HEAD_NEW_REF_COUNT_BAD');
  assert.equal(bundle.head.includes(oldRef),false,'PROMO_HEAD_OLD_REF_REMAINS');
  assert.notEqual(bundle.head,oldHead,'PROMO_HEAD_NOT_CHANGED');
  const changed=beforeAssets.map((s,i)=>s!==JSON.stringify(bundle.assets[i])?i:null).filter(i=>i!==null);
  assert.deepEqual(changed,[bundle.assets.indexOf(imageAsset)],'UNRELATED_BUNDLE_ASSET_CHANGED');

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
    annotations:{'workers/tag':MARK,'workers/message':'Replace BALL46 Member promo image only - clean WebP'}
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name===BUNDLE_MODULE?patchedBundle:Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  assert(uploaded?.id,'CANDIDATE_ID_MISSING');
  candidate=uploaded.id;

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);
    assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64');
    if(m.name===BUNDLE_MODULE)assert.equal(sha(got),sha(patchedBundle),'PROMO_BUNDLE_HASH_BAD');
    else assert.equal(sha(got),sha(Buffer.from(m.content_base64,'base64')),`UNRELATED_MODULE_CHANGED:${m.name}`);
  }
  const cb=JSON.parse(Buffer.from(cv.modules.find(m=>m.name===BUNDLE_MODULE).content_base64,'base64').toString('utf8'));
  const ca=cb.assets.find(a=>a?.path===NEW_IMAGE_PATH);
  assert(ca,'CANDIDATE_IMAGE_ASSET_MISSING');
  assert.equal(ca.type,'image/webp','CANDIDATE_IMAGE_TYPE_BAD');
  assert.equal(ca.sha,EXPECTED_IMAGE_SHA,'CANDIDATE_IMAGE_SHA_BAD');
  assert.equal(Number(ca.bytes),EXPECTED_IMAGE_BYTES,'CANDIDATE_IMAGE_BYTES_BAD');
  assert(cb.head.includes(newRef),'CANDIDATE_HEAD_REF_MISSING');

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Replace BALL46 Member promo image only - clean WebP 2026-11-06');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  // Verify authoritative active module first.
  const av=await version(candidate);
  const ab=JSON.parse(Buffer.from(av.modules.find(m=>m.name===BUNDLE_MODULE).content_base64,'base64').toString('utf8'));
  const aa=ab.assets.find(a=>a?.path===NEW_IMAGE_PATH);
  assert(aa,'ACTIVE_IMAGE_ASSET_MISSING');
  assert.equal(aa.sha,EXPECTED_IMAGE_SHA,'ACTIVE_IMAGE_SHA_BAD');
  assert(ab.head.includes(newRef),'ACTIVE_HEAD_REF_MISSING');

  // Verify direct Worker and custom-domain public bytes.
  for(const origin of [DIRECT_ORIGIN,ORIGIN]){
    let got=null;
    for(let i=0;i<8;i++){
      try{
        got=await publicBytes(origin,newRef);
        if(sha(got.bytes)===EXPECTED_IMAGE_SHA)break;
      }catch{}
      await delay(1000);
    }
    assert(got,`PUBLIC_IMAGE_MISSING:${origin}`);
    assert(got.type.includes('image/webp'),`PUBLIC_IMAGE_TYPE_BAD:${origin}:${got.type}`);
    assert.equal(got.bytes.length,EXPECTED_IMAGE_BYTES,`PUBLIC_IMAGE_BYTES_BAD:${origin}`);
    assert.equal(sha(got.bytes),EXPECTED_IMAGE_SHA,`PUBLIC_IMAGE_SHA_BAD:${origin}`);
    const html=await publicHtml(origin);
    assert(html.includes(newRef),`PUBLIC_HTML_NEW_REF_MISSING:${origin}`);
  }

  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('OLD_IMAGE_PATH='+oldPath);
  console.log('OLD_IMAGE_SHA='+sha(oldImage));
  console.log('NEW_IMAGE_PATH='+NEW_IMAGE_PATH);
  console.log('NEW_IMAGE_SHA='+EXPECTED_IMAGE_SHA);
  console.log('NEW_IMAGE_BYTES='+EXPECTED_IMAGE_BYTES);
  console.log('BUNDLE_MODULE='+BUNDLE_MODULE);
  console.log('BALL46_MEMBER_PROMO_CLEAN_REPLACE_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback BALL46 Member promo clean image after failed verification');
      for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
