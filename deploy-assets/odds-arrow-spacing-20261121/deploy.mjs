import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {oddsMovementStyles,oddsMovementScript} from './odds-movement.mjs';
import {oddsMovementStyles as originalOddsCss,oddsMovementScript as originalOddsJs} from './odds-movement-baseline.mjs';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const SCRIPT='ball46-production',MARK='B46_ODDS_ARROW_SPACING_20261121';
const TEST='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const HOME='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={marker:MARK,scope:'Replace only the inline odds flash CSS inside the current production head literal; preserve the existing 2-second odds event script, sidebar Win Rate snapshot hydrator, Engine, API, bindings, assets and schedules.'};
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
 assert(h?.ok===true&&h.scope==='TEST_ONLY_CSS'&&h.revision==='PREMIUM_LEAGUE_SOLID_V14','APPROVED_TEST_REVISION_DRIFT');
 assert.equal(h.oddsMovement,'DOM_PRICES_V1','TEST_ODDS_MOVEMENT_NOT_ENABLED');
 assert.equal(h.oddsMovementStyle,oddsMovementStyles,'TEST_ODDS_SPACING_ASSET_DRIFT');
 assert.equal(h.oddsMovementScript,oddsMovementScript,'TEST_ODDS_MOVEMENT_RUNTIME_DRIFT');
 assert(oddsMovementStyles.includes('inset:0 -4px 0 0!important'),'INSET_6PX_BG_NOT_FOUND');
 assert(oddsMovementStyles.includes('right:2px!important')&&oddsMovementStyles.includes('border-radius:6px!important'),'ARROW_OR_ROUNDING_LOST');
 assert(oddsMovementStyles.includes('rgba(42,163,103,.20)')&&oddsMovementStyles.includes('rgba(178,65,74,.19)'),'MOVEMENT_COLORS_DRIFT');
 assert(oddsMovementStyles.includes('background-color:transparent!important'),'DUPLICATE_COLOR_LAYER');
 assert(oddsMovementScript.includes('DURATION=2000')&&oddsMovementScript.includes('--b46-odds-arrow-y'),'FLASH_DURATION_OR_CENTER_LOST');
 assert(originalOddsCss.includes('right:2px!important')&&!originalOddsCss.includes('inset:0 -4px'),'BASELINE_CSS_MISMATCH');
 assert.equal(oddsMovementScript,originalOddsJs,'UNEXPECTED_ODDS_EVENT_SCRIPT_CHANGE');
 assert(oddsMovementStyles.includes('min-width:1024px')&&oddsMovementStyles.includes('data-theme="dark"'),'DARK_DESKTOP_SCOPE_NOT_PRESERVED');
 assert(!oddsMovementStyles.includes('</style>')&&!oddsMovementScript.includes('</script>'),'UNSAFE_CLOSING_TAG');
 return {css:oddsMovementStyles,js:oddsMovementScript};
}
function patchWorker(source,p){
 assert(!source.includes(MARK),'ODDS_SPACING_ALREADY_DEPLOYED');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const declarations=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.filter(d=>d.id.name==='__b46HeadOddsFlash20261121'):[]);
 assert.equal(declarations.length,1,'ODDS_HEAD_LITERAL_NOT_FOUND');
 const lit=declarations[0].init;
 assert(lit?.type==='Literal'&&typeof lit.value==='string','ODDS_HEAD_NOT_STRING_LITERAL');
 const old=lit.value;
 const prefix='<!-- B46_ODDS_FLASH_ROUNDED_ARROW_20261121 --><style id="b46-odds-flash-production">';
 assert(old.startsWith(prefix),'PRIOR_ODDS_RELEASE_NOT_PRESENT');
 const styleEnd='</style><script id="b46-odds-flash-runtime-production">';
 const boundary=old.indexOf(styleEnd,prefix.length);
 assert(boundary>prefix.length,'ODDS_CSS_JS_BOUNDARY_CHANGED');
 const beforeCss=old.slice(prefix.length,boundary);
 assert.equal(beforeCss,originalOddsCss,'PRODUCTION_ODDS_BASELINE_CSS_DRIFT');
 const afterStyle=old.slice(boundary);
 assert(afterStyle.includes(originalOddsJs),'EXISTING_ODDS_JS_DRIFT');
 assert(afterStyle.includes('b46-sidebar-winrate-production')&&afterStyle.includes('B46_SIDEBAR_WINRATE_HYDRATE_20261121'),'SIDEBAR_HYDRATOR_NOT_PRESERVED');
 assert(!old.includes('inset:0 -4px'),'ALREADY_HAS_SPACING_MODIFICATION');
 const updated=prefix+p.css+afterStyle;
 const literal=JSON.stringify(updated);
 const patched=source.slice(0,lit.start)+literal+source.slice(lit.end);
 assert.equal(patched.slice(0,lit.start),source.slice(0,lit.start),'UNRELATED_CODE_CHANGED_BEFORE');
 assert.equal(patched.slice(lit.start+literal.length),source.slice(lit.end),'UNRELATED_CODE_CHANGED_AFTER');
 parse(patched,{ecmaVersion:'latest',sourceType:'module'});
 return patched;
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
  const modes=[{name:'desktop-dark',w:1440,theme:'dark'},{name:'desktop-light',w:1440,theme:'light'},{name:'mobile-dark',w:390,theme:'dark'}];
  for(const m of modes){
   if(!full&&m.name!=='desktop-dark')continue;
   const context=await browser.newContext({viewport:{width:m.w,height:920},serviceWorkers:'block'});
   const page=await context.newPage();
   await page.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),m.theme);
   await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
   const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,250)));
   const http=await page.goto(origin+'/index.html?arrowSpacingQA='+m.name+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:65000});
   assert(http?.ok(),'QA_HTML_HTTP_FAILED_'+m.name);
   await page.waitForFunction(()=>window.__b46OddsMovementStats?.ready===true,null,{timeout:30000});
   const init=await page.evaluate(()=>{
    return {
     theme:document.documentElement.dataset.theme,
     desktop:matchMedia('(min-width:1024px)').matches,
     oddsStyle:!!document.getElementById('b46-odds-flash-production'),
     oddsRuntime:!!document.getElementById('b46-odds-flash-runtime-production'),
     sidebarHydrator:!!document.getElementById('b46-sidebar-winrate-production'),
     premiumStyle:!!document.getElementById('b46-premium-match-production'),
     observerStats:{...window.__b46OddsMovementStats}
    };
   });
   assert.equal(init.theme,m.theme,'THEME_WRONG_'+m.name);
   assert.equal(init.desktop,m.w>=1024,'MEDIA_SCOPE_BAD_'+m.name);
   assert(init.oddsStyle&&init.oddsRuntime&&init.sidebarHydrator&&init.premiumStyle,'PRIOR_PRODUCTION_SCRIPTS_LOST_'+m.name);
   if(m.name==='desktop-dark'){
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-match-id].match-row .market-cell')].some(e=>e.getBoundingClientRect().width>20),null,{timeout:70000});
    const proof=await page.evaluate(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const native=[...document.querySelectorAll('[data-match-id].match-row')].find(e=>e.getBoundingClientRect().width>100&&e.querySelector('.market-cell'));
      if(!native)return {error:'NATIVE_MATCH_ROW_NOT_FOUND'};
      const originalWidth=native.getBoundingClientRect().width;
      const fixture=document.createElement('div');
      fixture.className='match-row';
      fixture.dataset.matchId='B46_ARROW_SPACING_QA_FIXTURE_20261121';
      fixture.style.cssText='position:fixed;left:-120px;top:-120px;width:110px;height:44px;pointer-events:none;';
      fixture.innerHTML='<div class="market-cell market-cell-1x2" title="QA · Browser DOM Only"><div class="b46-v3-quote" data-side="H"><i>H</i><strong data-b46-align="1x2-H" data-nomad-odds-raw="1.90">1.90</strong></div></div>';
      document.body.append(fixture);
      const q=fixture.querySelector('.b46-v3-quote'),n=fixture.querySelector('strong');
      const capture=()=>{
       const qs=getComputedStyle(q),bg=getComputedStyle(q,'::before'),arr=getComputedStyle(q,'::after'),qr=q.getBoundingClientRect(),nr=n.getBoundingClientRect();
       return {direction:q.dataset.b46OddsMove||null,backplate:bg.backgroundColor,plateRight:bg.right,plateRadius:bg.borderTopLeftRadius,plateShadow:bg.boxShadow,quoteBg:qs.backgroundColor,quoteShadow:qs.boxShadow,quoteWidth:qr.width,arrowRight:arr.right,arrow:arr.content,visualInset:parseFloat(arr.right)-parseFloat(bg.right),numberGap:null,arrowOffsetCenter:(qr.top+parseFloat(arr.top))-(nr.top+nr.height/2),rowWidth:native?.isConnected?native.getBoundingClientRect().width:null};
      };
      try{
       await sleep(500);
       const before=capture();
       n.setAttribute('data-nomad-odds-raw','1.97');n.textContent='1.97';
       await sleep(160);const up=capture();
       await sleep(1040);const upStill=capture();
       await sleep(1150);const upCleared=capture();
       n.setAttribute('data-nomad-odds-raw','1.97');n.textContent='1.97';
       await sleep(140);const unchanged=capture();
       n.setAttribute('data-nomad-odds-raw','1.90');n.textContent='1.90';
       await sleep(160);const down=capture();
       await sleep(2080);const downCleared=capture();
       return {originalWidth,before,up,upStill,upCleared,unchanged,down,downCleared,stats:{...window.__b46OddsMovementStats}};
      }finally{fixture.remove()}
    });
    assert(!proof.error,'NO_NATIVE_MATCH_OR_FIXTURE');
    assert.equal(proof.before.direction,null,'FALSE_FLASH_ON_LOAD');
    assert.equal(proof.up.direction,'up','UP_ODDS_FLASH_MISSING');
    assert.equal(proof.down.direction,'down','DOWN_ODDS_FLASH_MISSING');
    assert.equal(proof.upStill.direction,'up','TWO_SECOND_FLASH_TOO_SHORT');
    assert.equal(proof.upCleared.direction,null,'UP_FLASH_DID_NOT_RESET');
    assert.equal(proof.downCleared.direction,null,'DOWN_FLASH_DID_NOT_RESET');
    assert.equal(proof.unchanged.direction,null,'UNCHANGED_ODDS_FLASHED');
    for(const [name,v,color,arrow] of [['up',proof.up,'rgba(42, 163, 103, 0.2)','↑'],['down',proof.down,'rgba(178, 65, 74, 0.19)','↓']]){
      assert.equal(v.backplate,color,'ODDS_BACKPLATE_COLOR_CHANGED_'+name);
      assert.equal(v.quoteBg,'rgba(0, 0, 0, 0)','DUPLICATE_ODDS_COLOR_LAYER_'+name);
      assert.equal(v.plateRight,'-4px','ODDS_PLATE_NOT_EXTENDED_'+name);
      assert.equal(v.arrowRight,'2px','ODDS_ARROW_BASE_POSITION_CHANGED_'+name);
      assert.equal(v.visualInset,6,'ODDS_ARROW_VISIBLE_INSET_NOT_6PX_'+name);
      assert.equal(v.plateRadius,'6px','ODDS_ROUNDING_CHANGED_'+name);
      assert.equal(v.plateShadow,'none','ODDS_BACKPLATE_SHADOW_'+name);
      assert.equal(v.quoteShadow,'none','ODDS_QUOTE_SHADOW_'+name);
      assert(v.arrow.includes(arrow),'ODDS_ARROW_MISSING_'+name);
      assert(Math.abs(v.arrowOffsetCenter)<=1,'ODDS_ARROW_NOT_CENTERED_'+name);
      assert(Math.abs(v.rowWidth-proof.originalWidth)<1,'MATCH_ROW_WIDTH_CHANGED_'+name);
    }
    assert(proof.stats.ups>=1&&proof.stats.downs>=1,'PRICE_MOVEMENT_DETECTOR_NOT_WORKING');
    console.log('ODDS_ARROW_SPACING_6PX_PASS '+label+' '+JSON.stringify({initial:init,proof}));
    results[m.name]={initial:init,proof};
   }else{
    const meta=await page.evaluate(()=>{
      const css=document.getElementById('b46-odds-flash-production');
      const media=css?.sheet?.cssRules?.[0];
      return {media:media?.conditionText||'',activeQuotes:document.querySelectorAll('[data-b46-odds-move]').length};
    });
    assert(meta.media.includes('min-width: 1024px'),'MOBILE_CSS_MEDIA_GUARD_LOST');
    assert(m.name==='desktop-light'?init.theme==='light':!init.desktop,'ODDS_DARK_DESKTOP_SCOPE_INVALID');
    assert.equal(meta.activeQuotes,0,'UNEXPECTED_FLASH_OUTSIDE_DARK_DESKTOP');
    console.log('ODDS_ARROW_SPACING_UNCHANGED_VIEW '+label+' '+m.name+' '+JSON.stringify({init,meta}));
    results[m.name]={initial:init,meta};
   }
   assert.deepEqual(errors,[],'BROWSER_ERRORS_'+m.name);
   await page.screenshot({path:'audit/'+label+'-'+m.name+'.png'});
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
 const p=prepare(JSON.parse(await read(TEST+'/_premium_health')));
 report.testReference={revision:'ODDS_ARROW_SPACING_6PX_20261121',cssSha:sha(p.css),jsSha:sha(p.js)};save();
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
 assert(html.includes('b46-sidebar-winrate-production')&&html.includes('b46-odds-flash-production')&&html.includes('inset:0 -4px 0 0!important'),'CANDIDATE_PREVIEW_NOT_UPDATED');
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
 let live=false;for(let i=0;i<40;i++){try{const h=await read(HOME+'/index.html');if(h.includes('b46-sidebar-winrate-production')&&h.includes('inset:0 -4px 0 0!important')){live=true;break}}catch{}await delay(1200)}
 assert(live,'PRODUCTION_STYLE_NOT_PROPAGATED');
 report.production=await browserCheck(HOME,'production',p,true);
 verify(await version(candidate),old,patched);
 assert.equal(same(await settings()),beforeSettings,'SETTINGS_CHANGED');assert.equal(same(await crons()),beforeCrons,'SCHEDULES_CHANGED');
 assert.deepEqual(await health(),beforeHealth,'ENGINE_HEALTH_REVISION_CHANGED');
 assert.equal(await active(),candidate,'PRODUCTION_VERSION_DRIFT');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_ODDS_ARROW_SPACING_PRODUCTION_SUCCESS '+JSON.stringify({before:base,after:candidate,cssSha:sha(p.css),jsSha:sha(p.js)}));
}catch(e){
 report.error=String(e?.stack||e);report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(re){report.rollbackError=String(re?.stack||re);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
