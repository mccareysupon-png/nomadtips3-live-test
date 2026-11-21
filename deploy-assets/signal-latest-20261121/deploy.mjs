import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {signalStableStyles,signalStableScript} from '../../qa/signal-stable-20261121/signal-stable.mjs';

const SCRIPT='ball46-production',MARK='B46_SIGNAL_LATEST_STABLE_20261121';
const HOME='https://ball46.com',TEST='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const EXPECTED_BASE='2fe9822b-7e5b-45af-ad18-b51fcb520e43';
const EXPECTED_MAIN_SHA='7697b672083fd91f0fc5b1a0d7d973158f32c31b723da1b5af360d65f4a1155f';
const sha=x=>createHash('sha256').update(x).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const stableJson=o=>JSON.stringify(o,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const report={marker:MARK,scope:'Add Signal newest-first sorting and stable Event Flow using exact TEST code, preserve native Live card, full league flag header, original engine/counter scripts and all unrelated modules/assets/bindings/crons.'};
mkdirSync('audit',{recursive:true});const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null,activated=false;
function check(c,msg){assert(c,msg);return c}
async function cf(path,opts={}){
 check(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID,'CF_CREDENTIALS_MISSING');
 const res=await fetch(ROOT+path,{...opts,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...opts.headers},signal:AbortSignal.timeout(70000)});
 const data=await res.json();assert(res.ok&&data.success,'CF_API_'+res.status+'_'+JSON.stringify(data.errors||[]));return data.result;
}
async function active(){
 const d=await cf('/scripts/'+SCRIPT+'/deployments?per_page=3'),vs=d.deployments?.[0]?.versions;
 assert(vs?.length===1&&Number(vs[0].percentage)===100,'ACTIVE_WORKER_NOT_100_PERCENT');
 return vs[0].version_id;
}
async function version(id){
 let last;
 for(let i=0;i<20;i++){
  try{return await cf('/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}
  catch(e){last=e;if(!String(e).includes('10071')||i===19)throw e;await delay(1600)}
 }
 throw last;
}
async function crons(){
 const x=await cf('/scripts/'+SCRIPT+'/schedules'),arr=Array.isArray(x)?x:x.schedules;
 assert(Array.isArray(arr),'SCHEDULES_NOT_ARRAY');return arr.map(x=>x.cron).sort();
}
const settings=()=>cf('/scripts/'+SCRIPT+'/settings');
async function read(url){
 const x=new URL(url);x.searchParams.set('b46SignalVerify',Date.now()+'-'+(process.env.GITHUB_RUN_ID||'local'));
 const r=await fetch(x,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(70000)});
 assert(r.ok,'SITE_HTTP_'+r.status+'_'+x.pathname);return r.text();
}
function main(v){
 const m=v.modules?.find(x=>x.name===v.main_module);
 assert(m?.content_base64,'MAIN_MODULE_MISSING');
 return Buffer.from(m.content_base64,'base64').toString('utf8');
}
function prepare(h){
 assert(h?.ok===true&&h.scope==='TEST_ONLY_CSS','TEST_HEALTH_SCOPE_CHANGED');
 assert(h.signalStable==='SIGNAL_CREATEDAT_SORT_AND_FLOW_FREEZE_TEST','TEST_SIGNAL_FEATURE_DISABLED');
 assert.equal(h.signalStableStyles,signalStableStyles,'APPROVED_TEST_SIGNAL_CSS_DRIFT');
 assert.equal(h.signalStableScript,signalStableScript,'APPROVED_TEST_SIGNAL_JS_DRIFT');
 assert(signalStableScript.includes('createdAt')&&signalStableScript.includes('activeFlow')&&signalStableScript.includes('freezeOrder'),'SORT_OR_EVENTFLOW_LOGIC_MISSING');
 assert(signalStableStyles.includes('b46-signal-native-head')&&!signalStableStyles.includes('b46-signal-league-strip'),'NON_NATIVE_SIGNAL_UI');
 assert(signalStableScript.includes('nativeLeagueSource')&&signalStableScript.includes('seenSource'),'ORIGINAL_CARD_OR_FIRST_PAINT_NOT_PRESERVED');
 assert(!signalStableStyles.includes('</style>')&&!signalStableScript.includes('</script>'),'UNSAFE_INLINE_HTML_CLOSING_TAG');
 assert(!signalStableStyles.includes('<script')&&!signalStableScript.includes('<style'),'UNSAFE_NESTED_HTML');
 return {css:signalStableStyles,js:signalStableScript};
}
function patch(source,p){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const defs=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.filter(d=>d.id?.name==='__b46HeadOddsFlash20261121'):[]);
 assert.equal(defs.length,1,'EXPECTED_HEAD_LITERAL_NOT_UNIQUE');
 const lit=defs[0].init;assert(lit?.type==='Literal'&&typeof lit.value==='string','EXPECTED_LITERAL_TYPE_CHANGED');
 const old=lit.value;
 assert(old.startsWith('<!-- B46_ODDS_FLASH_ROUNDED_ARROW_20261121 -->'),'ODDS_MARKER_CHANGED');
 assert(old.includes('B46_ODDS_V3_TRIANGLE_20261121'),'ODDS_V3_MISSING');
 assert(old.includes('b46-sidebar-winrate-production')&&old.includes('B46_SIDEBAR_WINRATE_HYDRATE_20261121'),'SIDEBAR_MISSING');
 assert(!old.includes(MARK)&&!source.includes('b46-signal-stable-production'),'SIGNAL_ALREADY_DEPLOYED');
 assert(old.endsWith('</script>'),'HEAD_CONTENT_EXPECTED_ENDING_CHANGED');
 const injection='<!-- '+MARK+' -->'+'<style id="b46-signal-stable-production">'+p.css+'</style>'+'<script id="b46-signal-stable-runtime-production">'+p.js+'</script>';
 const updated=JSON.stringify(old+injection);
 const next=source.slice(0,lit.start)+updated+source.slice(lit.end);
 assert(next.slice(0,lit.start)===source.slice(0,lit.start)&&next.slice(lit.start+updated.length)===source.slice(lit.end),'UNRELATED_CODE_CHANGED');
 assert(next.includes('b46-sidebar-winrate-production')&&next.includes('B46_ODDS_V3_TRIANGLE_20261121'),'EXISTING_HEAD_FEATURE_LOST');
 parse(next,{ecmaVersion:'latest',sourceType:'module'});
 report.patch={oldHeadLength:old.length,newHeadLength:old.length+injection.length,cssSha:sha(p.css),jsSha:sha(p.js),onlyLiteralChanged:true,mainSourceBefore:sha(source),mainSourceAfter:sha(next)};
 return next;
}
function contentType(m,mainName){
 if(m.content_type)return m.content_type;
 if(m.name===mainName||/\.m?js$/.test(m.name))return 'application/javascript+module';
 if(m.name.endsWith('.html'))return 'text/html';
 if(m.name.endsWith('.bin'))return 'application/octet-stream';
 if(m.name.endsWith('.txt'))return 'text/plain';
 if(m.name.endsWith('.css'))return 'text/css';
 if(m.name.endsWith('.json'))return 'application/json';
 throw Error('UNKNOWN_CONTENT_TYPE_'+m.name);
}
async function upload(old,patched){
 assert(old.assets?.config&&old.bindings?.some(x=>x.type==='assets'),'ASSETS_PRESERVATION_NOT_AVAILABLE');
 const metadata={main_module:old.main_module,compatibility_date:old.compatibility_date,compatibility_flags:old.compatibility_flags||[],bindings:old.bindings,keep_assets:true,assets:{config:old.assets.config},annotations:{'workers/tag':MARK,'workers/message':'Signal latest-first stable native Live cards'}};
 if(old.placement)metadata.placement=old.placement;
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
 for(const m of old.modules){
  assert(m.content_base64,'MODULE_CONTENT_MISSING_'+m.name);
  const bytes=m.name===old.main_module?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
  form.append(m.name,new Blob([bytes],{type:contentType(m,old.main_module)}),m.name);
 }
 const result=await cf('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});
 assert(result?.id&&result.id!==base,'CANDIDATE_ID_INVALID');
 return result.id;
}
function verify(v,old,patched){
 assert.equal(v.main_module,old.main_module,'MAIN_MODULE_CHANGED');
 assert.equal(v.compatibility_date,old.compatibility_date,'COMPAT_DATE_CHANGED');
 assert.equal(stableJson(v.compatibility_flags||[]),stableJson(old.compatibility_flags||[]),'COMPAT_FLAGS_CHANGED');
 assert.equal(stableJson(v.bindings),stableJson(old.bindings),'BINDINGS_CHANGED');
 assert.equal(stableJson(v.assets?.config),stableJson(old.assets?.config),'ASSETS_CONFIG_CHANGED');
 assert.equal(sha(main(v)),sha(patched),'MAIN_MODULE_CONTENT_MISMATCH');
 assert.equal(v.modules.length,old.modules.length,'MODULE_COUNT_CHANGED');
 for(const m of old.modules){
  if(m.name===old.main_module)continue;
  const x=v.modules.find(x=>x.name===m.name);
  assert(x?.content_base64&&sha(Buffer.from(x.content_base64,'base64'))===sha(Buffer.from(m.content_base64,'base64')),'OTHER_MODULE_CHANGED_'+m.name);
 }
}
async function backendHealth(){
 const items={};
 for(const path of ['/api/engine/health','/api/full-market/health']){
  const data=JSON.parse(await read(HOME+path));assert(data.ok===true,'BACKEND_NOT_HEALTHY_'+path);items[path]=data.version||data.revision||null;
 }
 return items;
}
async function browserCheck(origin,label,full){
 const browser=await chromium.launch(),checks=[];
 try{
 for(const mode of [{name:'desktop-dark',w:1440,theme:'dark'},{name:'desktop-light',w:1440,theme:'light'},{name:'mobile-dark',w:390,theme:'dark'}].slice(0,full?3:1)){
  const ctx=await browser.newContext({viewport:{width:mode.w,height:920},serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  await p.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),mode.theme);
  p.on('pageerror',e=>errors.push(e.message.slice(0,250)));
  await p.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  const res=await p.goto(origin+'/index.html?view=signal&signalReleaseQA='+label+'-'+mode.name+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
  assert(res?.ok(),'BROWSER_HTTP_'+label+'_'+mode.name);
  await p.waitForFunction(()=>window.__b46SignalStableStatus?.ready===true,null,{timeout:35000});
  await p.waitForFunction(()=>document.body?.dataset.workspaceView==='signal',null,{timeout:35000});
  // The real Engine can legitimately have zero live predictions; do not fabricate a production signal.
  await p.waitForFunction(()=>window.__b46SignalStableStatus?.seenSource===true,null,{timeout:45000});
  await p.waitForTimeout(550);
  const state=await p.evaluate(()=>{
   const rows=[...document.querySelectorAll('.status-section[data-status-section="live"] .league-block > .match-row[data-match-id]')];
   const list=window.__b46SignalStableQA.latest(),byId=new Map(list.map(x=>[x.id,x.at]));
   const sorted=[...rows].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(e=>({id:e.dataset.matchId,at:byId.get(e.dataset.matchId)||0}));
   const heads=[...document.querySelectorAll('.status-section .b46-signal-native-head')];
   return {view:document.body.dataset.workspaceView,source:window.__b46SignalStableQA.state(),sorted,headers:heads.length,visibleFlags:heads.filter(h=>h.getBoundingClientRect().height>10&&h.querySelector('.league-flag')).length,nativeRows:rows.length,hasCustomHeading:!!document.querySelector('.b46-signal-unified-head,.b46-signal-league-strip'),style:!!document.getElementById('b46-signal-stable-production'),script:!!document.getElementById('b46-signal-stable-runtime-production'),odds:!!document.getElementById('b46-odds-flash-production'),sidebar:!!document.getElementById('b46-sidebar-winrate-production'),scrollY:document.querySelector('.board-sections')?.scrollTop};
  });
  assert(state.style&&state.script&&state.odds&&state.sidebar,'PRODUCTION_HEAD_INJECTION_INCOMPLETE_'+mode.name);
  assert(!state.hasCustomHeading&&state.source.sourceRequestsAdded===0,'UNEXPECTED_UI_OR_EXTRA_REQUESTS_'+mode.name);
  for(let i=1;i<state.sorted.length;i++)assert(state.sorted[i-1].at>=state.sorted[i].at,'NOT_SORTED_NEWEST_FIRST_'+mode.name);
  if(state.nativeRows>0)assert.equal(state.headers,state.nativeRows,'NATIVE_LEAGUE_HEADER_MISSING_'+mode.name);
  if(state.nativeRows>0)assert.equal(state.visibleFlags,state.nativeRows,'NATIVE_LEAGUE_FLAG_MISSING_'+mode.name);
  let flowChecked=false;
  if(state.sorted.length>0){
   const id=state.sorted[0].id;
   await p.locator('.status-section[data-status-section="live"] .match-row[data-match-id="'+id+'"]').click({position:{x:75,y:25},force:true});
   try{
    await p.waitForFunction(id=>!!document.querySelector('.status-section .match-row.active[data-match-id="'+id+'"]')?.parentElement?.querySelector('.expand-flow-card')&&window.__b46SignalStableQA.state().frozen===id,id,{timeout:20000});
    flowChecked=true;
    const before=await p.evaluate(()=>({order:window.__b46SignalStableQA.state().lastOrder.join(','),frozen:window.__b46SignalStableQA.state().frozen,top:document.querySelector('.status-section .match-row.active')?.getBoundingClientRect().top}));
    const local=state.sorted.map((x,i)=>({fixtureId:x.id,createdAt:1795245000000+i*1000}));
    await p.evaluate(signals=>window.__b46SignalStableQA.applySignals({signals}),local);
    await p.waitForTimeout(500);
    const after=await p.evaluate(()=>({order:window.__b46SignalStableQA.state().lastOrder.join(','),frozen:window.__b46SignalStableQA.state().frozen,top:document.querySelector('.status-section .match-row.active')?.getBoundingClientRect().top}));
    assert.equal(after.frozen,id,'EVENTFLOW_FROZEN_MATCH_CHANGED');
    assert.equal(after.order,before.order,'EVENTFLOW_REORDERED_WHILE_OPEN');
    assert(Math.abs(after.top-before.top)<3,'EVENTFLOW_VIEWPORT_SHIFTED');
   }catch(e){throw new Error('EVENTFLOW_CHECK_FAILED_'+mode.name+'_'+String(e))}
  }
  await p.screenshot({path:'audit/'+label+'-'+mode.name+'.png',fullPage:false});
  checks.push({name:mode.name,...state,flowChecked,errors});
  assert.deepEqual(errors,[],'BROWSER_PAGE_ERRORS_'+mode.name+'_'+JSON.stringify(errors));
  await ctx.close();
 }
 }finally{await browser.close()}
 console.log('BALL46_SIGNAL_BROWSER_CHECK_'+label+' '+JSON.stringify(checks.map(x=>({profile:x.name,rows:x.nativeRows,flags:x.visibleFlags,flowChecked:x.flowChecked,sourceRequestsAdded:x.source.sourceRequestsAdded,sorted:x.sorted.length}))));
 return checks.map(x=>({profile:x.name,nativeRows:x.nativeRows,flags:x.visibleFlags,flowChecked:x.flowChecked,errors:x.errors}));
}
async function rollback(){
 if(!activated)return;
 const current=await active();if(current===base)return;
 assert.equal(current,candidate,'FOREIGN_ACTIVE_VERSION_NO_ROLLBACK');
 await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback '+MARK}})});
 for(let i=0;i<20;i++){if(await active()===base){report.rollback=base;save();return}await delay(1250)}
 throw Error('ROLLBACK_VERSION_NOT_RESTORED');
}
try{
 const h=JSON.parse(await read(TEST+'/_premium_health'));
 const payload=prepare(h);
 report.testApproved={cssSha:sha(payload.css),jsSha:sha(payload.js),testScope:h.scope};save();
 base=await active();assert.equal(base,EXPECTED_BASE,'PRODUCTION_VERSION_MOVED_SINCE_READONLY_AUDIT');
 report.oldVersion=base;save();
 const old=await version(base),source=main(old);
 assert.equal(sha(source),EXPECTED_MAIN_SHA,'PRODUCTION_MAIN_CHANGED_SINCE_AUDIT');
 parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const settingsBefore=stableJson(await settings()),cronBefore=stableJson(await crons()),healthBefore=await backendHealth();
 const publicBefore=await read(HOME+'/index.html');assert(publicBefore.includes('b46-odds-flash-production')&&publicBefore.includes('b46-sidebar-winrate-production'),'PRODUCTION_EXISTING_FEATURES_MISSING');
 assert(!publicBefore.includes(MARK),'PRODUCTION_ALREADY_PATCHED');
 report.before={sourceSha:sha(source),settingsSha:sha(settingsBefore),crons:JSON.parse(cronBefore),health:healthBefore};save();
 const next=patch(source,payload);save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');
 candidate=await upload(old,next);report.candidate=candidate;save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_AFTER_UPLOAD');
 verify(await version(candidate),old,next);
 const preview='https://'+candidate.slice(0,8)+'-'+SCRIPT+'.mccarey-supon.workers.dev';report.preview=preview;save();
 const previewHtml=await read(preview+'/index.html?view=signal');
 assert(previewHtml.includes(MARK)&&previewHtml.includes('b46-sidebar-winrate-production'),'CANDIDATE_HTML_MISSING_INJECTION');
 report.previewCheck=await browserCheck(preview,'candidate',true);save();
 assert.equal(await active(),base,'PRODUCTION_CHANGED_DURING_CANARY');
 assert.equal(stableJson(await settings()),settingsBefore,'SETTINGS_CHANGED_BEFORE_ACTIVATION');
 assert.equal(stableJson(await crons()),cronBefore,'CRONS_CHANGED_BEFORE_ACTIVATION');
 await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Deploy '+MARK}})});
 activated=true;console.log('BALL46_SIGNAL_PRODUCTION_ACTIVATED '+JSON.stringify({oldVersion:base,newVersion:candidate}));
 let confirmed=false;for(let i=0;i<22;i++){const x=await active();if(x===candidate){confirmed=true;break}assert.equal(x,base,'FOREIGN_ACTIVATION_VERSION');await delay(1100)}
 assert(confirmed,'ACTIVATION_NOT_CONFIRMED');
 let propagated=false;for(let i=0;i<40;i++){try{const html=await read(HOME+'/index.html?view=signal');if(html.includes(MARK)&&html.includes('b46-odds-flash-production')){propagated=true;break}}catch{}await delay(1350)}
 assert(propagated,'PRODUCTION_SIGNAL_HTML_NOT_PROPAGATED');
 report.productionCheck=await browserCheck(HOME,'production',true);save();
 verify(await version(candidate),old,next);
 assert.equal(stableJson(await settings()),settingsBefore,'WORKER_SETTINGS_CHANGED');
 assert.equal(stableJson(await crons()),cronBefore,'WORKER_CRONS_CHANGED');
 assert.deepEqual(await backendHealth(),healthBefore,'BACKEND_HEALTH_CHANGED');
 assert.equal(await active(),candidate,'ACTIVE_VERSION_MOVED');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_SIGNAL_PRODUCTION_SUCCESS '+JSON.stringify({oldVersion:base,newVersion:candidate,cssSha:sha(payload.css),jsSha:sha(payload.js),moduleCount:old.modules.length,backendUnchanged:true}));
}catch(e){
 report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';report.error=String(e?.stack||e);save();
 try{await rollback()}catch(x){report.rollbackError=String(x?.stack||x);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
