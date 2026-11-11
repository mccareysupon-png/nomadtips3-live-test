import assert from 'node:assert/strict';

const SCRIPT='ball46-production';
const EXPECT_CURRENT='6b214905-1dd8-4fe8-ad05-e65306e6a891';
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

const TARGET="const head=host.querySelector('.fmb-head');if(head){head.textContent='Select a bookmaker to view the latest odds.';head.style.fontFamily='Segoe UI Variable, Segoe UI, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';head.style.fontSize='90%';head.style.fontWeight='700';head.style.letterSpacing='.12px';head.style.lineHeight='1.2';head.style.textShadow='0 1px 0 rgba(255,255,255,.035),0 2px 8px rgba(0,0,0,.28)'};";
const REPLACEMENT="/* B46_FULLMARKET_DARK10_YELLOW_DOT_20261111 */const head=host.querySelector('.fmb-head');if(head){if(head.dataset.b46Dark10YellowDot!=='1'){head.innerHTML='<span data-b46-fmb-shade aria-hidden=true></span><span data-b46-fmb-dot aria-hidden=true></span><span data-b46-fmb-copy>Select a bookmaker to view the latest odds.</span>';head.dataset.b46Dark10YellowDot='1';head.style.position='relative';head.style.isolation='isolate';head.style.display='flex';head.style.alignItems='center';head.style.gap='7px';head.style.whiteSpace='normal';head.style.fontFamily='Segoe UI Variable, Segoe UI, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';head.style.fontSize='90%';head.style.fontWeight='700';head.style.letterSpacing='.12px';head.style.lineHeight='1.2';head.style.textShadow='0 1px 0 rgba(255,255,255,.035),0 2px 8px rgba(0,0,0,.28)';const copy=head.querySelector('[data-b46-fmb-copy]');if(copy)copy.style.cssText='position:relative;z-index:1';const dot=head.querySelector('[data-b46-fmb-dot]');if(dot){dot.style.cssText='position:relative;z-index:1;display:inline-block;flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#f6c945;box-shadow:0 0 0 2px rgba(246,201,69,.12),0 0 8px rgba(246,201,69,.42)';if(!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)&&typeof dot.animate==='function')dot.animate([{opacity:1,transform:'scale(1)'},{opacity:.56,transform:'scale(.88)'},{opacity:1,transform:'scale(1)'}],{duration:1200,iterations:Infinity,easing:'ease-in-out'})}}const shade=head.querySelector('[data-b46-fmb-shade]');if(shade){shade.style.cssText='position:absolute;inset:0;z-index:0;border-radius:inherit;pointer-events:none';shade.style.background=document.documentElement.getAttribute('data-theme')==='light'?'transparent':'rgba(0,0,0,.10)'}};";

async function publicCheck(expectNew){
  let last='';
  for(let i=0;i<20;i++){
    const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?dark10-dot='+Date.now()+'-'+i,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)});
    const t=await r.text(); last=t;
    const hasNew=t.includes('B46_FULLMARKET_DARK10_YELLOW_DOT_20261111') &&
      t.includes('data-b46-fmb-dot') &&
      t.includes('background:#f6c945') &&
      t.includes("rgba(0,0,0,.10)") &&
      t.includes("head.style.fontSize='90%'") &&
      t.includes('Select a bookmaker to view the latest odds.');
    if(r.ok && t.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111') &&
      t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110') &&
      (expectNew?hasNew:!hasNew)) return t;
    await delay(1000);
  }
  throw new Error('PUBLIC_DARK10_DOT_CHECK_FAILED expectNew='+expectNew+' lastLen='+last.length);
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

  assert(src.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111'),'COMPACT_PATCH_MISSING');
  assert(src.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'PERF_PATCH_MISSING');
  assert.equal(src.split(TARGET).length-1,1,'TARGET_COUNT_NOT_ONE');
  assert(!src.includes('B46_FULLMARKET_DARK10_YELLOW_DOT_20261111'),'DARK10_DOT_ALREADY_PRESENT');

  const patched=src.replace(TARGET,REPLACEMENT);
  assert.notEqual(patched,src,'NO_PATCH_CHANGE');
  assert.equal(patched.split(REPLACEMENT).length-1,1,'REPLACEMENT_COUNT_NOT_ONE');

  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_UPLOAD');
  const metadata={
    main_module:current.main_module,
    compatibility_date:current.compatibility_date,
    compatibility_flags:current.compatibility_flags||[],
    bindings:current.bindings,
    keep_assets:true,
    assets:{config:current.assets?.config},
    annotations:{
      'workers/tag':'B46_FULLMARKET_DARK10_YELLOW_DOT_20261111',
      'workers/message':'Darken Full Market heading 10 percent and add yellow live-style dot'
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
  candidate=uploaded?.id; assert(candidate,'CANDIDATE_MISSING');

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  let changed=0;
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name); assert(cm,'MODULE_MISSING:'+m.name);
    if(m.name===main.name){
      if(cm.content_base64!==m.content_base64)changed++;
      const t=Buffer.from(cm.content_base64,'base64').toString('utf8');
      assert(t.includes('B46_FULLMARKET_DARK10_YELLOW_DOT_20261111'),'CANDIDATE_MARKER_MISSING');
      assert(t.includes("head.style.fontSize='90%'"),'CANDIDATE_FONT_SIZE_LOST');
      assert(t.includes('Select a bookmaker to view the latest odds.'),'CANDIDATE_COPY_LOST');
      assert(t.includes('B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111'),'CANDIDATE_COMPACT_LOST');
      assert(t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),'CANDIDATE_PERF_LOST');
    }else{
      assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name);
    }
  }
  assert.equal(changed,1,'CHANGED_MODULE_COUNT_'+changed);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');
  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_ACTIVATE');

  await activate(candidate,'Darken Full Market heading 10 percent and add yellow live-style dot');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  await publicCheck(true);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');

  console.log('BASE_ACTIVE='+EXPECT_CURRENT);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('CHANGED_MODULES=1');
  console.log('DARK10=1');
  console.log('YELLOW_LIVE_DOT=1');
  console.log('PREMIUM_FONT_PRESERVED=1');
  console.log('COMPACT_PATCH_PRESERVED=1');
  console.log('PERF_PATCH_PRESERVED=1');
  console.log('DARK10_DOT_DEPLOY_SUCCESS=1');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&candidate&&await active()===candidate){
      await activate(EXPECT_CURRENT,'Rollback dark10 yellow dot after failed verification');
      for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}
      console.log('ROLLBACK_ACTIVE='+(await active()));
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
