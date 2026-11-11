import assert from 'node:assert/strict';
import fs from 'node:fs';

const SCRIPT='ball46-production';
const EXPECT_CURRENT='c85192bf-be65-49b3-bfbb-8b3fca96b3e3';
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
function one(src,needle,repl,label){
  const n=src.split(needle).length-1;
  assert.equal(n,1,label+'_COUNT_'+n);
  return src.replace(needle,repl);
}
const esc=s=>JSON.stringify(s).slice(1,-1);

const HELPER=String.raw`
/* B46_PIN_V2_FRESH_20261111 — fresh implementation; no legacy Favorites code. */
const B46_PIN_KEY='ball46_pinned_fixtures_v2',B46_PIN_MAX=200;
let b46Pins=new Set(),b46PinFrozen=null;
function b46PinLoad(){try{const x=JSON.parse(localStorage.getItem(B46_PIN_KEY)||'[]');b46Pins=new Set(Array.isArray(x)?x.map(String).filter(Boolean).slice(0,B46_PIN_MAX):[])}catch{b46Pins=new Set()}}
function b46PinSave(){try{localStorage.setItem(B46_PIN_KEY,JSON.stringify([...b46Pins].slice(0,B46_PIN_MAX)))}catch{}}
function b46PinHas(id){return b46Pins.has(String(id||''))}
function b46PinNativeOrder(rows){const out=[];for(const key of ['live','scheduled','unknown','finished']){const all=rows.filter(f=>classify(f)===key);for(const [,list] of groupByLeague(all))out.push(...list)}return out}
function b46PinExpanded(){return !!document.querySelector('.match-expanded[data-expanded-match]')}
function b46PinRenderHas(id){id=String(id||'');if(b46PinExpanded()){if(!b46PinFrozen){b46PinFrozen=new Set([...document.querySelectorAll('.b46-pin-v2-section .match-row[data-match-id]')].map(r=>String(r.dataset.matchId||'')).filter(Boolean))}return b46PinFrozen.has(id)}b46PinFrozen=null;return b46PinHas(id)}
function b46PinPruneKnown(){if(!Array.isArray(fixtures)||!fixtures.length)return;const known=new Set(fixtures.map(fixtureKey).map(String));let changed=false;for(const id of [...b46Pins])if(!known.has(id)){b46Pins.delete(id);changed=true}if(changed)b46PinSave()}
function b46PinSignalBadge(row){const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');if(!host)return;const n=Number(host.getAttribute('data-inline-signal-count'));let badge=host.querySelector(':scope > .b46-league-market-signal-count');if(!Number.isInteger(n)||n<=0){badge?.remove();return}if(!badge){badge=document.createElement('span');badge.className='b46-league-market-signal-count';badge.innerHTML='<i aria-hidden="true"></i><b></b><span></span>';host.append(badge)}const number=String(n),label=n===1?'Signal':'Signals';if(badge.children[1].textContent!==number)badge.children[1].textContent=number;if(badge.children[2].textContent!==label)badge.children[2].textContent=label;badge.setAttribute('aria-label',number+' active '+label.toLowerCase())}
/* B46_PIN_V2_SIGNAL_BADGE_FIX_20261112 */
function b46PinPaint(row){if(!row)return;b46PinSignalBadge(row);const id=String(row.dataset.matchId||'');if(!id)return;const f=fixtures.find(x=>fixtureKey(x)===id);if(f)row.dataset.b46Kind=classify(f);let s=row.querySelector('[data-b46-pin-v2]');if(!s){s=document.createElement('span');s.className='b46-pin-v2-star';s.dataset.b46PinV2=id;s.setAttribute('role','button');s.tabIndex=0;row.appendChild(s)}const on=b46PinHas(id);s.textContent=on?'★':'☆';s.setAttribute('aria-pressed',on?'true':'false');s.setAttribute('aria-label',on?'Unpin match':'Pin match to top');s.setAttribute('role','button');s.tabIndex=0;s.title=on?'Unpin match':'Pin match to top';if(s.dataset.b46PinBound!=='1'){s.dataset.b46PinBound='1';s.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();b46PinToggle(id)});s.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();b46PinToggle(id)}})}}
function b46PinRefresh(){document.querySelectorAll('.match-row[data-match-id]').forEach(b46PinPaint)}
function b46PinToggle(id){id=String(id||'');if(!id)return false;b46PinPruneKnown();if(b46PinHas(id))b46Pins.delete(id);else{if(b46Pins.size>=B46_PIN_MAX)return false;b46Pins.add(id)}b46PinSave();b46PinRefresh();document.dispatchEvent(new CustomEvent('ball46:pin-v2',{detail:{id,pinned:b46PinHas(id)}}));if(!b46PinExpanded()){renderBoard();renderFeatured()}return true}
b46PinLoad();
window.BALL46_PIN_V2=Object.freeze({version:'fresh-v2-20261111',max:B46_PIN_MAX,isPinned:b46PinHas,getIds:()=>[...b46Pins],toggle:b46PinToggle,clear:()=>{b46Pins.clear();b46PinSave();b46PinRefresh();if(!b46PinExpanded()){renderBoard();renderFeatured()}}});
`;

