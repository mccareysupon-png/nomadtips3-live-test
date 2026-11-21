import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {oddsMovementStyles,oddsMovementScript} from './odds-movement.mjs';
import {oddsMovementStyles as originalOddsCss,oddsMovementScript as originalOddsJs} from './odds-movement-baseline.mjs';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const SCRIPT='ball46-production',MARK='B46_ODDS_V3_TRIANGLE_20261121';
const TEST='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const HOME='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={marker:MARK,scope:'Replace only the current production inline odds movement CSS and script with the approved Test V3 5px filled triangle heads, 6 pulses in 6 seconds; preserve every other byte, module, assets, Engine, bindings, crons and sidebar.'};
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
 assert.equal(h.oddsMovement,'DOM_PRICES_V1','TEST_ODDS_MOVEMENT_MISSING');
 assert.equal(h.oddsMovementStyle,oddsMovementStyles,'APPROVED_TEST_CSS_DRIFT');
 assert.equal(h.oddsMovementScript,oddsMovementScript,'APPROVED_TEST_JS_DRIFT');
 const css=oddsMovementStyles,js=oddsMovementScript;
 for(const t of ['inset:0 -1px 0 0!important','border-radius:6px!important','b46-odds-card-pulse-6x 1s ease-in-out 0s 6','width:5px!important;height:5px!important','clip-path:polygon(50% 0,100% 100%,0 100%)!important','clip-path:polygon(0 0,100% 0,50% 100%)!important','left:var(--b46-odds-arrow-price-left,auto)!important','top:var(--b46-odds-arrow-price-center,50%)!important'])assert(css.includes(t),'APPROVED_STYLE_MISSING_'+t);
 for(const t of ['DURATION=6000','nr.right-qr.left+1.5','--b46-odds-arrow-price-left','--b46-odds-arrow-price-center'])assert(js.includes(t),'APPROVED_SCRIPT_MISSING_'+t);
 assert(originalOddsCss.includes('right:2px!important')&&originalOddsJs.includes('DURATION=2000'),'KNOWN_PRODUCTION_BASELINE_INVALID');
 assert(css.includes('min-width:1024px')&&css.includes('data-theme="dark"'),'SCOPE_DRIFT');
 assert(!css.includes('</style>')&&!js.includes('</script>'),'UNSAFE_INLINE_TAG');
 return {css,js};
}
function patchWorker(source,p){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const defs=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.filter(d=>d.id.name==='__b46HeadOddsFlash20261121'):[]);
 assert.equal(defs.length,1,'UNIQUE_PRODUCTION_ODDS_HEAD_LITERAL_MISSING');
 const lit=defs[0].init;assert(lit?.type==='Literal'&&typeof lit.value==='string','HEAD_NOT_STRING_LITERAL');
 const old=lit.value;
 const prefix='<!-- B46_ODDS_FLASH_ROUNDED_ARROW_20261121 --><style id="b46-odds-flash-production">';
 const splitter='</style><script id="b46-odds-flash-runtime-production">';
 assert(old.startsWith(prefix),'KNOWN_PRODUCTION_ODDS_MARKER_MISSING');
 assert(!old.includes(MARK),'V3_TRIANGLE_ALREADY_INSTALLED');
 const si=old.indexOf(splitter,prefix.length);assert(si>prefix.length,'KNOWN_CSS_JS_SPLIT_MISSING');
 const ji=si+splitter.length,je=old.indexOf('</script>',ji);assert(je>ji,'KNOWN_JS_END_MISSING');
 const oldCss=old.slice(prefix.length,si),oldJs=old.slice(ji,je),suffix=old.slice(je);
 if(oldCss!==originalOddsCss){
  let diff=0;while(diff<Math.min(oldCss.length,originalOddsCss.length)&&oldCss[diff]===originalOddsCss[diff])diff++;
  console.log('PRODUCTION_CSS_DRIFT_DIAGNOSTIC '+JSON.stringify({liveLength:oldCss.length,expectedLength:originalOddsCss.length,firstDiffIndex:diff,liveNear:oldCss.slice(Math.max(0,diff-160),diff+350),expectedNear:originalOddsCss.slice(Math.max(0,diff-160),diff+350),liveTail:oldCss.slice(-450)}));
 }
 assert.equal(oldCss,originalOddsCss,'LIVE_PRODUCTION_CSS_BASELINE_DRIFT_STOP');
 assert.equal(oldJs,originalOddsJs,'LIVE_PRODUCTION_ODDS_JS_BASELINE_DRIFT_STOP');
 assert(suffix.includes('b46-sidebar-winrate-production')&&suffix.includes('B46_SIDEBAR_WINRATE_HYDRATE_20261121'),'SIDEBAR_HYDRATOR_MISSING_STOP');
 assert(suffix.startsWith('</script>'),'PRIOR_SCRIPT_CLOSER_CHANGED');
 const next=prefix+'/* '+MARK+' */'+p.css+splitter+p.js+suffix;
 const str=JSON.stringify(next);
 const patched=source.slice(0,lit.start)+str+source.slice(lit.end);
 assert.equal(patched.slice(0,lit.start),source.slice(0,lit.start),'UNRELATED_SOURCE_PREFIX_CHANGED');
 assert.equal(patched.slice(lit.start+str.length),source.slice(lit.end),'UNRELATED_SOURCE_SUFFIX_CHANGED');
 assert(patched.includes('B46_SIDEBAR_WINRATE_HYDRATE_20261121'),'SIDEBAR_HYDRATOR_LOST');
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

