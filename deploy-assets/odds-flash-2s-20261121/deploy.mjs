import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {oddsMovementStyles,oddsMovementScript} from './odds-movement.mjs';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const SCRIPT='ball46-production',MARK='B46_ODDS_FLASH_2S_20261121';
const TEST='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const HOME='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={marker:MARK,scope:'DOM-only borderless 2-second odds flash for desktop dark only. The active match CSS, original Worker, all assets, bindings, API, Engine, live odds feed, light and mobile remain protected.'};
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
 assert(p?.ok===true&&p.scope==='TEST_ONLY_CSS'&&p.revision==='PREMIUM_LEAGUE_SOLID_V14','TEST_WORKER_REVISION_MISMATCH');
 assert.equal(p.oddsMovement,'DOM_PRICES_V1','TEST_ODDS_MOVEMENT_DISABLED');
 const css=p.oddsMovementStyle,js=p.oddsMovementScript;
 assert.equal(css,oddsMovementStyles,'TEST_CSS_DIFFERS_FROM_APPROVED_2S_ASSET');
 assert.equal(js,oddsMovementScript,'TEST_SCRIPT_DIFFERS_FROM_APPROVED_2S_ASSET');
 assert(css.length>1200&&css.length<20000&&js.length>1800&&js.length<12000,'ODDS_ASSET_SIZE_INVALID');
 assert(js.includes('DURATION=2000')&&!js.includes('DURATION=1500'),'TEST_DURATION_NOT_TWO_SECONDS');
 assert(css.includes('border:0!important')&&css.includes('box-shadow:none!important')&&!css.includes('inset 0 0 0 1px'),'ODDS_BORDERLESS_STYLE_NOT_APPROVED');
 assert(css.includes('min-width:1024px')&&css.includes('data-theme="dark"'),'CSS_SCOPE_DRIFT');
 assert(js.includes('data-nomad-odds-raw')&&js.includes("MutationObserver")&&!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(js),'ODDS_TRACKING_RUNTIME_UNSAFE');
 assert(!css.includes('</style>')&&!js.includes('</script>'),'UNSAFE_INLINE_TERMINATOR');
 return {css,js};
}
function patchWorker(source,p){
 assert(!source.includes(MARK),'PRODUCTION_ALREADY_PATCHED');
 assert(source.includes('B46_PREMIUM_MATCH_CARDS_20261121'),'EXISTING_PREMIUM_CARD_RELEASE_NOT_ACTIVE');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const ex=ast.body.filter(x=>x.type==='ExportDefaultDeclaration');
 assert(ex.length===1&&source.slice(ex[0].end).trim()==='','WORKER_EXPORT_UNEXPECTED');
 const original=source.slice(ex[0].declaration.start,ex[0].declaration.end);
 const prefix=source.slice(0,ex[0].start);
 const fragment='<!-- '+MARK+' --><style id="b46-odds-flash-production">'+p.css+'</style><script id="b46-odds-flash-runtime-production">'+p.js+'</script>';
 const wrapper=
   'const __b46BeforeOddsFlash20261121='+original+';\n'+
   'const __b46HeadOddsFlash20261121='+JSON.stringify(fragment)+';\n'+
   'const __b46OddsFlash20261121={...__b46BeforeOddsFlash20261121,async fetch(req,env,ctx){\n'+
   ' const response=await __b46BeforeOddsFlash20261121.fetch.call(__b46BeforeOddsFlash20261121,req,env,ctx);\n'+
   ' const url=new URL(req.url);\n'+
   ' if(req.method!=="GET"||!["/","/index.html","/index"].includes(url.pathname)||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;\n'+
   ' const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.delete("content-encoding");\n'+
   ' return new HTMLRewriter().on("head",{element(e){e.prepend(__b46HeadOddsFlash20261121,{html:true})}}).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));\n'+
   '}};\nexport default __b46OddsFlash20261121;\n';
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
  const modes=[{name:'pc-dark',width:1440,theme:'dark'},{name:'pc-light',width:1440,theme:'light'},{name:'mobile-dark',width:390,theme:'dark'}];
  for(const cfg of modes){
   if(!full&&cfg.name!=='pc-dark')continue;
   const pg=await browser.newPage({viewport:{width:cfg.width,height:920},serviceWorkers:'block'});
   await pg.addInitScript(theme=>localStorage.setItem('nomad343_dashboard_theme_v1',theme),cfg.theme);
   await pg.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   const resp=await pg.goto(origin+'/?oddsReleaseVerify='+Date.now(),{waitUntil:'domcontentloaded',timeout:70000});
   assert(resp?.ok(),'HOME_HTTP_FAILED_'+cfg.name);
   await pg.waitForFunction(()=>window.__b46OddsMovementStats?.ready===true,null,{timeout:30000});
   const initial=await pg.evaluate(()=>{
    const style=document.getElementById('b46-odds-flash-production'),runtime=document.getElementById('b46-odds-flash-runtime-production');
    return {style:!!style,script:!!runtime,ruleCount:style?.sheet?.cssRules?.length||0,scopeDark:document.documentElement.dataset.theme,desktop:matchMedia('(min-width:1024px)').matches,stats:{...window.__b46OddsMovementStats},priorPremium:!!document.getElementById('b46-premium-match-production')};
   });
   assert(initial.style&&initial.script&&initial.ruleCount>0,'ODDS_ASSET_MISSING_'+cfg.name);
   assert.equal(initial.scopeDark,cfg.theme,'THEME_NOT_SELECTED_'+cfg.name);
   assert.equal(initial.desktop,cfg.width>=1024,'CSS_MEDIA_SCOPE_WRONG');
   assert(initial.priorPremium,'PREEXISTING_PREMIUM_CARD_STYLES_LOST');
   if(cfg.name==='pc-dark'){
    await pg.waitForFunction(()=>[...document.querySelectorAll('[data-match-id].match-row .market-cell .b46-v3-quote strong[data-nomad-odds-raw]')].some(e=>e.getBoundingClientRect().width>0&&Number(e.getAttribute('data-nomad-odds-raw'))>1),null,{timeout:60000});
    const quote=pg.locator('[data-match-id].match-row .market-cell .b46-v3-quote strong[data-nomad-odds-raw]:visible').first();
    await quote.scrollIntoViewIfNeeded();
    const sampled=await quote.evaluate(async el=>{
      const stats=window.__b46OddsMovementStats;
      const q=el.closest('.b46-v3-quote'),cell=el.closest('.market-cell');
      const raw=el.getAttribute('data-nomad-odds-raw');
      const value=Number(raw);
      if(!Number.isFinite(value)||value<=1)return {error:'INVALID_ODDS'};
      const snapshot=()=>{
        const qs=getComputedStyle(q),after=getComputedStyle(q,'::after');
        return {move:q.getAttribute('data-b46-odds-move'),priceColor:getComputedStyle(el).color,background:qs.backgroundColor,shadow:qs.boxShadow,border:qs.borderTopWidth,outline:qs.outlineStyle,arrow:after.content,cellBackground:getComputedStyle(cell).backgroundColor,stats:{...stats}};
      };
      const sleep=t=>new Promise(resolve=>setTimeout(resolve,t));
      // Wait for the already-running DOM monitor to record this price, not by adding API requests.
      await sleep(300);
      const initial=snapshot(),upVal=Number((value+.07).toFixed(2));
      el.setAttribute('data-nomad-odds-raw',upVal.toFixed(2));el.textContent=upVal.toFixed(2);
      await sleep(120);
      const up=snapshot();
      await sleep(950);
      const upStill=snapshot();
      await sleep(1200);
      const clearedUp=snapshot();
      // An unchanged price must not trigger another highlight.
      el.setAttribute('data-nomad-odds-raw',upVal.toFixed(2));el.textContent=upVal.toFixed(2);
      await sleep(120);
      const samePrice=snapshot();
      el.setAttribute('data-nomad-odds-raw',value.toFixed(2));el.textContent=value.toFixed(2);
      await sleep(120);
      const down=snapshot();
      await sleep(900);
      const downStill=snapshot();
      await sleep(1400);
      const clearedDown=snapshot();
      return {initial,up,upStill,clearedUp,samePrice,down,downStill,clearedDown};
    });
    assert(!sampled.error,'BAD_PRICE_FOR_QA');
    assert.equal(sampled.up.move,'up','UP_FLASH_NOT_TRIGGERED');
    assert(sampled.up.arrow.includes('↑'),'UP_ARROW_MISSING');
    assert.equal(sampled.upStill.move,'up','UP_FLASH_TOO_SHORT');
    assert.equal(sampled.clearedUp.move,null,'UP_FLASH_OVER_TWO_SECONDS');
    assert.equal(sampled.samePrice.move,null,'UNCHANGED_ODDS_FALSENLY_FLASHED');
    assert.equal(sampled.down.move,'down','DOWN_FLASH_NOT_TRIGGERED');
    assert(sampled.down.arrow.includes('↓'),'DOWN_ARROW_MISSING');
    assert.equal(sampled.downStill.move,'down','DOWN_FLASH_TOO_SHORT');
    assert.equal(sampled.clearedDown.move,null,'DOWN_FLASH_OVER_TWO_SECONDS');
    for(const proof of [sampled.up,sampled.down]){
      assert.equal(proof.shadow,'none','FLASH_HAS_CARD_BORDER_SHADOW');
      assert.equal(proof.border,'0px','FLASH_HAS_BORDER');
      assert.equal(proof.outline,'none','FLASH_HAS_OUTLINE');
      assert(proof.stats.flashes>=1,'DOM_ODDS_MOVEMENT_NOT_COUNTED');
    }
    assert.equal(sampled.up.cellBackground,sampled.down.cellBackground,'EXISTING_ODDS_RECESS_CHANGED');
    assert.equal(sampled.up.background,'rgba(42, 163, 103, 0.2)','UP_HIGHLIGHT_COLOR_DRIFT');
    assert.equal(sampled.down.background,'rgba(178, 65, 74, 0.19)','DOWN_HIGHLIGHT_COLOR_DRIFT');
    assert(sampled.down.stats.ups>=1&&sampled.down.stats.downs>=1,'PRICE_MOVEMENT_DIRECTION_NOT_CONFIRMED');
    results[cfg.name]={initial,sampled};
    console.log('ODDS_TWO_SECOND_BROWSER_PASS '+label+' '+cfg.name+' '+JSON.stringify({initial,up:sampled.up,upStill:sampled.upStill,clearedUp:sampled.clearedUp,down:sampled.down,downStill:sampled.downStill,clearedDown:sampled.clearedDown}));
   }else{
    // Media query (dark desktop only) is disabled in the already-approved mobile and light modes.
    assert(cfg.name!=='pc-light'||initial.desktop,'LIGHT_DESKTOP_VIEWPORT_BAD');
    assert(cfg.name!=='mobile-dark'||!initial.desktop,'MOBILE_VIEWPORT_BAD');
    const unaffected=await pg.evaluate(()=>{
      const sheet=document.getElementById('b46-odds-flash-production').sheet;
      return {dark:document.documentElement.dataset.theme==='dark',desktop:matchMedia('(min-width:1024px)').matches,oddsRule:sheet?.cssRules?.[0]?.conditionText||null,marked:document.querySelectorAll('[data-b46-odds-move]').length};
    });
    assert(!unaffected.dark||!unaffected.desktop,'ODDS_STYLE_APPLIES_OUTSIDE_DARK_DESKTOP');
    assert.equal(unaffected.marked,0,'FLASH_APPEARED_OUTSIDE_DARK_DESKTOP');
    assert(unaffected.oddsRule?.includes('min-width: 1024px'),'MEDIA_QUERY_NOT_GATED');
    results[cfg.name]={initial,unaffected};
    console.log('ODDS_OTHER_VIEW_UNCHANGED '+label+' '+cfg.name+' '+JSON.stringify(unaffected));
   }
   await pg.screenshot({path:'audit/'+label+'-'+cfg.name+'.png'});
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
 report.testReference={revision:'ODDS_DOM_PRICES_V1_2S_BORDERLESS',cssSha:sha(p.css),jsSha:sha(p.js)};save();
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
 assert(html.includes(MARK)&&html.includes('b46-odds-flash-production'),'CANDIDATE_PREVIEW_NOT_PATCHED');
 report.previewBrowser=await browserCheck(preview,'candidate',p,true);save();
 assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
 assert.equal(same(await settings()),beforeSettings,'PRODUCTION_SETTINGS_MOVED');
 assert.equal(same(await crons()),beforeCrons,'PRODUCTION_SCHEDULES_MOVED');
 await cf('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:candidate,percentage:100}],annotations:{'workers/message':'Deploy '+MARK}})});
 activated=true;assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');
 let live=false;for(let i=0;i<40;i++){try{const h=await read(HOME+'/index.html');if(h.includes(MARK)&&h.includes('b46-odds-flash-production')){live=true;break}}catch{}await delay(1200)}
 assert(live,'PRODUCTION_STYLE_NOT_PROPAGATED');
 report.production=await browserCheck(HOME,'production',p,true);
 verify(await version(candidate),old,patched);
 assert.equal(same(await settings()),beforeSettings,'SETTINGS_CHANGED');assert.equal(same(await crons()),beforeCrons,'SCHEDULES_CHANGED');
 assert.deepEqual(await health(),beforeHealth,'ENGINE_HEALTH_REVISION_CHANGED');
 assert.equal(await active(),candidate,'PRODUCTION_VERSION_DRIFT');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_ODDS_2S_PRODUCTION_SUCCESS '+JSON.stringify({before:base,after:candidate,cssSha:sha(p.css)}));
}catch(e){
 report.error=String(e?.stack||e);report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(re){report.rollbackError=String(re?.stack||re);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