const RENDER_OLD="  const rows=visibleRows(),order=['live','scheduled','unknown','finished'],html=[],structure=[];";
const RENDER_NEW="  b46PinPruneKnown();const rows=visibleRows(),nativeOrder=b46PinNativeOrder(rows),pinned=nativeOrder.filter(f=>b46PinRenderHas(fixtureKey(f))),normal=rows.filter(f=>!b46PinRenderHas(fixtureKey(f))),order=['live','scheduled','unknown','finished'],html=[],structure=[];\n  if(pinned.length){structure.push(['pinned',pinned.length,1,pinned.map(fixtureKey)]);html.push('<section class=\"status-section b46-pin-v2-section\" data-status-section=\"pinned\"><header class=\"status-head\"><div><i class=\"status-dot upcoming\"></i><h2>PINNED MATCHES</h2></div><b>'+pinned.length+'</b></header><section class=\"league-block\">'+pinned.map(rowHtml).join('')+'</section></section>')}";
const NORMAL_OLD="    const all=rows.filter(f=>classify(f)===key);";
const NORMAL_NEW="    const all=normal.filter(f=>classify(f)===key);";
const DESIRED_OLD="  const desiredRows=[...template.content.querySelectorAll('[data-match-id]')];";
const DESIRED_NEW="  const desiredRows=[...template.content.querySelectorAll('[data-match-id]')];desiredRows.forEach(b46PinPaint);";
const BIND_OLD="function bindStableMatchRow(el){prepareLiveDisplayClock(el);if(!el||el.dataset.b46StableBound==='1')return;el.dataset.b46StableBound='1';const choose=()=>{selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})}";
const BIND_NEW="function bindStableMatchRow(el){prepareLiveDisplayClock(el);if(!el)return;b46PinPaint(el);if(el.dataset.b46StableBound==='1')return;el.dataset.b46StableBound='1';const choose=e=>{if(e?.target?.closest?.('[data-b46-pin-v2]'))return;selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.target?.closest?.('[data-b46-pin-v2]'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e)}})}";
const BIND_OLD_FALLBACK="function bindStableMatchRow(el){if(!el||el.dataset.b46StableBound==='1')return;el.dataset.b46StableBound='1';const choose=()=>{selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})}";
const BIND_NEW_FALLBACK="function bindStableMatchRow(el){if(!el)return;b46PinPaint(el);if(el.dataset.b46StableBound==='1')return;el.dataset.b46StableBound='1';const choose=e=>{if(e?.target?.closest?.('[data-b46-pin-v2]'))return;selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.target?.closest?.('[data-b46-pin-v2]'))return;if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(e)}})}";

