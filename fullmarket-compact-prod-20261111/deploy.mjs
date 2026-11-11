import assert from 'node:assert/strict';
import fs from 'node:fs';

const SCRIPT='ball46-production';
const EXPECT_CURRENT='0246cb15-31c3-4cf4-b174-64311afab6a7';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));

async function api(path,options={}){
  const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));
  return j.result;
}
async function active(){
  const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
  return v[0].version_id;
}
async function version(id){return api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}
async function settings(){return api('/scripts/'+SCRIPT+'/settings')}
async function schedules(){return api('/scripts/'+SCRIPT+'/schedules')}
async function activate(id,msg){
  return api('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
function typeFor(m,main){
  if(m.content_type)return m.content_type;
  if(m.name===main||/\.m?js$/.test(m.name))return 'application/javascript+module';
  if(m.name.endsWith('.html'))return 'text/html';
  if(m.name.endsWith('.css'))return 'text/css';
  return 'application/octet-stream';
}

const INSERT_BEFORE="  const h=new Headers(response.headers); h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0'); h.delete('content-length'); h.set('x-ball46-betsson','20261005');";
const PERF_CHECK="  if(!source.includes(\"B46_FULLMARKET_INSPECT_CACHE_20261110\"))throw new Error('B46_FULLMARKET_PERF_PATCH_FAILED');";
const BT=String.fromCharCode(96);
const OLD_UPDATE_A="function update(expanded,fixture){if(!expanded||!fixture)return;const host=expanded.querySelector('[data-full-market-card]');if(!host)return;expanded._nomadFixture=fixture;const id=fixtureId(fixture),info=inspectFixture(fixture),saved=state.get(id)||{},active=info.books.some(b=>b.slug===saved.active)?saved.active:'bet365',shellSig=info.books.map(b=>";
const OLD_UPDATE_B="$"+"{b.slug}:$"+"{b.found?1:0}";
const OLD_UPDATE_C=").join('|');if(host.dataset.shellSig!==shellSig){const oldScroll=host.querySelector('[data-fmb-tabs]')?.scrollLeft||0;host.innerHTML=shellHtml(info,active);const tabs=host.querySelector('[data-fmb-tabs]');if(tabs)tabs.scrollLeft=oldScroll;host.dataset.shellSig=shellSig;host.dataset.panelSig=''}host.querySelectorAll('[data-fmb-book]').forEach(btn=>{const on=btn.dataset.fmbBook===active;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false')});const book=info.books.find(b=>b.slug===active),bookMap=info.byBook.get(active),panelSig=stableString({active,data:book?.data||null,markets:bookMap?[...bookMap.keys()]:[]});if(host.dataset.panelSig!==panelSig){const panel=host.querySelector('[data-fmb-panel]');if(panel)panel.innerHTML=renderBookHtml(fixture,active,info);host.dataset.panelSig=panelSig}state.set(id,{...saved,active})}";
const oldUpdate=OLD_UPDATE_A+BT+OLD_UPDATE_B+BT+OLD_UPDATE_C;

const NEW_UPDATE_A="function update(expanded,fixture){if(!expanded||!fixture)return;const host=expanded.querySelector('[data-full-market-card]');if(!host)return;expanded._nomadFixture=fixture;const id=fixtureId(fixture),info=inspectFixture(fixture),saved=state.get(id)||{},active=info.books.some(b=>b.slug===saved.active)?saved.active:'',shellSig=info.books.map(b=>";
const NEW_UPDATE_B="$"+"{b.slug}:$"+"{b.found?1:0}";
const NEW_UPDATE_C=").join('|');if(host.dataset.shellSig!==shellSig){const oldScroll=host.querySelector('[data-fmb-tabs]')?.scrollLeft||0;host.innerHTML=shellHtml(info,active);const tabs=host.querySelector('[data-fmb-tabs]');if(tabs)tabs.scrollLeft=oldScroll;host.dataset.shellSig=shellSig;host.dataset.panelSig=''}const head=host.querySelector('.fmb-head');if(head)head.textContent='Select a bookmaker to view prices.';host.querySelectorAll('[data-fmb-book]').forEach(btn=>{const on=btn.dataset.fmbBook===active;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false')});const panel=host.querySelector('[data-fmb-panel]');if(!active){if(panel){panel.innerHTML='';panel.hidden=true;panel.style.setProperty('display','none','important')}host.dataset.panelSig='__collapsed__';state.set(id,{...saved,active:''});return}if(panel){panel.hidden=false;panel.style.removeProperty('display')}const book=info.books.find(b=>b.slug===active),bookMap=info.byBook.get(active),panelSig=stableString({active,data:book?.data||null,markets:bookMap?[...bookMap.keys()]:[]});if(host.dataset.panelSig!==panelSig){if(panel)panel.innerHTML=renderBookHtml(fixture,active,info);host.dataset.panelSig=panelSig}state.set(id,{...saved,active})}";
const newUpdate=NEW_UPDATE_A+BT+NEW_UPDATE_B+BT+NEW_UPDATE_C;

const oldChoose="function chooseBook(button){const expanded=button.closest('.match-expanded'),fixture=expanded?._nomadFixture;if(!expanded||!fixture)return;const id=fixtureId(fixture),slug=String(button.dataset.fmbBook||'bet365');state.set(id,{...(state.get(id)||{}),active:slug});const host=expanded.querySelector('[data-full-market-card]');if(host)host.dataset.panelSig='';update(expanded,fixture)}";
const newChoose="function chooseBook(button){const expanded=button.closest('.match-expanded'),fixture=expanded?._nomadFixture;if(!expanded||!fixture)return;const id=fixtureId(fixture),saved=state.get(id)||{},clicked=String(button.dataset.fmbBook||''),slug=saved.active===clicked?'':clicked;state.set(id,{...saved,active:slug});const host=expanded.querySelector('[data-full-market-card]');if(host)host.dataset.panelSig='';update(expanded,fixture)}";

const patchBlock=
"\n  /* B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111: tested compact Full Market UI.\\n"+
"     Instruction moves into the heading; lower panel has no box until a bookmaker is selected.\\n"+
"     Reuses existing bulk snapshot only; no added API request. */\\n"+
"  if(!source.includes("+JSON.stringify(oldUpdate)+"))throw new Error('B46_COMPACT_UPDATE_PATTERN_DRIFT');\\n"+
"  if(!source.includes("+JSON.stringify(oldChoose)+"))throw new Error('B46_COMPACT_CHOOSE_PATTERN_DRIFT');\\n"+
"  source=source.replace("+JSON.stringify(oldUpdate)+","+JSON.stringify(newUpdate)+");\\n"+
"  source=source.replace("+JSON.stringify(oldChoose)+","+JSON.stringify(newChoose)+");\\n"+
"  source='/* B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111 */\\\\n'+source;\\n";

async function publicCheck(expectCompact){
  let last='';
  for(let i=0;i<20;i++){
    const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?compact-prod='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    const t=await r.text(); last=t;
    const compact=t.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111') &&
      t.includes("head.textContent='Select a bookmaker to view prices.'") &&
      t.includes("panel.style.setProperty('display','none','important')") &&
      t.includes("saved.active===clicked?'':clicked") &&
      t.includes("active=info.books.some(b=>b.slug===saved.active)?saved.active:''");
    if(r.ok && t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110') && (expectCompact?compact:!compact)) return t;
    await delay(1000);
  }
  throw new Error('PUBLIC_COMPACT_CHECK_FAILED expectCompact='+expectCompact+' lastLen='+last.length);
}

let candidate='',activated=false;
try{
  assert.equal(await active(),EXPECT_CURRENT,'ACTIVE_VERSION_DRIFT');
  await publicCheck(false);

  const current=await version(EXPECT_CURRENT);
  const settingsBefore=await settings();
  const schedulesBefore=await schedules();
  const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');
  assert(main,'MAIN_MISSING');
  const src=Buffer.from(main.content_base64,'base64').toString('utf8');

  assert(src.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'PERF_PATCH_MISSING');
  assert(!src.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111'),'COMPACT_ALREADY_PRESENT');
  assert(!src.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110'),'OLD_LAZY_PRESENT');
  assert(src.includes(PERF_CHECK),'PERF_INSERT_ANCHOR_MISSING');
  assert(src.includes(INSERT_BEFORE),'HEADER_INSERT_ANCHOR_MISSING');

  const patched=src.replace(INSERT_BEFORE,patchBlock+'\n'+INSERT_BEFORE);
  assert.notEqual(patched,src,'NO_PATCH_CHANGE');
  assert(patched.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111'),'COMPACT_MARKER_NOT_INSERTED');
  assert(patched.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'PERF_PATCH_LOST');

  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_UPLOAD');
  const metadata={
    main_module:current.main_module,
    compatibility_date:current.compatibility_date,
    compatibility_flags:current.compatibility_flags||[],
    bindings:current.bindings,
    keep_assets:true,
    assets:{config:current.assets?.config},
    annotations:{
      'workers/tag':'B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111',
      'workers/message':'Deploy tested compact Full Market UI only'
    }
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name===main.name?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }

  const uploaded=await api('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});
  candidate=uploaded?.id;
  assert(candidate,'CANDIDATE_MISSING');

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  let changed=0;
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);
    assert(cm,'MODULE_MISSING:'+m.name);
    if(m.name===main.name){
      if(cm.content_base64!==m.content_base64)changed++;
      const t=Buffer.from(cm.content_base64,'base64').toString('utf8');
      assert(t.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111'),'CANDIDATE_COMPACT_MARKER_MISSING');
      assert(t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'CANDIDATE_PERF_PATCH_MISSING');
    }else{
      assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name);
    }
  }
  assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');
  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_ACTIVATE');

  fs.writeFileSync('fullmarket-compact-prod-20261111/deploy-state.json',JSON.stringify({base:EXPECT_CURRENT,candidate},null,2));

  await activate(candidate,'Deploy tested compact Full Market UI only');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  await publicCheck(true);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');

  console.log('BASE_ACTIVE='+EXPECT_CURRENT);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('CHANGED_MODULES=1');
  console.log('COMPACT_HEADER=1');
  console.log('EMPTY_PANEL_REMOVED=1');
  console.log('CLICK_ONDEMAND=1');
  console.log('PERF_PATCH_PRESERVED=1');
  console.log('COMPACT_DEPLOY_SUCCESS=1');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&candidate&&await active()===candidate){
      await activate(EXPECT_CURRENT,'Rollback compact Full Market after failed deployment verification');
      for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}
      console.log('ROLLBACK_ACTIVE='+(await active()));
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
