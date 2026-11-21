import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const SCRIPT='ball46-production',MARK='B46_PREMIUM_MATCH_CARDS_20261121';
const TEST='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const HOME='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={marker:MARK,scope:'Dark desktop match card styling only; assets, original runtime, bindings, schedules, API, light and mobile are protected'};
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
function prepare(p){
 assert(p?.ok&&p.scope==='TEST_ONLY_CSS'&&p.revision==='PREMIUM_LEAGUE_SOLID_V14','TEST_WORKER_REVISION_MISMATCH');
 const css=p.css,js=p.reference?.activationScript;
 assert(typeof css==='string'&&css.length>500&&css.length<40000,'CSS_NOT_FOUND');
 assert(typeof js==='string'&&js.includes('data-b46-premium-interacted'),'ACTIVATION_SCRIPT_MISSING');
 assert(css.includes('.league-head')&&css.includes('.market-cell')&&css.includes('b46PremiumMatch'),'STYLES_INCOMPLETE');
 assert(css.includes('min-width:1024px')&&css.includes('data-theme="dark"'),'DESKTOP_DARK_SCOPE_MISSING');
 assert(p.reference.leagueColor==='rgb(11, 25, 23)'&&p.reference.pitColor==='rgb(9, 22, 20)','STYLE_REFERENCE_DRIFT');
 assert(p.reference.hoverTint===p.reference.activeTint,'ACTIVE_HOVER_MISMATCH');
 assert(!css.includes('</style>')&&!js.includes('</script>'),'INLINE_CLOSING_TAG_FOUND');
 return {css,js,league:p.reference.leagueColor,pit:p.reference.pitColor};
}
function patchWorker(source,p){
 assert(!source.includes(MARK),'PRODUCTION_ALREADY_PATCHED');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const ex=ast.body.filter(x=>x.type==='ExportDefaultDeclaration');
 assert(ex.length===1&&source.slice(ex[0].end).trim()==='','WORKER_EXPORT_UNEXPECTED');
 const original=source.slice(ex[0].declaration.start,ex[0].declaration.end);
 const prefix=source.slice(0,ex[0].start);
 const fragment='<!-- '+MARK+' --><style id="b46-premium-match-production">'+p.css+'</style><script id="b46-premium-user-action-production">'+p.js+'</script>';
 const wrapper=
   'const __b46BeforePremium20261121='+original+';\n'+
   'const __b46HeadPremium20261121='+JSON.stringify(fragment)+';\n'+
   'const __b46Premium20261121={...__b46BeforePremium20261121,async fetch(req,env,ctx){\n'+
   ' const response=await __b46BeforePremium20261121.fetch.call(__b46BeforePremium20261121,req,env,ctx);\n'+
   ' const url=new URL(req.url);\n'+
   ' if(req.method!=="GET"||!["/","/index.html","/index"].includes(url.pathname)||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;\n'+
   ' const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.delete("content-encoding");\n'+
   ' return new HTMLRewriter().on("head",{element(e){e.prepend(__b46HeadPremium20261121,{html:true})}}).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));\n'+
   '}};\nexport default __b46Premium20261121;\n';
 const result=prefix+wrapper;parse(result,{ecmaVersion:'latest',sourceType:'module'});return result;
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
 try{
  for(const cfg of [{name:'pc-dark',width:1440,theme:'dark'},{name:'pc-light',width:1440,theme:'light'},{name:'mobile-dark',width:390,theme:'dark'}]){
   if(!full&&cfg.name!=='pc-dark')continue;
   const pg=await browser.newPage({viewport:{width:cfg.width,height:950},serviceWorkers:'block'});
   await pg.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),cfg.theme);
   await pg.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   await pg.goto(origin+'/?releaseProbe='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
   await pg.waitForFunction(()=>[...document.querySelectorAll('[data-match-id].match-row')].some(x=>x.getBoundingClientRect().width>100&&x.querySelector('.market-cell')),null,{timeout:90000});
   const proof=await pg.evaluate(()=>{
    const visible=e=>e&&e.getBoundingClientRect().width>100&&e.getBoundingClientRect().height>15;
    const row=[...document.querySelectorAll('[data-match-id].match-row')].find(visible);
    const league=[...document.querySelectorAll('.league-head')].find(visible);
    const odds=row?.querySelector('.market-cell');
    const style=e=>{const s=getComputedStyle(e);return {bg:s.backgroundImage,color:s.backgroundColor,shadow:s.boxShadow,divider:s.borderBottomWidth,state:s.getPropertyValue('--b46-premium-state').trim()}};
    return {row:row?style(row):null,league:league?style(league):null,odds:odds?style(odds):null,initial:[...document.querySelectorAll('[data-match-id].match-row.active')].filter(visible).map(style),clicked:document.body.hasAttribute('data-b46-premium-interacted'),marker:!!document.getElementById('b46-premium-match-production'),script:!!document.getElementById('b46-premium-user-action-production')};
   });
   assert(proof.marker&&proof.script,'PREMIUM_NOT_PRESENT_'+cfg.name);assert(proof.row&&proof.league&&proof.odds,'MATCH_MARKUP_NOT_READY');
   if(cfg.name==='pc-dark'){
    assert.equal(proof.league.color,p.league,'LEAGUE_COLOR_WRONG');
    assert.equal(proof.league.bg,'none','LEAGUE_HAS_GRADIENT');
    assert.equal(proof.league.divider,'1px','LEAGUE_DIVIDER_WRONG');
    assert.equal(proof.odds.color,p.pit,'ODDS_COLOR_WRONG');
    assert.equal(proof.odds.bg,'none','ODDS_HAS_GRADIENT');
    assert(proof.odds.shadow.includes('inset'),'ODDS_RECESS_MISSING');
    assert(proof.row.bg.startsWith('linear-gradient(90deg'),'MATCH_GRADIENT_WRONG');
    assert(!proof.clicked&&proof.initial.every(x=>x.state==='normal'),'DEFAULT_ROW_ALREADY_ACTIVE');
    const target=pg.locator('[data-match-id].match-row:visible:not(.active)').filter({has:pg.locator('.market-cell')}).first();
    await target.hover({position:{x:100,y:30}});
    assert.equal(await target.evaluate(e=>getComputedStyle(e).getPropertyValue('--b46-premium-state').trim()),'hover','HOVER_NOT_APPLIED');
    const oddsBefore=await target.locator('.market-cell').first().evaluate(e=>{const s=getComputedStyle(e);return [s.backgroundImage,s.backgroundColor,s.boxShadow]});
    const chosenId=await target.getAttribute('data-match-id');
    await target.click({position:{x:100,y:30}});await pg.mouse.move(0,0);
    const afterClick=await pg.evaluate(id=>{const e=[...document.querySelectorAll('[data-match-id].match-row')].find(x=>x.dataset.matchId===id);return {id,chosenClass:e?.className,chosenState:e?getComputedStyle(e).getPropertyValue('--b46-premium-state').trim():null,clicked:document.body?.getAttribute('data-b46-premium-interacted'),nativeActiveIds:[...document.querySelectorAll('[data-match-id].match-row.active')].map(x=>x.dataset.matchId).slice(0,8),script:!!document.getElementById('b46-premium-user-action-production'),scriptRan:!!window.__b46PremiumUserAction}},chosenId);
    console.log('PREMIUM_CLICK_DIAG '+label+' '+JSON.stringify(afterClick));
    await pg.waitForFunction(id=>{const e=[...document.querySelectorAll('[data-match-id].match-row')].find(x=>x.dataset.matchId===id);return e?.classList.contains('active')&&document.body?.getAttribute('data-b46-premium-interacted')==='1'&&getComputedStyle(e).getPropertyValue('--b46-premium-state').trim()==='active'},chosenId,{timeout:12000});
    assert.equal(await target.evaluate(e=>getComputedStyle(e).getPropertyValue('--b46-premium-state').trim()),'active','ACTIVE_NOT_APPLIED');
    const oddsAfter=await target.locator('.market-cell').first().evaluate(e=>{const s=getComputedStyle(e);return [s.backgroundImage,s.backgroundColor,s.boxShadow]});
    assert.deepEqual(oddsAfter,oddsBefore,'ODDS_CHANGED_ON_ACTIVE');
   }else{assert.notEqual(proof.league.color,p.league,'LIGHT_OR_MOBILE_OVERRIDDEN')}
   await pg.screenshot({path:'audit/'+label+'-'+cfg.name+'.png'});results[cfg.name]=proof;
   console.log('CANDIDATE_VISUAL_OK '+label+' '+cfg.name+' '+JSON.stringify(proof));
   await pg.close();
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
 const p=prepare(JSON.parse(await read(TEST+'/_premium_health')));
 report.testReference={revision:'PREMIUM_LEAGUE_SOLID_V14',cssSha:sha(p.css),jsSha:sha(p.js)};save();
 base=await active();report.beforeVersion=base;save();
 const old=await version(base),source=main(old);parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const beforeSettings=same(await settings()),beforeCrons=same(await crons()),beforeHealth=await health();
 const homeBefore=await read(HOME+'/index.html'),directBefore=await read(DIRECT+'/index.html');
 report.originComparison={customHash:sha(homeBefore),directHash:sha(directBefore),customLength:homeBefore.length,directLength:directBefore.length,same:sha(homeBefore)===sha(directBefore)};
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
 assert(html.includes(MARK)&&html.includes('b46-premium-match-production'),'CANDIDATE_PREVIEW_NOT_PATCHED');
 report.previewBrowser=await browserCheck(preview,'candidate',p,true);save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
 assert.equal(same(await settings()),beforeSettings,'PRODUCTION_SETTINGS_MOVED');
 assert.equal(same(await crons()),beforeCrons,'PRODUCTION_SCHEDULES_MOVED');
 await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Deploy '+MARK}})});
 activated=true;assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
 let live=false;for(let i=0;i<40;i++){try{const h=await read(HOME+'/index.html');if(h.includes(MARK)&&h.includes('b46-premium-match-production')){live=true;break}}catch{}await delay(1200)}
 assert(live,'PRODUCTION_STYLE_NOT_PROPAGATED');
 report.production=await browserCheck(HOME,'production',p,true);
 verify(await version(candidate),old,patched);
 assert.equal(same(await settings()),beforeSettings,'SETTINGS_CHANGED');assert.equal(same(await crons()),beforeCrons,'SCHEDULES_CHANGED');
 assert.deepEqual(await health(),beforeHealth,'ENGINE_HEALTH_REVISION_CHANGED');
 assert.equal(await active(),candidate,'PRODUCTION_VERSION_DRIFT');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_PREMIUM_CARDS_PRODUCTION_SUCCESS '+JSON.stringify({before:base,after:candidate,cssSha:sha(p.css)}));
}catch(e){
 report.error=String(e?.stack||e);report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(re){report.rollbackError=String(re?.stack||re);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