function patchDash(src,escaped=false){
  if(src.includes('B46_PIN_V2_FRESH_20261111'))return src;
  const x=s=>escaped?esc(s):s;
  src=one(src,x("let query='';"),x("let query='';"+HELPER),'PIN_HELPER');
  src=one(src,x(RENDER_OLD),x(RENDER_NEW),'PIN_RENDER');
  src=one(src,x(NORMAL_OLD),x(NORMAL_NEW),'PIN_NORMAL');
  src=one(src,x(DESIRED_OLD),x(DESIRED_NEW),'PIN_DESIRED');
  src=one(src,x(escaped?BIND_OLD_FALLBACK:BIND_OLD),x(escaped?BIND_NEW_FALLBACK:BIND_NEW),'PIN_BIND');
  return src;
}

function patchExpanded(src){
  if(src.includes('B46_PIN_V2_EXPANDED_GUARD_20261111'))return src;
  src=one(src,
    "document.addEventListener('click',e=>{if(handleMobileFlowSelect(e))return;",
    "document.addEventListener('click',e=>{/* B46_PIN_V2_EXPANDED_GUARD_20261111 */if(e.target.closest?.('[data-b46-pin-v2]'))return;if(handleMobileFlowSelect(e))return;",
    'EXPANDED_CLICK');
  src=one(src,
    "document.addEventListener('keydown',e=>{if(e.key==='Escape'",
    "document.addEventListener('keydown',e=>{if(e.target.closest?.('[data-b46-pin-v2]'))return;if(e.key==='Escape'",
    'EXPANDED_KEY');
  return src;
}

