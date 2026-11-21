import assert from 'node:assert/strict';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {oddsMovementStyles,oddsMovementScript} from './odds-movement.mjs';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const SCRIPT='ball46-production',MARK='B46_ODDS_FLASH_ROUNDED_ARROW_20261121';
const TEST='https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev';
const HOME='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const ROOT='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
const sha=x=>createHash('sha256').update(x).digest('hex');
const same=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={marker:MARK,scope:'Update the existing odds flash inline CSS/runtime literal only: 6px rounded color sheets and arrow centered on actual price, preserving existing runtime, engine, odds API, bindings, assets, schedules and dark/light/mobile behavior.'};
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
 assert.equal(css,oddsMovementStyles,'TEST_CSS_DIFFERS_FROM_APPROVED_ROUNDED_ASSET');
 assert.equal(js,oddsMovementScript,'TEST_SCRIPT_DIFFERS_FROM_APPROVED_ROUNDED_ASSET');
 assert(css.length>1500&&css.length<20000&&js.length>2500&&js.length<16000,'ODDS_ASSET_SIZE_INVALID');
 assert(js.includes('DURATION=2000')&&!js.includes('DURATION=1500'),'TWO_SECONDS_NOT_PRESERVED');
 assert(css.includes('border-radius:6px!important')&&css.includes('box-shadow:none!important')&&css.includes('border:0!important'),'ROUNDED_BORDERLESS_CSS_MISSING');
 assert(css.includes('var(--b46-odds-arrow-y,50%)')&&css.includes('transform:translateY(-50%)'),'CENTERED_ARROW_CSS_MISSING');
 assert(js.includes("getBoundingClientRect()")&&js.includes('--b46-odds-arrow-y'),'PRICE_ALIGNED_ARROW_RUNTIME_MISSING');
 assert(css.includes('min-width:1024px')&&css.includes('data-theme="dark"'),'DARK_DESKTOP_SCOPE_DRIFT');
 assert(js.includes('data-nomad-odds-raw')&&js.includes('MutationObserver')&&!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(js),'ODDS_TRACKING_RUNTIME_UNSAFE');
 assert(!css.includes('</style>')&&!js.includes('</script>'),'UNSAFE_INLINE_TERMINATOR');
 return {css,js};
}
function patchWorker(source,p){
 assert(!source.includes(MARK),'PRODUCTION_ALREADY_PATCHED');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const targets=ast.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations.filter(d=>d.id.name==='__b46HeadOddsFlash20261121'):[]);
 assert.equal(targets.length,1,'PRIOR_ODDS_RUNTIME_SOURCE_MARKER_MISSING_OR_DUPLICATE');
 const lit=targets[0].init;
 assert(lit?.type==='Literal'&&typeof lit.value==='string','PRIOR_ODDS_FRAGMENT_NOT_STRING_LITERAL');
 const prior=lit.value;
 const pattern=/^<!-- B46_ODDS_FLASH_2S_20261121 --><style id="b46-odds-flash-production">([\s\S]*?)<\/style><script id="b46-odds-flash-runtime-production">([\s\S]*?)<\/script>$/;
 const parsed=prior.match(pattern);
 assert(parsed,'PRIOR_ODDS_FRAGMENT_FORMAT_UNKNOWN');
 assert(parsed[1].includes('data-b46-odds-move')&&parsed[2].includes('DURATION=2000'),'PRIOR_ODDS_RUNTIME_NOT_APPROVED_BASELINE');
 assert(!parsed[2].includes('--b46-odds-arrow-y'),'PRIOR_ODDS_ALREADY_CENTERED');
 const next='<!-- '+MARK+' --><style id="b46-odds-flash-production">'+p.css+'</style><script id="b46-odds-flash-runtime-production">'+p.js+'</script>';
 const literal=JSON.stringify(next);
 const output=source.slice(0,lit.start)+literal+source.slice(lit.end);
 assert.equal(output.slice(0,lit.start),source.slice(0,lit.start),'UNRELATED_WORKER_CODE_CHANGED_BEFORE');
 assert.equal(output.slice(lit.start+literal.length),source.slice(lit.end),'UNRELATED_WORKER_CODE_CHANGED_AFTER');
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
    const sampled=await pg.evaluate(async ()=>{
      // A private, short-lived, DOM-only fixture avoids races with live rows
      // that the existing BALL46 frontend legitimately replaces during updates.
      const fixture=document.createElement('div');
      fixture.className='match-row';
      fixture.setAttribute('data-match-id','B46_ODDS_QA_FIXTURE_2S');
      fixture.style.cssText='position:fixed;top:-120px;left:-120px;width:120px;height:48px;pointer-events:none;';
      fixture.innerHTML='<div class="market-cell market-cell-1x2" title="QA · local DOM only"><div class="b46-v3-quote" data-side="H"><strong data-b46-align="1x2-H" data-nomad-odds-raw="1.90">1.90</strong></div></div>';
      document.body.append(fixture);
      const el=fixture.querySelector('strong');
      try{
      const stats=window.__b46OddsMovementStats;
      const q=el.closest('.b46-v3-quote'),cell=el.closest('.market-cell');
      const raw=el.getAttribute('data-nomad-odds-raw');
      const value=Number(raw);
      if(!Number.isFinite(value)||value<=1)return {error:'INVALID_ODDS'};
      const snapshot=()=>{
        const qs=getComputedStyle(q),after=getComputedStyle(q,'::after');
        const qr=q.getBoundingClientRect(),nr=el.getBoundingClientRect();
        return {move:q.getAttribute('data-b46-odds-move'),priceColor:getComputedStyle(el).color,background:qs.backgroundColor,shadow:qs.boxShadow,border:qs.borderTopWidth,outline:qs.outlineStyle,rounding:qs.borderTopLeftRadius,arrow:after.content,arrowTop:after.top,arrowOffsetFromPriceCenter:qr.height&&nr.height?Number((qr.top+Number.parseFloat(after.top)-(nr.top+nr.height/2)).toFixed(2)):null,cellBackground:getComputedStyle(cell).backgroundColor,stats:{...stats}};
      };
      const sleep=t=>new Promise(resolve=>setTimeout(resolve,t));
      // Wait for the already-running DOM monitor to record this price, not by adding API requests.
      await sleep(300);
      // Seed the native DOM observer on this exact quote before simulating a movement.
      el.setAttribute('data-nomad-odds-raw',value.toFixed(2));
      await sleep(220);
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
      }finally{fixture.remove();}
    });
    console.log('ODDS_CANDIDATE_BROWSER_DIAGNOSTICS '+label+' '+JSON.stringify({initial,sampled}));
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
      assert.equal(proof.rounding,'6px','FLASH_CORNER_RADIUS_NOT_6PX');
      assert(Number.isFinite(proof.arrowOffsetFromPriceCenter)&&Math.abs(proof.arrowOffsetFromPriceCenter)<=2,'ODDS_ARROW_NOT_CENTERED_WITH_PRICE');
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
 report.testReference={revision:'ODDS_DOM_PRICES_V2_ROUNDED_CENTERED',cssSha:sha(p.css),jsSha:sha(p.js)};save();
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
 assert(html.includes(MARK)&&html.includes('b46-odds-flash-production'),'CANDIDATE_PREVIEW_NOT_PATCHED');
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
 let live=false;for(let i=0;i<40;i++){try{const h=await read(HOME+'/index.html');if(h.includes(MARK)&&h.includes('b46-odds-flash-production')){live=true;break}}catch{}await delay(1200)}
 assert(live,'PRODUCTION_STYLE_NOT_PROPAGATED');
 report.production=await browserCheck(HOME,'production',p,true);
 verify(await version(candidate),old,patched);
 assert.equal(same(await settings()),beforeSettings,'SETTINGS_CHANGED');assert.equal(same(await crons()),beforeCrons,'SCHEDULES_CHANGED');
 assert.deepEqual(await health(),beforeHealth,'ENGINE_HEALTH_REVISION_CHANGED');
 assert.equal(await active(),candidate,'PRODUCTION_VERSION_DRIFT');
 report.result='SUCCESS';report.completedAt=new Date().toISOString();save();
 console.log('BALL46_ODDS_ROUNDED_ARROW_PRODUCTION_SUCCESS '+JSON.stringify({before:base,after:candidate,cssSha:sha(p.css)}));
}catch(e){
 report.error=String(e?.stack||e);report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';save();
 try{await rollback()}catch(re){report.rollbackError=String(re?.stack||re);save()}
 console.error(e?.stack||e);process.exitCode=1;
}
