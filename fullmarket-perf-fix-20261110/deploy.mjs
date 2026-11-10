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

const sourceInspect="function inspectFixture(f){const books=extractBooks(f),byBook=new Map();for(const b of books)byBook.set(b.slug,b.data?collectMarkets(b.data):new Map());return{books,byBook,found:books.filter(b=>b.found).map(b=>b.slug),markets:[...new Set([...byBook.values()].flatMap(m=>[...m.keys()]))]}}";
const sourceRender="function renderBookHtml(f,slug='bet365'){const info=inspectFixture(f),";
const sourceCall="panel.innerHTML=renderBookHtml(fixture,active);";
const perfMarker='B46_FULLMARKET_INSPECT_CACHE_20261110';

const sourceInspectPatched=`const inspectFixtureCache=new WeakMap();/* ${perfMarker} */
function inspectFixture(f){
  if(f&&typeof f==='object'){const cached=inspectFixtureCache.get(f);if(cached)return cached}
  const books=extractBooks(f),byBook=new Map();
  for(const b of books)byBook.set(b.slug,b.data?collectMarkets(b.data):new Map());
  const out={books,byBook,found:books.filter(b=>b.found).map(b=>b.slug),markets:[...new Set([...byBook.values()].flatMap(m=>[...m.keys()]))]};
  if(f&&typeof f==='object')inspectFixtureCache.set(f,out);
  return out
}`;

async function probePublic(expectPatched=false){
  const attempts=expectPatched?30:1;
  let last='';
  for(let i=0;i<attempts;i++){
    const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?perfqa='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    const t=await r.text(); last=t;
    assert(r.ok,'PUBLIC_FULLMARKET_HTTP_'+r.status);
    if(expectPatched){
      const ok=t.includes(perfMarker)
        &&t.includes("function renderBookHtml(f,slug='bet365',prepared=null){const info=prepared||inspectFixture(f),")
        &&t.includes('panel.innerHTML=renderBookHtml(fixture,active,info);')
        &&t.includes("if(!host)return")
        &&t.includes("networkMode:'NONE'");
      if(ok)return t;
      if(i<attempts-1)await delay(1000);
    }else{
      assert(t.includes(sourceInspect),'PUBLIC_INSPECT_PATTERN_DRIFT');
      assert(t.includes(sourceRender),'PUBLIC_RENDER_PATTERN_DRIFT');
      assert(t.includes(sourceCall),'PUBLIC_RENDER_CALL_PATTERN_DRIFT');
      assert(!t.includes(perfMarker),'PUBLIC_ALREADY_PATCHED');
      return t;
    }
  }
  assert(last.includes(perfMarker),'PUBLIC_PATCH_MARKER_MISSING_AFTER_RETRIES');
  return last;
}