function patchHtml(html){
  if(html.includes('B46_PIN_V2_MOBILE_20261111'))return html;
  html=one(html,
    "const section=el.closest('[data-status-section]'),kind=section?.getAttribute('data-status-section')||'unknown'",
    "const section=el.closest('[data-status-section]'),kind=el.dataset.b46Kind||section?.getAttribute('data-status-section')||'unknown'",
    'MOBILE_KIND');
  html=one(html,
    "const all=visibleRows();const liveOnly=all.filter(x=>x.kind==='live');const ordered=(key==='all'&&liveOnly.length)?[...liveOnly,...all.filter(x=>x.kind!=='live')]:all;",
    "const all=visibleRows(),pinned=all.filter(x=>window.BALL46_PIN_V2?.isPinned?.(x.id)),rest=all.filter(x=>!window.BALL46_PIN_V2?.isPinned?.(x.id)),liveOnly=rest.filter(x=>x.kind==='live');const ordered=[...pinned,...((key==='all'&&liveOnly.length)?[...liveOnly,...rest.filter(x=>x.kind!=='live')]:rest)];",
    'MOBILE_ORDER');
  html=one(html,
    "const signature=ordered.map(x=>[x.id,x.league,x.names.join('~'),x.scores.join('~'),x.clock,x.kind,x.signalCount].join(':')).join('||')+'#'+key;",
    "const signature=ordered.map(x=>[x.id,x.league,x.names.join('~'),x.scores.join('~'),x.clock,x.kind,x.signalCount,window.BALL46_PIN_V2?.isPinned?.(x.id)?1:0].join(':')).join('||')+'#'+key;",
    'MOBILE_SIG');
  html=one(html,
    "const search=$('[data-search]');search?.addEventListener('input',schedule);const paneObs=new MutationObserver(schedule);paneObs.observe(document.body,{attributes:true,attributeFilter:['data-workspace-view']});",
    "const search=$('[data-search]');search?.addEventListener('input',schedule);document.addEventListener('ball46:pin-v2',schedule);const paneObs=new MutationObserver(schedule);paneObs.observe(document.body,{attributes:true,attributeFilter:['data-workspace-view']});",
    'MOBILE_WAKE');

  const style=String.raw`<style id="b46-pin-v2-style">/* B46_PIN_V2_MOBILE_20261111 */
.match-row[data-match-id]{position:relative}
.match-row[data-match-id]>.teams-cell{padding-left:32px!important;box-sizing:border-box}
.b46-pin-v2-star{position:absolute;z-index:2;left:6px;right:auto;top:50%;transform:translateY(-50%);width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font:700 18px/1 Arial,sans-serif;color:#d4a900;background:rgba(0,0,0,.04);cursor:pointer;user-select:none;touch-action:manipulation}
.b46-pin-v2-star[aria-pressed="true"]{color:#f2c94c;text-shadow:0 0 8px rgba(242,201,76,.28)}
.b46-pin-v2-star:focus-visible{outline:2px solid #f2c94c;outline-offset:1px}
.b46-pin-v2-section{border-color:rgba(242,201,76,.22)!important}
.b46-pin-v2-section>.status-head{background:linear-gradient(90deg,rgba(242,201,76,.08),transparent)!important}
@media(max-width:760px){
 #b46gn-cards .b46gn-cardbody{position:relative!important}
 #b46gn-cards .b46gn-team{padding-left:28px!important;box-sizing:border-box}
 #b46gn-cards .b46-pin-v2-mobile{position:absolute;z-index:12;left:6px;right:auto;top:50%;transform:translateY(-50%);width:30px;height:30px;display:grid;place-items:center;border-radius:50%;font:700 19px/1 Arial,sans-serif;color:#31D4A3;background:rgba(4,18,16,.72);cursor:pointer;user-select:none;touch-action:manipulation;pointer-events:auto!important;-webkit-tap-highlight-color:transparent}
 #b46gn-cards .b46-pin-v2-mobile[data-on="1"]{color:#31D4A3;text-shadow:0 0 8px rgba(49,212,163,.32)}
}
</style>`;
  const runtime=String.raw`<script id="b46-pin-v2-mobile-runtime">(()=>{'use strict';/* B46_PIN_V2_MOBILE_RUNTIME_20261111 */
const host=()=>document.querySelector('#b46gn-cards');
function paint(){const h=host();if(!h)return;h.querySelectorAll('[data-b46gn-fixture]').forEach(c=>{const id=String(c.dataset.b46gnFixture||'');let s=c.querySelector('[data-b46-pin-mobile]');if(!s){s=document.createElement('span');s.className='b46-pin-v2-mobile';s.dataset.b46PinMobile=id;(c.querySelector('.b46gn-cardbody')||c).appendChild(s)}const on=!!window.BALL46_PIN_V2?.isPinned?.(id);s.textContent=on?'★':'☆';s.dataset.on=on?'1':'0';s.setAttribute('aria-label',on?'Unpin match':'Pin match to top')})}
function bind(){const r=document.querySelector('#b46gn-results');if(!r||document.documentElement.dataset.b46PinV2MobileBound==='1')return false;document.documentElement.dataset.b46PinV2MobileBound='1';document.addEventListener('click',e=>{const s=e.target.closest('[data-b46-pin-mobile]');if(!s)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();window.BALL46_PIN_V2?.toggle?.(s.dataset.b46PinMobile);requestAnimationFrame(paint)},true);const h=host();if(h)new MutationObserver(()=>requestAnimationFrame(paint)).observe(h,{childList:true,subtree:true});document.addEventListener('ball46:pin-v2',()=>requestAnimationFrame(paint));paint();return true}
let n=0;const t=setInterval(()=>{if(bind()||++n>100)clearInterval(t)},30)})();
</script>`;
  html=one(html,'</head>',style+'</head>','MOBILE_STYLE_HEAD');
  html=one(html,'</body>',runtime+'</body>','MOBILE_RUNTIME_BODY');
  return html;
}