async function browserCheck(origin,label,full){
 const browser=await chromium.launch();const results={};
 const profiles=full?[{name:'desktop-dark',w:1440,theme:'dark'},{name:'desktop-light',w:1440,theme:'light'},{name:'mobile-dark',w:390,theme:'dark'}]:[{name:'desktop-dark',w:1440,theme:'dark'}];
 try{
 for(const mode of profiles){
  const context=await browser.newContext({viewport:{width:mode.w,height:920},serviceWorkers:'block',reducedMotion:'no-preference'});
  const page=await context.newPage(),errors=[];
  await page.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),mode.theme);
  await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
  page.on('pageerror',e=>errors.push(e.message.slice(0,250)));
  const r=await page.goto(origin+'/index.html?oddsTriangleVerify='+label+'-'+mode.name+'-'+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
  assert(r?.ok(),'BROWSER_HTML_HTTP_ERROR_'+label+'_'+mode.name);
  await page.waitForFunction(()=>window.__b46OddsMovementStats?.ready===true,null,{timeout:45000});
  const init=await page.evaluate(()=>({
   theme:document.documentElement.dataset.theme,
   newStyle:document.getElementById('b46-odds-flash-production')?.textContent.includes('B46_ODDS_V3_TRIANGLE_20261121'),
   newRuntime:!!document.getElementById('b46-odds-flash-runtime-production'),
   sidebarHydrator:!!document.getElementById('b46-sidebar-winrate-production'),
   premiumMatch:!!document.getElementById('b46-premium-match-production'),
   media:document.getElementById('b46-odds-flash-production')?.sheet?.cssRules?.[0]?.conditionText||''
  }));
  assert.equal(init.theme,mode.theme,'THEME_NOT_CORRECT_'+mode.name);
  assert(init.newStyle&&init.newRuntime&&init.sidebarHydrator&&init.premiumMatch,'PRODUCTION_STYLES_OR_SIDEBAR_LOST_'+mode.name);
  assert(init.media.includes('min-width: 1024px'),'DESKTOP_SCOPE_NOT_PRESENT_'+mode.name);
  if(mode.name==='desktop-dark'){
   await page.waitForFunction(()=>[...document.querySelectorAll('[data-match-id].match-row .market-cell .b46-v3-quote strong[data-nomad-odds-raw]')].some(e=>e.getBoundingClientRect().width>0&&Number(e.getAttribute('data-nomad-odds-raw'))>1),null,{timeout:65000});
   const data=await page.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const real=[...document.querySelectorAll('[data-match-id].match-row .market-cell .b46-v3-quote strong[data-nomad-odds-raw]')].find(e=>e.getBoundingClientRect().width>0);
    if(!real)return {error:'NO_NATIVE_ODDS'};
    const nativeFont=getComputedStyle(real).fontSize;
    if(nativeFont!=='11.5px')return {error:'LIVE_NUMBER_FONT_CHANGED_'+nativeFont};
    // Browser-local fixture makes the differential test deterministic while retaining the actual DOM/CSS/MutationObserver.
    // No upstream prices, Worker storage, API, production records, or Engine are mutated.
    const fixture=document.createElement('div');fixture.className='match-row';
    fixture.setAttribute('data-match-id','B46_QA_LOCAL_TRIANGLE_PROD_20261121');
    fixture.style.cssText='position:fixed;left:-250px;top:-250px;width:180px;height:100px;pointer-events:none;';
    fixture.innerHTML='<div class="market-cell market-cell-1x2" title="QA · Browser Only"><div class="market-prices b46-v3-quotes" style="--b46-quote-count:3"><div class="market-quote b46-v3-quote" data-side="H"><i>H</i><strong data-b46-align="1x2-H" data-nomad-odds-raw="1.90">1.90</strong></div></div><small>QA</small></div>';
    document.body.append(fixture);
    const n=fixture.querySelector('strong'),q=fixture.querySelector('.b46-v3-quote'),cell=q.closest('.market-cell');
    n.style.fontSize=nativeFont;
    const width=q.getBoundingClientRect().width,cellWidth=cell.getBoundingClientRect().width,original={text:n.textContent,raw:n.getAttribute('data-nomad-odds-raw')},val=Number(original.raw);
    const sample=()=>{
     const qr=q.getBoundingClientRect(),nr=n.getBoundingClientRect(),ps=getComputedStyle(q,'::after'),plate=getComputedStyle(q,'::before'),style=getComputedStyle(q),num=getComputedStyle(n);
     return {
      direction:q.getAttribute('data-b46-odds-move'),arrowContent:ps.content,arrowFill:ps.backgroundColor,clip:ps.clipPath,
      arrowWidth:ps.width,arrowHeight:ps.height,arrowGap:qr.left+parseFloat(ps.left)-nr.right,arrowCenterOffset:qr.top+parseFloat(ps.top)-nr.top-nr.height/2,
      numFont:num.fontSize,numColor:num.color,plateColor:plate.backgroundColor,plateRadius:plate.borderTopLeftRadius,plateRight:plate.right,
      cycles:style.animationIterationCount,period:style.animationDuration,animation:style.animationName,
      quoteWidth:qr.width,cellWidth:cell.getBoundingClientRect().width
     };
    };
    const set=async v=>{const s=v.toFixed(2);n.setAttribute('data-nomad-odds-raw',s);n.textContent=s;await sleep(230)};
    try{
     await sleep(400);const initial=sample();await set(val+.07);const up=sample();
     await sleep(6400);const afterUp=sample();
     await set(val);const down=sample();
     await sleep(6400);const afterDown=sample();
     return {initial,up,afterUp,down,afterDown,original,originalQuoteWidth:width,originalCellWidth:cellWidth,realPriceFont:nativeFont,stats:{...window.__b46OddsMovementStats}};
    }finally{fixture.remove()}
   });
   assert(!data.error,'NO_ODDS_TEST_DATA');
   const moves=[['up',data.up,'rgb(121, 225, 172)','rgb(42, 163, 103)'],['down',data.down,'rgb(255, 159, 165)','rgb(178, 65, 74)']];
   assert.equal(data.initial.direction,null,'ODDS_ALREADY_FLASHING_ON_LOAD');
   for(const [dir,s,color] of moves){
    assert.equal(s.direction,dir,'ODDS_FLASH_NOT_DETECTED_'+dir);
    assert.equal(s.arrowContent,'""','ARROW_SHAFT_NOT_REMOVED_'+dir);
    assert.equal(s.arrowFill,color,'TRIANGLE_WRONG_FILL_'+dir);
    assert.equal(s.numColor,color,'ODDS_NUMBER_WRONG_COLOR_'+dir);
    assert(s.clip.startsWith(dir==='up'?'polygon(50%':'polygon(0'),'TRIANGLE_WRONG_DIRECTION_'+dir);
    assert.equal(s.arrowWidth,'5px','ARROW_NOT_5PX_WIDE_'+dir);assert.equal(s.arrowHeight,'5px','ARROW_NOT_5PX_HIGH_'+dir);
    assert.equal(s.numFont,'11.5px','ODDS_FONT_CHANGED_'+dir);
    assert(Math.abs(s.arrowCenterOffset)<.65,'ARROW_OFF_NUMBER_CENTER_'+dir);
    assert(Math.abs(s.arrowGap-1.5)<.65,'ARROW_NOT_1_5PX_AFTER_ODDS_'+dir);
    assert.equal(s.plateRight,'-1px','ODDS_3PX_GAP_LOST_'+dir);
    assert.equal(s.plateRadius,'6px','ODDS_RADIUS_CHANGED_'+dir);
    assert.equal(s.cycles,'6','ODDS_NOT_6_PULSES_'+dir);
    assert.equal(s.period,'1s','ODDS_CYCLE_NOT_1_SECOND_'+dir);
    assert.equal(s.animation,'b46-odds-card-pulse-6x','ODDS_ANIMATION_CHANGED_'+dir);
    assert(Math.abs(s.quoteWidth-data.originalQuoteWidth)<.4,'QUOTE_WIDTH_CHANGED_'+dir);
    assert(Math.abs(s.cellWidth-data.originalCellWidth)<.4,'MARKET_GRID_CHANGED_'+dir);
   }
   assert.equal(data.afterUp.direction,null,'ODDS_UP_NOT_CLEARED_IN_6_SECONDS');
   assert.equal(data.afterDown.direction,null,'ODDS_DOWN_NOT_CLEARED_IN_6_SECONDS');
   assert(data.stats.ups>=1&&data.stats.downs>=1,'ODDS_MONITOR_STATS_MISSING');
   results[mode.name]={passed:true,up:{gap:data.up.arrowGap,offset:data.up.arrowCenterOffset},down:{gap:data.down.arrowGap,offset:data.down.arrowCenterOffset},priceFont:data.up.numFont};
  } else {
   const x=await page.evaluate(()=>({active:document.querySelectorAll('[data-b46-odds-move]').length}));
   assert.equal(x.active,0,'ODDS_ANIMATION_OUTSIDE_DARK_DESKTOP_'+mode.name);
   results[mode.name]={passed:true,active:x.active};
  }
  assert.deepEqual(errors,[],'BROWSER_PAGE_ERRORS_'+mode.name+'_'+JSON.stringify(errors));
  await page.screenshot({path:'audit/'+label+'-'+mode.name+'.png'});
  await context.close();
 }
 }finally{await browser.close()}
 console.log('BALL46_ODDS_TRIANGLE_BROWSER_CHECK_'+label+' '+JSON.stringify(results));
 return results;
}
async function health(){
 const res={};
 for(const path of ['/api/engine/health','/api/full-market/health']){
  const j=JSON.parse(await read(HOME+path));assert(j.ok===true,'BACKEND_HEALTH_FAILED_'+path);res[path]=j.version||j.revision||null;
 }
 return res;
}
async function rollback(){
 if(!activated)return;
 const current=await active();if(current===base)return;
 assert.equal(current,candidate,'FOREIGN_VERSION_ACTIVE_STOP_ROLLBACK');
 await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback '+MARK}})});
 for(let k=0;k<20;k++){if(await active()===base){report.rollback=base;save();return}await delay(1000)}
 throw Error('ROLLBACK_DID_NOT_RESTORE_OLD_VERSION');
}
try{
 const p=prepare(JSON.parse(await read(TEST+'/_premium_health')));
 report.testReference={cssSha:sha(p.css),jsSha:sha(p.js),testRevision:'PREMIUM_LEAGUE_SOLID_V14'};save();
 base=await active();report.oldVersion=base;save();
 const old=await version(base),source=main(old);parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const beforeSettings=same(await settings()),beforeCrons=same(await crons()),beforeHealth=await health();
 const homeBefore=await read(HOME+'/index.html'),directBefore=await read(DIRECT+'/index.html');
 assert(homeBefore.includes('b46-premium-match-production')&&directBefore.includes('b46-premium-match-production'),'PRODUCTION_PREMIUM_CARDS_MISSING');
 assert(homeBefore.includes('b46-sidebar-winrate-production')&&directBefore.includes('b46-sidebar-winrate-production'),'PRODUCTION_SIDEBAR_MISSING');
 assert(!homeBefore.includes(MARK),'PRODUCTION_ALREADY_TRIANGLE');
 report.before={mainSha:sha(source),settingsSha:sha(beforeSettings),crons:beforeCrons,backend:beforeHealth,publicHtmlSha:sha(homeBefore)};
 save();
 const patched=patchWorker(source,p);
 assert.equal(await active(),base,'PRODUCTION_VERSION_MOVED_BEFORE_CANDIDATE_UPLOAD');
 candidate=await upload(old,patched);report.candidateVersion=candidate;save();
 assert.equal(await active(),base,'PRODUCTION_VERSION_MOVED_AFTER_UPLOAD');
 verify(await version(candidate),old,patched);
 const preview='https://'+candidate.slice(0,8)+'-'+SCRIPT+'.mccarey-supon.workers.dev';
 report.preview=preview;save();
 const html=await read(preview+'/index.html');
 assert(html.includes(MARK)&&html.includes('b46-odds-flash-production')&&html.includes('b46-sidebar-winrate-production'),'CANDIDATE_HTML_DIFF_INVALID');
 report.previewCheck=await browserCheck(preview,'candidate',true);save();
 assert.equal(await active(),base,'PRODUCTION_CHANGED_DURING_CANDIDATE_CHECK');
 assert.equal(same(await settings()),beforeSettings,'PRODUCTION_SETTINGS_CHANGED_PRECUTOVER');
 assert.equal(same(await crons()),beforeCrons,'PRODUCTION_CRONS_CHANGED_PRECUTOVER');
 const result=await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Deploy '+MARK}})});
 activated=true;
 console.log('BALL46_V3_TRIANGLE_PRODUCTION_ACTIVATED '+JSON.stringify({before:base,candidate,apiResult:result}));
 let ok=false;for(let k=0;k<20;k++){const id=await active();if(id===candidate){ok=true;break}assert.equal(id,base,'FOREIGN_VERSION_AFTER_ACTIVATION');await delay(1700)}
 assert(ok,'PRODUCTION_ACTIVATION_NOT_CONFIRMED');
 let visible=false;for(let k=0;k<40;k++){try{const h=await read(HOME+'/index.html');if(h.includes(MARK)&&h.includes('b46-sidebar-winrate-production')){visible=true;break}}catch{}await delay(1250)}
 assert(visible,'NEW_PRODUCTION_HTML_NOT_PROPAGATED');
 report.productionCheck=await browserCheck(HOME,'production',true);
 verify(await version(candidate),old,patched);
 assert.equal(same(await settings()),beforeSettings,'PRODUCTION_SETTINGS_CHANGED');
 assert.equal(same(await crons()),beforeCrons,'PRODUCTION_CRONS_CHANGED');
 assert.deepEqual(await health(),beforeHealth,'BACKEND_HEALTH_REVISION_CHANGED');
 assert.equal(await active(),candidate,'ACTIVE_VERSION_DRIFTED');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_ODDS_V3_TRIANGLE_PRODUCTION_SUCCESS '+JSON.stringify({oldVersion:base,newVersion:candidate,cssSha:sha(p.css),jsSha:sha(p.js)}));
}catch(e){
 report.error=String(e?.stack||e);report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(re){report.rollbackError=String(re?.stack||re);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