let base=null,candidate=null,activated=false;
try{
  await probePublic(false);

  base=await active();
  const current=await version(base);
  const settingsBefore=await settings();
  const schedulesBefore=await schedules();

  const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');
  assert(main,'MAIN_MODULE_MISSING');
  const src=Buffer.from(main.content_base64,'base64').toString('utf8');

  const routeAnchor="if (request.method === \"GET\" && url.pathname === \"/full-market-bookmaker-343.js\") return __b46BetssonBookmakerAsset(request, env);";
  const fnAnchor="async function __b46BetssonBookmakerAsset(request,env){";
  const injectAnchor="  addMap('BOOK_LOGO_URLS',__B46_BETSSON_LOGO__);";
  assert(src.includes(routeAnchor),'FULLMARKET_ROUTE_ANCHOR_MISSING');
  assert(src.includes(fnAnchor),'FULLMARKET_ASSET_FUNCTION_MISSING');
  assert(src.includes(injectAnchor),'FULLMARKET_TRANSFORM_ANCHOR_MISSING');
  assert(!src.includes(perfMarker),'PATCH_ALREADY_PRESENT');

  const injection=`
  /* ${perfMarker}: browser-side Full Market performance patch.
     Preserve all data, bookmaker tabs and network behavior; remove duplicate market parsing only. */
  if(!source.includes(${JSON.stringify(sourceInspect)}))throw new Error('B46_FULLMARKET_INSPECT_PATTERN_DRIFT');
  if(!source.includes(${JSON.stringify(sourceRender)}))throw new Error('B46_FULLMARKET_RENDER_PATTERN_DRIFT');
  if(!source.includes(${JSON.stringify(sourceCall)}))throw new Error('B46_FULLMARKET_RENDER_CALL_PATTERN_DRIFT');
  source=source.replace(${JSON.stringify(sourceInspect)},${JSON.stringify(sourceInspectPatched)});
  source=source.replace(${JSON.stringify(sourceRender)},${JSON.stringify("function renderBookHtml(f,slug='bet365',prepared=null){const info=prepared||inspectFixture(f),")});
  source=source.replace(${JSON.stringify(sourceCall)},${JSON.stringify("panel.innerHTML=renderBookHtml(fixture,active,info);")});
  if(!source.includes(${JSON.stringify(perfMarker)}))throw new Error('B46_FULLMARKET_PERF_PATCH_FAILED');
`;

  const patched=src.replace(injectAnchor,injectAnchor+injection);
  assert(patched.includes(perfMarker),'MAIN_PATCH_MARKER_MISSING');
  assert.equal((patched.match(/B46_FULLMARKET_INSPECT_CACHE_20261110/g)||[]).length>=1,true,'MAIN_MARKER_COUNT_BAD');
  assert(patched.includes(routeAnchor),'ROUTE_CHANGED');
  assert(patched.includes(fnAnchor),'ASSET_FUNCTION_CHANGED');

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');

  const metadata={
    main_module:current.main_module,
    compatibility_date:current.compatibility_date,
    compatibility_flags:current.compatibility_flags||[],
    bindings:current.bindings,
    keep_assets:true,
    assets:{config:current.assets?.config},
    annotations:{'workers/tag':'B46_FULLMARKET_PERF_20261110','workers/message':'Full Market performance: reuse parsed fixture markets; avoid duplicate inspect pass'}
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name===main.name?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }

  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  candidate=uploaded?.id;assert(candidate,'CANDIDATE_ID_MISSING');console.log('CANDIDATE_VERSION='+candidate);

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');

  let changed=0;
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,`MODULE_MISSING:${m.name}`);
    const got=Buffer.from(cm.content_base64,'base64').toString('base64');
    if(m.name===main.name){
      const txt=Buffer.from(cm.content_base64,'base64').toString('utf8');
      assert(txt.includes(perfMarker),'CANDIDATE_PATCH_MISSING');
      assert(txt.includes(routeAnchor),'CANDIDATE_ROUTE_MISSING');
      if(got!==m.content_base64)changed++;
    }else{
      assert.equal(got,m.content_base64,`UNRELATED_MODULE_CHANGED:${m.name}`);
    }
  }
  assert.equal(changed,1,'CHANGED_MODULE_COUNT_BAD:'+changed);

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Full Market performance: reuse parsed fixture markets and eliminate duplicate inspect pass');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  await probePublic(true);

  const final=await version(candidate);
  const fm=final.modules.find(m=>m.name===main.name);
  const ft=Buffer.from(fm.content_base64,'base64').toString('utf8');
  assert(ft.includes(perfMarker),'ACTIVE_MAIN_PATCH_MISSING');
  assert(ft.includes(routeAnchor),'ACTIVE_ROUTE_MISSING');
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED');

  console.log('BASE_VERSION='+base);
  console.log('TARGET_MODULE='+main.name);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('CHANGED_MODULES=1');
  console.log('PUBLIC_FULLMARKET_PATCHED=1');
  console.log('INSPECT_CACHE=1');
  console.log('DUPLICATE_INSPECT_REMOVED=1');
  console.log('CLOSED_GUARD_PRESERVED=1');
  console.log('NETWORK_MODE_NONE_PRESERVED=1');
  console.log('B46_FULLMARKET_PERF_SUCCESS');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback Full Market performance patch after failed verification');
      for(let i=0;i<25;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
