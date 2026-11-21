import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {sidebarHydratorScript} from './sidebar-hydrator.mjs';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const SCRIPT='ball46-production',MARK='B46_SIDEBAR_WINRATE_HYDRATE_20261121';
const TEST='https://ball46-sidebar-winrate-test-20261121.mccarey-supon.workers.dev';
const HOME='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={marker:MARK,scope:'Inject tested one-shot sidebar Receiver Win Rate hydration into existing production head literal; leave entire Worker, Odds Flash, premium match styles, Engine, API handlers, assets and schedules unchanged.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null,activated=false;
async function cf(path,opts={}){
 assert(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID,'CLOUDFLARE_CREDENTIALS_MISSING');
 const r=await fetch(ROOT+path,{...opts,signal:AbortSignal.timeout(70000),headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...opts.headers}});
 const j=await r.json();assert(r.ok&&j.success,'CF_API_ERROR_'+r.status+'_'+JSON.stringify(j.errors||[]));return j.result;
}
async function active(){
 const d=await cf('/scripts/'+SCRIPT+'/deployments?per_page=3'),v=d.deployments?.[0]?.versions;
 assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_VERSION_NOT_100_PERCENT');return v[0].version_id;
}
async function version(id){
  let last;
  for(let i=0;i<20;i++){
    try{return await cf('/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}
    catch(e){last=e;const m=String(e);if(!m.includes('10071')||i===19)throw e;await delay(2000)}
  }
  throw last;
}
const settings=()=>cf('/scripts/'+SCRIPT+'/settings');
async function crons(){const a=await cf('/scripts/'+SCRIPT+'/schedules'),b=Array.isArray(a)?a:a.schedules;assert(Array.isArray(b),'CRONS_MISSING');return b.map(x=>x.cron).sort()}
async function read(url){
 const u=new URL(url);u.searchParams.set('b46ReleaseVerify',Date.now()+'-'+(process.env.GITHUB_RUN_ID||'local'));
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(60000)});
 assert(r.ok,'HTTP_'+r.status+'_'+u.pathname);return r.text();
}
function main(v){
 const m=v.modules?.find(x=>x.name===v.main_module);assert(m?.content_base64,'ACTIVE_MAIN_MODULE_MISSING');
 return Buffer.from(m.content_base64,'base64').toString('utf8');
}
function prepare(h){
 assert(h?.ok===true&&h.scope==='TEST_ONLY'&&h.revision==='SIDEBAR_WINRATE_BOOTSTRAP_20261121_V1','SIDEBAR_APPROVED_TEST_REVISION_DRIFT');
 assert(h.scriptSize===sidebarHydratorScript.length,'PINNED_TEST_ASSET_SIZE_DIFFERENT');
 assert(h.sessionCache===true&&h.initialReceiverGetLimit===1,'TEST_LOAD_CONTRACT_CHANGED');
 const js=sidebarHydratorScript;
 assert(js.length>2500&&js.length<15000,'SIDEBAR_SCRIPT_SIZE_INVALID');
 assert(js.includes('__B46_SIDEBAR_HYDRATE')&&js.includes("MAX_CACHE_AGE=300000")&&js.includes("x-b46-monitor-rates"),'SIDEBAR_RECEIVER_LOGIC_INCOMPLETE');
 assert(js.includes("status.requests++")&&js.includes('window.fetch(GRAPH')&&js.includes("seenGraph"),'SIDEBAR_FIRST_LOAD_CONTRACT_MISSING');
 assert(js.includes("dataset.b46MonitorSequence")&&js.includes("snapshot.sequence"),'SIDEBAR_SEQUENCE_MONOTONICITY_MISSING');
 assert(!js.includes('/api/engine/statistics')&&!js.includes('XMLHttpRequest')&&!js.includes('WebSocket'),'SIDEBAR_MUST_NOT_PULL_LEDGER');
 assert(!js.includes('</script>'),'UNSAFE_INLINE_TERMINATOR');
 return {js,sha:sha(js)};
}
function patchWorker(source,p){
 assert(!source.includes(MARK),'ALREADY_HYDRATED_RELEASE');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const targets=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.filter(d=>d.id.name==='__b46HeadOddsFlash20261121'):[]);
 assert.equal(targets.length,1,'EXISTING_ODDS_HEAD_FRAGMENT_NOT_FOUND');
 const lit=targets[0].init;
 assert(lit?.type==='Literal'&&typeof lit.value==='string','ODDS_HEAD_FRAGMENT_NOT_LITERAL');
 const oldHead=lit.value;
 assert(oldHead.startsWith('<!-- B46_ODDS_FLASH_ROUNDED_ARROW_20261121 -->'),'CURRENT_ODDS_RELEASE_MARKER_MISMATCH');
 assert(oldHead.includes('id="b46-odds-flash-production"')&&oldHead.includes('id="b46-odds-flash-runtime-production"'),'ODDS_FLASH_NOT_PRESENT');
 assert(oldHead.includes("DURATION=2000")&&oldHead.includes('border-radius:6px!important'),'ODDS_FLASH_EXISTING_PRESENTATION_DRIFT');
 assert(oldHead.endsWith('</script>'),'EXISTING_ODDS_HEAD_FRAGMENT_SUFFIX_CHANGED');
 assert(!oldHead.includes('b46-sidebar-winrate-production')&&!source.includes('b46-sidebar-winrate-production'),'SIDEBAR_ALREADY_INSTALLED');
 const extra='<!-- '+MARK+' --><script id="b46-sidebar-winrate-production">'+p.js+'</script>';
 const next=oldHead+extra;
 const literal=JSON.stringify(next);
 const output=source.slice(0,lit.start)+literal+source.slice(lit.end);
 assert.equal(output.slice(0,lit.start),source.slice(0,lit.start),'UNRELATED_SOURCE_CHANGED_BEFORE_LITERAL');
 assert.equal(output.slice(lit.start+literal.length),source.slice(lit.end),'UNRELATED_SOURCE_CHANGED_AFTER_LITERAL');
 parse(output,{ecmaVersion:'latest',sourceType:'module'});
 return output;
}
function type(m,mainName){
 if(m.content_type)return m.content_type;
 if(m.name===mainName||/\.m?js$/.test(m.name))return 'application/javascript+module';
 if(m.name.endsWith('.html'))return 'text/html';
 if(m.name.endsWith('.bin'))return 'application/octet-stream';
 if(m.name.endsWith('.txt'))return 'text/plain';
 throw Error('UNKNOWN_MODULE_TYPE_'+m.name);
}
async function upload(v,source){
 assert(v.assets?.config&&v.bindings?.some(x=>x.type==='assets'),'ASSET_PRESERVATION_NOT_SUPPORTED');
 const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':MARK,'workers/message':'Premium match card visual only'}};
 if(v.placement)metadata.placement=v.placement;
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
 for(const m of v.modules){
  assert(m.content_base64,'MODULE_MISSING_'+m.name);
  const bytes=m.name===v.main_module?Buffer.from(source):Buffer.from(m.content_base64,'base64');
  form.append(m.name,new Blob([bytes],{type:type(m,v.main_module)}),m.name);
 }
 const result=await cf('/scripts/'+SCRIPT+'/versions',{method:'POST',body:form});
 assert(result?.id&&result.id!==base,'CANDIDATE_ID_MISSING');console.log('PREVIEW_VERSION_UPLOAD',{id:result.id,fields:Object.keys(result)});return result.id;
}
function verify(v,old,source){
 assert.equal(v.main_module,old.main_module,'MAIN_MODULE_CHANGED');
 assert.equal(v.compatibility_date,old.compatibility_date,'COMPAT_DATE_CHANGED');
 assert.equal(same(v.compatibility_flags||[]),same(old.compatibility_flags||[]),'FLAGS_CHANGED');
 assert.equal(same(v.bindings),same(old.bindings),'BINDINGS_CHANGED');
 assert.equal(same(v.assets?.config),same(old.assets?.config),'ASSET_CONFIGURATION_CHANGED');
 assert.equal(sha(main(v)),sha(source),'WORKER_SOURCE_NOT_EXPECTED');
 assert.equal(v.modules.length,old.modules.length,'MODULE_COUNT_CHANGED');
 for(const m of old.modules){if(m.name===old.main_module)continue;const n=v.modules.find(x=>x.name===m.name);assert(n?.content_base64&&sha(Buffer.from(n.content_base64,'base64'))===sha(Buffer.from(m.content_base64,'base64')),'OTHER_MODULE_CHANGED_'+m.name)}
}
async function browserCheck(origin,label,p,full=false){
 const browser=await chromium.launch();const results={};
 const keys=['all','1x2','ah','ou','btts','corners','cards','other'];
 try{
  for(const mode of [{name:'desktop-dark',width:1440,theme:'dark'},{name:'desktop-light',width:1440,theme:'light'},{name:'mobile-dark',width:390,theme:'dark'}]){
   if(!full&&mode.name!=='desktop-dark')continue;
   const context=await browser.newContext({viewport:{width:mode.width,height:900},serviceWorkers:'block'});
   const pg=await context.newPage();
   await pg.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),mode.theme);
   await pg.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   const graph=[],apiErrors=[];
   pg.on('request',r=>{try{const u=new URL(r.url());if(u.pathname==='/b46-receiver-v1/graph')graph.push(u.pathname+u.search)}catch{}});
   pg.on('pageerror',e=>apiErrors.push(e.message.slice(0,200)));
   const resp=await pg.goto(origin+'/index.html?sidebarReleaseQa='+mode.name,{waitUntil:'domcontentloaded',timeout:65000});
   assert(resp?.ok(),'HOME_HTTP_FAILURE_'+label+'_'+mode.name);
   await pg.waitForFunction(()=>window.__B46_SIDEBAR_HYDRATE?.initialized===true,null,{timeout:10000});
   await pg.waitForFunction(()=>document.querySelector('[data-b46-rate-snapshot="all"]')?.dataset.b46MonitorLive==='1',null,{timeout:16000});
   const paint=async()=>pg.evaluate(()=>{
     let cached=null;try{cached=JSON.parse(sessionStorage.getItem('b46:receiver-sidebar-rates:v1')||'null')?.snapshot}catch{}
     const nodes=[...document.querySelectorAll('[data-b46-rate-snapshot]')];
     return {state:{...window.__B46_SIDEBAR_HYDRATE},rates:Object.fromEntries(nodes.map(n=>[n.dataset.b46RateSnapshot,{value:n.textContent.trim(),live:n.dataset.b46MonitorLive==='1',sequence:Number(n.dataset.b46MonitorSequence)}])),cached,
     hydration:!!document.getElementById('b46-sidebar-winrate-production'),odds:!!document.getElementById('b46-odds-flash-runtime-production'),premium:!!document.getElementById('b46-premium-match-production')};
   });
   const first=await paint();
   assert(first.hydration&&first.odds&&first.premium,'PRIOR_FRONTEND_ELEMENTS_DROPPED');
   assert(first.cached&&Number.isSafeInteger(first.cached.sequence),'SAVED_RECEIVER_SNAPSHOT_MISSING');
   assert.equal(first.state.version,'20261121-v1','HYDRATOR_VERSION_CHANGED');
   assert.equal(first.state.requests,1,'FIRST_VISIT_MORE_THAN_ONE_GRAPH_LOAD');
   assert.equal(graph.length,1,'FIRST_VISIT_GRAPH_GET_COUNT_WRONG');
   for(const k of keys){
     const v=first.cached.rates[k];
     assert(first.rates[k],'SIDEBAR_RATE_KEY_NOT_FOUND_'+k);
     assert.equal(first.rates[k].value,v===null?'—':v.toFixed(2)+'%','SIDEBAR_RATE_MISMATCH_'+k);
     assert(first.rates[k].live,'SIDEBAR_NOT_REPAINTED_'+k);
   }
   console.log('SIDEBAR_CANDIDATE_INITIAL_PASS '+label+' '+mode.name+' '+JSON.stringify({graphCount:graph.length,requests:first.state.requests,sequence:first.cached.sequence,rates:first.rates}));
   await pg.reload({waitUntil:'domcontentloaded',timeout:65000});
   await pg.waitForFunction(()=>window.__B46_SIDEBAR_HYDRATE?.initialized===true,null,{timeout:10000});
   const second=await paint();
   assert(second.cached&&second.cached.sequence>=first.cached.sequence,'SESSION_SNAPSHOT_ROLLBACK');
   assert.equal(second.state.requests,0,'CACHED_RELOAD_ADDED_GRAPH_REQUEST');
   assert.equal(second.rates.all.live,true,'CACHED_RELOAD_NOT_READY');
   console.log('SIDEBAR_CANDIDATE_RELOAD_PASS '+label+' '+mode.name+' '+JSON.stringify({source:second.state.source,sequence:second.cached.sequence,requests:second.state.requests}));
   const beforeClicks=graph.length;
   await pg.goto(origin+'/index.html?view=statistics&market=1x2',{waitUntil:'domcontentloaded',timeout:65000});
   await pg.waitForFunction(()=>window.__B46_SIDEBAR_HYDRATE?.initialized===true,null,{timeout:10000});
   const nav=await paint();
   assert(nav.rates.all.live&&nav.rates['1x2'].live,'NAV_STATS_MENU_BLANK');
   assert.equal(nav.state.requests,0,'NAVIGATION_GENERATED_EXTRA_SIDEBAR_GRAPH');
   console.log('SIDEBAR_CANDIDATE_NAV_PASS '+label+' '+mode.name+' '+JSON.stringify({rate:nav.rates.all.value,oneXtwo:nav.rates['1x2'].value,extraGraph:graph.length-beforeClicks}));
   assert.deepEqual(apiErrors,[],'BROWSER_SCRIPT_ERRORS_'+mode.name);
   await pg.screenshot({path:'audit/'+label+'-'+mode.name+'.png'});
   results[mode.name]={first,second,nav};
   await context.close();
  }
 }finally{await browser.close()}
 return results;
}
async function health(){const res={};for(const path of ['/api/engine/health','/api/full-market/health']){const x=JSON.parse(await read(HOME+path));assert(x.ok===true,'BACKEND_NOT_HEALTHY_'+path);res[path]=x.version||x.revision||null;}return res}
async function rollback(){
 if(!activated)return;
 const a=await active();if(a===base)return;assert.equal(a,candidate,'OTHER_VERSION_ACTIVE_ABORT_ROLLBACK');
 await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback '+MARK}})});
 assert.equal(await active(),base,'ROLLBACK_FAILED');report.rollback=base;save();
}
try{
 const p=prepare(JSON.parse(await read(TEST+'/__sidebar_health')));
 report.testReference={revision:'SIDEBAR_WINRATE_BOOTSTRAP_20261121_V1',jsSha:sha(p.js)};save();
 base=await active();report.beforeVersion=base;save();
 const old=await version(base),source=main(old);parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const beforeSettings=same(await settings()),beforeCrons=same(await crons()),beforeHealth=await health();
 const homeBefore=await read(HOME+'/index.html'),directBefore=await read(DIRECT+'/index.html');
 report.originComparison={customHash:sha(homeBefore),directHash:sha(directBefore),customLength:homeBefore.length,directLength:directBefore.length,same:sha(homeBefore)===sha(directBefore)};
 report.premiumBaseline={priorSourceMarker:source.includes('B46_PREMIUM_MATCH_CARDS_20261121'),publicHtmlStyle:homeBefore.includes('b46-premium-match-production'),directHtmlStyle:directBefore.includes('b46-premium-match-production'),publicHasOdds:homeBefore.includes('b46-odds-flash-production'),directHasOdds:directBefore.includes('b46-odds-flash-production')};
 console.log('ODDS_PRODUCTION_BASELINE',JSON.stringify(report.premiumBaseline));
 save();
 assert(report.premiumBaseline.publicHtmlStyle&&report.premiumBaseline.directHtmlStyle,'EXISTING_PREMIUM_PRESENTATION_NOT_SERVED_STOP');
 assert(homeBefore.includes('<html')&&directBefore.includes('<html')&&homeBefore.includes('</html>')&&directBefore.includes('</html>'),'PRODUCTION_ORIGIN_HTML_INVALID');
 report.guards={mainSha:sha(source),settingsSha:sha(beforeSettings),crons:beforeCrons,health:beforeHealth,indexSha:sha(homeBefore)};save();
 const patched=patchWorker(source,p);
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');
 candidate=await upload(old,patched);report.candidateVersion=candidate;save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_AFTER_UPLOAD');
 verify(await version(candidate),old,patched);
 const preview='https://'+candidate.slice(0,8)+'-'+SCRIPT+'.mccarey-supon.workers.dev';
 report.preview=preview;save();
 const html=await read(preview+'/index.html');
 assert(html.includes(MARK)&&html.includes('b46-sidebar-winrate-production')&&html.includes('b46-odds-flash-production'),'CANDIDATE_PREVIEW_NOT_PATCHED');
 report.previewBrowser=await browserCheck(preview,'candidate',p,true);save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
 assert.equal(same(await settings()),beforeSettings,'PRODUCTION_SETTINGS_MOVED');
 assert.equal(same(await crons()),beforeCrons,'PRODUCTION_SCHEDULES_MOVED');
 const deploymentResult=await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Deploy '+MARK}})});
 activated=true;
 console.log('ODDS_DEPLOY_ACTIVATION_RESPONSE',JSON.stringify({beforeVersion:base,candidateVersion:candidate,apiResult:deploymentResult}));
 let observedVersion=null;
 for(let attempt=0;attempt<20;attempt++){
  observedVersion=await active();
  console.log('ODDS_ACTIVE_VERSION_PROPAGATION',JSON.stringify({attempt,observedVersion,candidateVersion:candidate,originalVersion:base}));
  if(observedVersion===candidate)break;
  assert.equal(observedVersion,base,'FOREIGN_PRODUCTION_VERSION_AFTER_CANDIDATE_ACTIVATION');
  await delay(1600);
 }
 assert.equal(observedVersion,candidate,'CANDIDATE_NOT_ACTIVE_AFTER_PROPAGATION_WINDOW');
 let live=false;for(let i=0;i<40;i++){try{const h=await read(HOME+'/index.html');if(h.includes(MARK)&&h.includes('b46-sidebar-winrate-production')){live=true;break}}catch{}await delay(1200)}
 assert(live,'PRODUCTION_STYLE_NOT_PROPAGATED');
 report.production=await browserCheck(HOME,'production',p,true);
 verify(await version(candidate),old,patched);
 assert.equal(same(await settings()),beforeSettings,'SETTINGS_CHANGED');assert.equal(same(await crons()),beforeCrons,'SCHEDULES_CHANGED');
 assert.deepEqual(await health(),beforeHealth,'ENGINE_HEALTH_REVISION_CHANGED');
 assert.equal(await active(),candidate,'PRODUCTION_VERSION_DRIFT');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_SIDEBAR_WINRATE_PRODUCTION_SUCCESS '+JSON.stringify({before:base,after:candidate,jsSha:sha(p.js)}));
}catch(e){
 report.error=String(e?.stack||e);report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(re){report.rollbackError=String(re?.stack||re);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
