import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);return j.result;
}
async function active(){const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');return v[0].version_id}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function settings(){return api(`/scripts/${SCRIPT}/settings`)}
async function schedules(){return api(`/scripts/${SCRIPT}/schedules`)}
async function activate(id,msg){return api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
function typeFor(m,main){if(m.content_type)return m.content_type;if(m.name===main||/\.m?js$/.test(m.name))return 'application/javascript+module';if(m.name.endsWith('.html'))return 'text/html';if(m.name.endsWith('.css'))return 'text/css';return 'application/octet-stream'}

const MARK='B46_FULLMARKET_LAZY_ONDEMAND_20261110';
const oldUpdate="function update(expanded,fixture){if(!expanded||!fixture)return;const host=expanded.querySelector('[data-full-market-card]');if(!host)return;expanded._nomadFixture=fixture;const id=fixtureId(fixture),info=inspectFixture(fixture),saved=state.get(id)||{},active=info.books.some(b=>b.slug===saved.active)?saved.active:'bet365',shellSig=info.books.map(b=>`${b.slug}:${b.found?1:0}`).join('|');if(host.dataset.shellSig!==shellSig){const oldScroll=host.querySelector('[data-fmb-tabs]')?.scrollLeft||0;host.innerHTML=shellHtml(info,active);const tabs=host.querySelector('[data-fmb-tabs]');if(tabs)tabs.scrollLeft=oldScroll;host.dataset.shellSig=shellSig;host.dataset.panelSig=''}host.querySelectorAll('[data-fmb-book]').forEach(btn=>{const on=btn.dataset.fmbBook===active;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false')});const book=info.books.find(b=>b.slug===active),bookMap=info.byBook.get(active),panelSig=stableString({active,data:book?.data||null,markets:bookMap?[...bookMap.keys()]:[]});if(host.dataset.panelSig!==panelSig){const panel=host.querySelector('[data-fmb-panel]');if(panel)panel.innerHTML=renderBookHtml(fixture,active,info);host.dataset.panelSig=panelSig}state.set(id,{...saved,active})}";
const newUpdate="function update(expanded,fixture){if(!expanded||!fixture)return;const host=expanded.querySelector('[data-full-market-card]');if(!host)return;expanded._nomadFixture=fixture;const id=fixtureId(fixture),info=inspectFixture(fixture),saved=state.get(id)||{},active=info.books.some(b=>b.slug===saved.active)?saved.active:'',shellSig=info.books.map(b=>`${b.slug}:${b.found?1:0}`).join('|');if(host.dataset.shellSig!==shellSig){const oldScroll=host.querySelector('[data-fmb-tabs]')?.scrollLeft||0;host.innerHTML=shellHtml(info,active);const tabs=host.querySelector('[data-fmb-tabs]');if(tabs)tabs.scrollLeft=oldScroll;host.dataset.shellSig=shellSig;host.dataset.panelSig=''}host.querySelectorAll('[data-fmb-book]').forEach(btn=>{const on=btn.dataset.fmbBook===active;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',on?'true':'false')});const panel=host.querySelector('[data-fmb-panel]');if(!active){const panelSig='__collapsed__';if(host.dataset.panelSig!==panelSig){if(panel)panel.innerHTML='<div class=\"fmb-empty\">Select a bookmaker to view prices.</div>';host.dataset.panelSig=panelSig}state.set(id,{...saved,active:''});return}const book=info.books.find(b=>b.slug===active),bookMap=info.byBook.get(active),panelSig=stableString({active,data:book?.data||null,markets:bookMap?[...bookMap.keys()]:[]});if(host.dataset.panelSig!==panelSig){if(panel)panel.innerHTML=renderBookHtml(fixture,active,info);host.dataset.panelSig=panelSig}state.set(id,{...saved,active})}";
const oldChoose="function chooseBook(button){const expanded=button.closest('.match-expanded'),fixture=expanded?._nomadFixture;if(!expanded||!fixture)return;const id=fixtureId(fixture),slug=String(button.dataset.fmbBook||'bet365');state.set(id,{...(state.get(id)||{}),active:slug});const host=expanded.querySelector('[data-full-market-card]');if(host)host.dataset.panelSig='';update(expanded,fixture)}";
const newChoose="function chooseBook(button){const expanded=button.closest('.match-expanded'),fixture=expanded?._nomadFixture;if(!expanded||!fixture)return;const id=fixtureId(fixture),saved=state.get(id)||{},clicked=String(button.dataset.fmbBook||''),slug=saved.active===clicked?'':clicked;state.set(id,{...saved,active:slug});const host=expanded.querySelector('[data-full-market-card]');if(host)host.dataset.panelSig='';update(expanded,fixture)}";

async function publicSource(expectLazy){
 const attempts=expectLazy?30:1;let last='';
 for(let i=0;i<attempts;i++){
  const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?lazyqa='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
  const t=await r.text();last=t;assert(r.ok,'PUBLIC_HTTP_'+r.status);
  if(expectLazy){
   if(t.includes(MARK)&&t.includes("active=info.books.some(b=>b.slug===saved.active)?saved.active:''")&&t.includes("panelSig='__collapsed__'")&&t.includes("saved.active===clicked?'':clicked")&&t.includes("networkMode:'NONE'"))return t;
   if(i<attempts-1)await delay(1000);
  }else{
   assert(t.includes(oldUpdate),'PUBLIC_UPDATE_DRIFT');assert(t.includes(oldChoose),'PUBLIC_CHOOSE_DRIFT');assert(!t.includes(MARK),'PUBLIC_ALREADY_LAZY');
   assert(t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'PERF_PATCH_MISSING');assert(t.includes("networkMode:'NONE'"),'NETWORK_MODE_CHANGED');return t;
  }
 }
 throw new Error('PUBLIC_LAZY_MARKER_MISSING_AFTER_RETRIES');
}

let base,candidate,activated=false;
try{
 await publicSource(false);
 base=await active();const current=await version(base),settingsBefore=await settings(),schedulesBefore=await schedules();
 const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');assert(main,'MAIN_MISSING');
 const src=Buffer.from(main.content_base64,'base64').toString('utf8');
 assert(!src.includes(MARK),'MAIN_ALREADY_LAZY');
 const fnStart=src.indexOf('async function __b46BetssonBookmakerAsset(request,env){');assert(fnStart>=0,'ASSET_FUNCTION_MISSING');
 const hAnchor="  const h=new Headers(response.headers); h.set('cache-control','no-store, no-cache, must-revalidate, max-age=0'); h.delete('content-length'); h.set('x-ball46-betsson','20261005');";
 const hPos=src.indexOf(hAnchor,fnStart);assert(hPos>fnStart,'ASSET_HEADERS_ANCHOR_MISSING');
 const injection=`  /* ${MARK}: Full Market two-level lazy rendering, no additional network request. */
  if(!source.includes(${JSON.stringify(oldUpdate)}))throw new Error('B46_LAZY_UPDATE_PATTERN_DRIFT');
  if(!source.includes(${JSON.stringify(oldChoose)}))throw new Error('B46_LAZY_CHOOSE_PATTERN_DRIFT');
  source=source.replace(${JSON.stringify(oldUpdate)},${JSON.stringify(newUpdate)});
  source=source.replace(${JSON.stringify(oldChoose)},${JSON.stringify(newChoose)});
  source='/* ${MARK} */\\n'+source;
`;
 const patched=src.slice(0,hPos)+injection+src.slice(hPos);
 assert(patched.includes(MARK),'MAIN_MARKER_MISSING');

 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');
 const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':'B46_FULLMARKET_LAZY_20261110','workers/message':'Full Market lazy on-demand bookmaker price rendering'}};
 if(current.placement)metadata.placement=current.placement;
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
 for(const m of current.modules){const bytes=m.name===main.name?Buffer.from(patched):Buffer.from(m.content_base64,'base64');form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name)}
 const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});candidate=uploaded?.id;assert(candidate,'CANDIDATE_MISSING');console.log('CANDIDATE_VERSION='+candidate);
 const cv=await version(candidate);assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
 let changed=0;
 for(const m of current.modules){const cm=cv.modules.find(x=>x.name===m.name);assert(cm,'MODULE_MISSING:'+m.name);const got=cm.content_base64;if(m.name===main.name){if(got!==m.content_base64)changed++;assert(Buffer.from(got,'base64').toString('utf8').includes(MARK),'CANDIDATE_MARKER_MISSING')}else assert.equal(got,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name)}
 assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');
 await activate(candidate,'Full Market lazy on-demand bookmaker price rendering');activated=true;
 for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
 await publicSource(true);
 assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');
 console.log('BASE_VERSION='+base);console.log('FINAL_PRODUCTION='+candidate);console.log('CHANGED_MODULES=1');console.log('LAZY_DEFAULT_COLLAPSED=1');console.log('CLICK_TO_RENDER=1');console.log('CLICK_SAME_TO_COLLAPSE=1');console.log('NETWORK_MODE_NONE_PRESERVED=1');console.log('PERF_PATCH_PRESERVED=1');console.log('B46_FULLMARKET_LAZY_SUCCESS');
}catch(e){
 console.error(e.stack||e);
 try{if(activated&&base&&candidate&&await active()===candidate){await activate(base,'Rollback Full Market lazy patch after failed verification');for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');console.log('ROLLBACK_CONFIRMED='+base)}}catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
 process.exit(1);
}