async function publicCheck(expectNew){
  let last={};
  for(let i=0;i<25;i++){
    const q=Date.now()+'-'+i;
    const [dr,hr,er]=await Promise.all([
      fetch('https://ball46.com/dashboard-v2-stage3-featured-facts-20261013a.js?v=b46-screen-refresh-5s-20261104&pinv2='+q,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),
      fetch('https://ball46.com/?pinv2-source='+q,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),
      fetch('https://ball46.com/expanded-match-343.js?pinv2='+q,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)})
    ]);
    const [d,h,e]=await Promise.all([dr.text(),hr.text(),er.text()]);
    last={d:d.length,h:h.length,e:e.length,hasD:d.includes('B46_PIN_V2_FRESH_20261111'),hasH:h.includes('B46_PIN_V2_MOBILE_20261111'),hasE:e.includes('B46_PIN_V2_EXPANDED_GUARD_20261111')};
    const has=last.hasD&&last.hasH&&last.hasE;
    const preserved=d.includes('B46_SCREEN_REFRESH_5S_20261104')||d.includes('renderBoard');
    if(dr.ok&&hr.ok&&er.ok&&preserved&&(expectNew?has:!has))return;
    await delay(1000);
  }
  throw new Error('PUBLIC_PIN_V2_CHECK_FAILED expectNew='+expectNew+' last='+JSON.stringify(last));
}

