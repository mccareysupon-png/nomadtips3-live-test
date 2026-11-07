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
  const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');
  assert(main,'INDEX_MODULE_MISSING');
  const txt=Buffer.from(main.content_base64,'base64').toString('utf8');
  const oldNeedle='return \`<a class="fmb-affiliate-odds" data-b46-affiliate-odds="\${esc(slug)}" href="\${esc(url)}" target="_blank" rel="sponsored noopener noreferrer" title="\${esc(label)} affiliate link · 18+ · Gamble responsibly">\${esc(text)}</a>\`';
  const newNeedle='return esc(text)';
  assert(txt.includes('function affiliatePriceHtml'),'AFFILIATE_RENDERER_MISSING');
  assert(txt.includes(oldNeedle),'AFFILIATE_ANCHOR_RENDER_NOT_FOUND');
  const patched=txt.replace(oldNeedle,newNeedle);
  assert(!patched.includes(oldNeedle),'AFFILIATE_ANCHOR_RENDER_REMAINS');
  assert(patched.includes('function affiliatePriceHtml'),'AFFILIATE_RENDERER_LOST');

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
    annotations:{'workers/tag':'B46_REMOVE_ODDS_AFFILIATE_LINKS_20261107','workers/message':'Remove affiliate href wrappers from Full Market odds only'}
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
      assert(t.includes(newNeedle),'CANDIDATE_PLAIN_PRICE_RENDER_MISSING');
      assert(!t.includes(oldNeedle),'CANDIDATE_LINK_RENDER_REMAINS');
    } else {
      assert.equal(got.toString('base64'),m.content_base64,`UNRELATED_MODULE_CHANGED:${m.name}`);
    }
  }
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Remove affiliate links from Full Market odds values');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const final=await version(candidate);
  const finalMain=final.modules.find(m=>m.name===main.name);
  const finalTxt=Buffer.from(finalMain.content_base64,'base64').toString('utf8');
  assert(finalTxt.includes(newNeedle),'ACTIVE_PLAIN_PRICE_RENDER_MISSING');
  assert(!finalTxt.includes(oldNeedle),'ACTIVE_LINK_RENDER_REMAINS');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  async function waitPublic(){
    let last='';
    for(let i=0;i<20;i++){
      const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?v=remove-links-'+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
      last=await r.text();
      if(r.ok && last.includes('function affiliatePriceHtml') && !last.includes('class="fmb-affiliate-odds"')) return true;
      await delay(1000);
    }
    throw new Error('PUBLIC_FULL_MARKET_JS_STILL_HAS_AFFILIATE_ANCHOR');
  }
  await waitPublic();

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('REMOVED_ODDS_LINK_WRAPPER=1');
  console.log('B46_REMOVE_ODDS_AFFILIATE_LINKS_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback Full Market odds affiliate-link removal after failed verification');
      for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