let candidate='',activated=false;
try{
  assert.equal(await active(),EXPECT_CURRENT,'ACTIVE_VERSION_DRIFT');
  await publicCheck(false);

  const current=await version(EXPECT_CURRENT);
  const settingsBefore=await settings();
  const schedulesBefore=await schedules();
  const main=current.modules.find(m=>m.name===current.main_module)||current.modules.find(m=>m.name==='index.js');
  const dash=current.modules.find(m=>m.name==='screen-refresh-5s-20261104.txt');
  const html=current.modules.find(m=>m.name==='assets/index.html');
  assert(main&&dash&&html,'REQUIRED_MODULE_MISSING');

  const mainSrc=Buffer.from(main.content_base64,'base64').toString('utf8');
  const dashSrc=Buffer.from(dash.content_base64,'base64').toString('utf8');
  const htmlSrc=Buffer.from(html.content_base64,'base64').toString('utf8');

  for(const marker of ['B46_FULLMARKET_DARK10_YELLOW_DOT_20261111','B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111','B46_FULLMARKET_INSPECT_CACHE_20261110'])assert(mainSrc.includes(marker),'CURRENT_MARKER_MISSING_'+marker);
  assert(!mainSrc.includes('ball46_favorites_v1'),'LEGACY_FAVORITES_FOUND_IN_MAIN');
  assert(!dashSrc.includes('B46_PIN_V2_FRESH_20261111'),'PIN_V2_ALREADY_IN_DASH');
  assert(!htmlSrc.includes('B46_PIN_V2_MOBILE_20261111'),'PIN_V2_ALREADY_IN_HTML');

  const dashPatched=patchDash(dashSrc,false);
  let mainPatched=patchDash(mainSrc,true);
  mainPatched=patchExpanded(mainPatched);
  const htmlPatched=patchHtml(htmlSrc);

  assert(dashPatched.includes('b46PinPruneKnown'),'DASH_PRUNE_MISSING');
  assert(mainPatched.includes('B46_PIN_V2_EXPANDED_GUARD_20261111'),'MAIN_EXPANDED_GUARD_MISSING');
  assert(mainPatched.includes('B46_PIN_V2_FRESH_20261111'),'MAIN_EMBEDDED_PIN_MISSING');
  assert(htmlPatched.includes('B46_PIN_V2_MOBILE_20261111'),'HTML_PIN_MISSING');
  assert(htmlPatched.includes('padding-left:28px!important'),'HTML_MOBILE_RAIL_MISSING');

  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_UPLOAD');
  const metadata={
    main_module:current.main_module,
    compatibility_date:current.compatibility_date,
    compatibility_flags:current.compatibility_flags||[],
    bindings:current.bindings,
    keep_assets:true,
    assets:{config:current.assets?.config},
    annotations:{
      'workers/tag':'B46_PIN_V2_FRESH_20261111',
      'workers/message':'Pinned Fixtures V2 star left-center, max 200, no extra API'
    }
  };
  if(current.placement)metadata.placement=current.placement;

  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    let bytes=Buffer.from(m.content_base64,'base64');
    if(m.name===main.name)bytes=Buffer.from(mainPatched);
    else if(m.name===dash.name)bytes=Buffer.from(dashPatched);
    else if(m.name===html.name)bytes=Buffer.from(htmlPatched);
    form.append(m.name,new Blob([bytes],{type:typeFor(m,current.main_module)}),m.name);
  }

  const uploaded=await api('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});
  candidate=uploaded?.id;assert(candidate,'CANDIDATE_MISSING');
  fs.writeFileSync('pinned-fixtures-v2-production/release-state.json',JSON.stringify({base:EXPECT_CURRENT,candidate,script:SCRIPT},null,2));

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  let changed=0;
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,'MODULE_MISSING:'+m.name);
    if(cm.content_base64!==m.content_base64)changed++;
    const t=Buffer.from(cm.content_base64,'base64').toString('utf8');
    if(m.name===main.name){
      assert(t.includes('B46_PIN_V2_FRESH_20261111'),'CANDIDATE_MAIN_PIN_MISSING');
      assert(t.includes('B46_PIN_V2_EXPANDED_GUARD_20261111'),'CANDIDATE_EXPANDED_GUARD_MISSING');
      for(const marker of ['B46_FULLMARKET_DARK10_YELLOW_DOT_20261111','B46_FULLMARKET_COMPACT_LAZY_ONDEMAND_20261111','B46_FULLMARKET_INSPECT_CACHE_20261110'])assert(t.includes(marker),'CANDIDATE_LOST_'+marker);
    }else if(m.name===dash.name){
      assert(t.includes('B46_PIN_V2_FRESH_20261111'),'CANDIDATE_DASH_PIN_MISSING');
    }else if(m.name===html.name){
      assert(t.includes('B46_PIN_V2_MOBILE_20261111'),'CANDIDATE_HTML_PIN_MISSING');
    }else assert.equal(cm.content_base64,m.content_base64,'UNRELATED_MODULE_CHANGED:'+m.name);
  }
  assert.equal(changed,3,'CHANGED_MODULE_COUNT_'+changed);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_PRE');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_PRE');
  assert.equal(await active(),EXPECT_CURRENT,'PRODUCTION_MOVED_BEFORE_ACTIVATE');

  await activate(candidate,'Pinned Fixtures V2 star left-center, max 200, no extra API');
  activated=true;
  for(let i=0;i<25;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  await publicCheck(true);
  assert.equal(canon(await settings()),canon(settingsBefore),'SETTINGS_CHANGED_POST');
  assert.equal(canon(await schedules()),canon(schedulesBefore),'SCHEDULES_CHANGED_POST');

  console.log('BASE_ACTIVE='+EXPECT_CURRENT);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('CHANGED_MODULES=3');
  console.log('PIN_V2=1');
  console.log('MAX_200=1');
  console.log('LEFT_CENTER_DESKTOP=1');
  console.log('LEFT_CENTER_MOBILE=1');
  console.log('NORMAL_LIFECYCLE_PRUNE=1');
  console.log('FULLMARKET_PATCHES_PRESERVED=1');
  console.log('PIN_V2_DEPLOY_SUCCESS=1');
}catch(e){
  console.error(e.stack||e);
  try{
    if(activated&&candidate&&await active()===candidate){
      await activate(EXPECT_CURRENT,'Rollback Pinned Fixtures V2 after failed verification');
      for(let i=0;i<25;i++){if(await active()===EXPECT_CURRENT)break;await delay(1000)}
      console.log('ROLLBACK_ACTIVE='+(await active()));
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb.stack||rb)}
  process.exit(1);
}
