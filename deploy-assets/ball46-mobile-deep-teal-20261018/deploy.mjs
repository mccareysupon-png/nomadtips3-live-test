import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {completeAssetUpload,createPayload,candidateModules} from '../member-orange-only-20261015/assets.mjs';

const ROOT='deploy-assets/ball46-mobile-deep-teal-20261018';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID, TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT='ball46-production', ORIGIN='https://ball46.com';
const ACCOUNT_EXPECTED='62cb0db544160e6591342abd6b4f35cc';
// Base version is discovered fresh and held fixed throughout this deployment.
// Base index bytes are read from current Cloudflare Active, never a historical HTML file.
const MARK='BALL46_MOBILE_BORDERLESS_SOFT_ELEVATION_20261019';
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,(key,x)=>key==='annotations'?undefined:x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const filesDir=join(ROOT,'audit'),preview=id=>'https://'+id.slice(0,8)+'-ball46-production.mccarey-supon.workers.dev';
mkdirSync(filesDir,{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'BALL46 main mobile only',mark:MARK,sourceSha256:'355f1314153867758037152ee85c4afc819c26edd382e02cc053db7ad370f1fc',phase:'PRECHECK',activated:false};
const save=()=>writeFileSync(join(filesDir,'result.json'),JSON.stringify(report,null,2));
function apiUrl(path){return 'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path;}
async function cf(path,body=null) {
 const method=body?'POST':'GET';
 const response=await fetch(apiUrl(path),{method,headers:{Authorization:'Bearer '+TOKEN,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 const json=await response.json();
 assert(response.ok&&json.success===true,'CLOUDFLARE_'+method+'_'+response.status+':'+JSON.stringify(json.errors||[]).slice(0,500));
 return json.result;
}
async function active(){
 const d=(await cf('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments?.[0];
 assert(d?.versions?.length===1&&d.versions[0].percentage===100,'ACTIVE_NOT_SINGLE_VERSION');
 return {id:d.versions[0].version_id,deployment:d.id};
}
const version=id=>cf('/workers/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
async function config(){
 const settings=await cf('/workers/scripts/'+SCRIPT+'/settings'),schedules=await cf('/workers/scripts/'+SCRIPT+'/schedules');
 const domains=(await cf('/workers/domains')).filter(d=>d.service===SCRIPT).map(d=>d.hostname).sort();
 assert.deepEqual(domains,['ball46.com','www.ball46.com'],'PRODUCTION_DOMAIN_MISMATCH');
 return {settings,schedules,domains};
}
async function bytes(origin,path){
 const url=new URL(path,origin);url.searchParams.set('_b46deepteal',Date.now()+'-'+Math.random().toString(16).slice(2));
 const response=await fetch(url,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});
 const body=Buffer.from(await response.arrayBuffer());
 return {path,status:response.status,bytes:body,sha:hash(body),type:response.headers.get('content-type')||''};
}
async function allAssets(host,paths){
 const result=new Map();
 for(let i=0;i<paths.length;i+=5){
  for(const item of await Promise.all(paths.slice(i,i+5).map(p=>bytes(host,'/'+p)))) {
   assert.equal(item.status,200,'ASSET_NOT_200:'+item.path+':'+item.status);
   assert(item.bytes.length>0,'ASSET_EMPTY:'+item.path);
   result.set(item.path.replace(/^\//,''),item);
  }
 }
 return result;
}
async function health(host){
 const paths=['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1'];
 const out=[];
 for(const path of paths){
  const response=await bytes(host,path);assert.equal(response.status,200,'API_HTTP:'+path+':'+response.status);
  const j=JSON.parse(response.bytes.toString('utf8'));assert.equal(j.ok,true,'API_NOT_OK:'+path);
  if(path==='/api/engine/board')assert(Array.isArray(j.fixtures),'LIVE_BOARD_SCHEMA_CHANGED');
  if(path.includes('/statistics'))assert(Array.isArray(j.rows),'STATISTICS_SCHEMA_CHANGED');
  out.push({path,ok:j.ok,version:j.version,rows:j.rows?.length,fixtures:j.fixtures?.length,status:j.status});
 }
 return out;
}
async function ui(host,stage){
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true});
 const screenshots=[];
 try{
  for(const width of [320,360,390,430,760,761,1280]){
   const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host+'/?_b46nav='+Date.now(),{waitUntil:'domcontentloaded',timeout:50000});
   await page.locator('body').waitFor({timeout:20000});
   if(width<=760){
    await page.locator('#b46m-teal-shell').waitFor({state:'visible',timeout:20000});
    const mobileShell=page.locator('#b46m-teal-shell');
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-b46gn')==='1',{timeout:20000});
    await page.waitForTimeout(160);
    for(const selector of ['[data-b46m-open]','[data-b46m-searchbutton]']){
      const v=await mobileShell.locator(selector).evaluate(el=>{
        const c=getComputedStyle(el),r=el.getBoundingClientRect();
        return {border:c.borderWidth,borderStyle:c.borderStyle,background:c.backgroundColor,backgroundImage:c.backgroundImage,shadow:c.boxShadow,width:r.width,height:r.height,color:c.color};
      });
      console.log('BORDERLESS_ICON_STYLE',JSON.stringify({stage,width,selector,...v}));
      assert.equal(v.border,'0px','ICON_BUTTON_BORDER_STILL_PRESENT:'+selector);
      assert.equal(v.background,'rgba(0, 0, 0, 0)','ICON_BUTTON_BG_NOT_TRANSPARENT:'+selector);
      assert.equal(v.backgroundImage,'none','ICON_BUTTON_GRADIENT_STILL_PRESENT:'+selector);
      assert.equal(v.shadow,'none','ICON_BUTTON_SHADOW_STILL_PRESENT:'+selector);
      assert(v.width>=44&&v.height>=44,'ICON_BUTTON_TOUCH_AREA_TOO_SMALL:'+selector);
    }
    const presentation=await page.evaluate(()=>{
      const root=document.querySelector('#b46gn-cards');
      if(!root)throw new Error('REAL_GREEN_NOIR_CARD_ROOT_MISSING');
      let sample=root.querySelector('.b46gn-card'),synthetic=false;
      if(!sample){
        sample=document.createElement('button');
        sample.type='button';sample.className='b46gn-card';
        sample.innerHTML='<div class="b46gn-cardhead">VISUAL STYLE CHECK · NOT LIVE DATA</div><div class="b46gn-cardbody">Sample only</div>';
        root.append(sample);synthetic=true;
      }
      const c=getComputedStyle(sample),v={border:c.borderWidth,borderStyle:c.borderStyle,backgroundImage:c.backgroundImage,shadow:c.boxShadow,radius:c.borderRadius,synthetic};
      if(synthetic)sample.remove();
      return v;
    });
    assert.equal(presentation.border,'0px','GREEN_NOIR_MATCH_CARD_BORDER_STILL_PRESENT');
    assert.equal(presentation.backgroundImage.startsWith('linear-gradient('),true,'SOFT_CARD_GRADIENT_MISSING');
    assert.notEqual(presentation.shadow,'none','SOFT_CARD_ELEVATION_MISSING');
    assert(presentation.shadow.includes('5px 13px'),'SOFT_CARD_SHADOW_NOT_APPROVED_LIGHT_LEVEL');
    assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,'MOBILE_HORIZONTAL_OVERFLOW');
    assert.equal(await mobileShell.locator('.b46m-pageinfo').isVisible(),false,'REDUNDANT_MATCH_CENTER_HEADER_VISIBLE');
    assert.equal(await mobileShell.locator('.b46m-tagline').isVisible(),false,'LOGO_DESCRIPTION_VISIBLE');
    assert.equal(await mobileShell.locator('.b46m-brand').textContent().then(x=>x.startsWith('ball46')),true,'MOBILE_BRAND_TEXT_NOT_LOWERCASE');
    const brandStyle=await mobileShell.locator('.b46m-brand').evaluate(el=>({size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight,color:getComputedStyle(el.querySelector('strong')).color}));
    assert.equal(brandStyle.size,width<=350?'30px':'33px','GREEN_NOIR_LOGO_SIZE_MISMATCH');
    assert.equal(brandStyle.color,'rgb(32, 211, 155)','LOGO_GREEN_MISMATCH');

    await page.locator('#b46gn-hero').waitFor({state:'attached',timeout:18000});
    assert.equal(await page.locator('#b46gn-hero').isVisible(),false,'REDUNDANT_HERO_IS_VISIBLE');
    const statsPadding=await page.locator('[data-workspace-panel="statistics"]').evaluate(el=>getComputedStyle(el).paddingLeft);
    assert.equal(statsPadding,'7px','STATS_PAGE_MARGIN_NOT_7PX');
    assert.equal(await page.locator('html').getAttribute('data-b46gn'),'1','GREEN_NOIR_MODE_NOT_ACTIVE');
    assert.equal(await page.locator('#b46gn-main-title').textContent(),'Live Matches','GREEN_NOIR_HERO_NOT_LOADED');
    assert.equal(await page.locator('#b46gn-hero [data-b46gn-tab]').count(),4,'GREEN_NOIR_ORIGINAL_FILTERS_MISSING');
    assert.equal(await page.locator('#b46gn-results').isVisible(),true,'GREEN_NOIR_BOARD_HIDDEN');
    assert.equal(await page.locator('#b46gn-hero .b46gn-tabs').isVisible(),false,'DUPLICATE_HORIZONTAL_MENU_VISIBLE');
    const rows=await page.locator('[data-board-sections] [data-match-id]').count();
    const cards=await page.locator('#b46gn-cards [data-b46gn-fixture]').count();
    const resultsBox=await page.locator('#b46gn-results').boundingBox();
    assert(resultsBox,'MOBILE_RESULTS_MISSING');
    const gap=await page.locator('#b46gn-results').evaluate(el=>getComputedStyle(el).paddingLeft);
    assert.equal(gap,'7px','LIVE_MATCHES_GUTTER_NOT_7PX');
    const unusedRight=width-(resultsBox.x+resultsBox.width);
    console.log('B46_WIDTH_MEASURE',JSON.stringify({stage,width,resultsBox,unusedRight,bodyScroll:await page.evaluate(()=>document.documentElement.scrollWidth)}));
    assert(unusedRight>=-2&&unusedRight<=3,'MOBILE_PAGE_CONTAINER_TOO_NARROW_OR_OVERFLOW');
    if(cards) {
      const cardBox=await page.locator('#b46gn-cards [data-b46gn-fixture]').first().boundingBox();
      assert(cardBox&&cardBox.x>=5&&cardBox.x<=10,'CARD_LEFT_EDGE_NOT_7PX');
      assert(Math.abs(width-(cardBox.x+cardBox.width)-7)<=3,'CARD_RIGHT_EDGE_NOT_7PX');
    }
    const nativeKitCount=await page.locator('[data-board-sections] .teams-cell .team-kit-icon.live-row-kit').count();
    if(nativeKitCount&&cards){
      await page.locator('#b46gn-cards .b46gn-kit .team-kit-icon').first().waitFor({state:'attached',timeout:10000});
      assert((await page.locator('#b46gn-cards .b46gn-kit .team-kit-icon').count())>0,'PC_JERSEYS_NOT_MIRRORED_ON_MOBILE');
    }
    if(rows&&cards){const first=page.locator('#b46gn-cards [data-b46gn-fixture]').first();await first.click();assert.equal(await page.locator('#b46gn-detail').getAttribute('aria-hidden'),'false','GREEN_NOIR_DETAIL_NOT_OPEN');
      assert.equal(await page.locator('#b46gn-detail .b46gn-sheet').evaluate(el=>getComputedStyle(el).paddingLeft),width<=350?'8px':'9px','DETAIL_SHEET_GUTTER_MISMATCH');
      assert.equal(await page.locator('#b46gn-detail .b46gn-sheet').evaluate(el=>getComputedStyle(el).borderWidth),'0px','EXPANDED_MATCH_CARD_BORDER_STILL_PRESENT');await page.locator('#b46gn-detail .b46gn-event-flow').waitFor({state:'visible',timeout:7000});await page.locator('[data-b46gn-dismiss]').click();assert.equal(await page.locator('#b46gn-detail').getAttribute('aria-hidden'),'true','GREEN_NOIR_DETAIL_NOT_CLOSED')}
    assert.equal(await page.locator('html').getAttribute('data-b46m-teal'),'1','MOBILE_MODE_NOT_ACTIVE');
    assert.equal(await page.locator('.left-rail').isVisible(),false,'OLD_MOBILE_HORIZONTAL_MENU_STILL_VISIBLE');
    const open=page.locator('[data-b46m-open]');
    if(width===390){
      const focusTarget=page.locator('[data-b46m-open]');
      await focusTarget.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const keyboardFocus=await focusTarget.evaluate(el=>({focused:document.activeElement===el,matches:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineWidth}));
      console.log('BORDERLESS_KEYBOARD_FOCUS',JSON.stringify(keyboardFocus));
      if(keyboardFocus.matches)assert.equal(keyboardFocus.outline,'2px','KEYBOARD_FOCUS_RING_NOT_VISIBLE');
    }
    await open.click();assert.equal(await open.getAttribute('aria-expanded'),'true','DRAWER_NOT_OPEN');
    assert.equal(await page.locator('#b46m-drawer .b46m-drawerhead strong').textContent(),'ball46','DRAWER_LOGO_NOT_LOWERCASE');
    assert.equal(await page.locator('#b46m-drawer .b46m-drawerhead small').isVisible(),false,'DRAWER_LOGO_SUBTITLE_VISIBLE');

    assert.equal(await page.locator('#b46m-drawer').getAttribute('aria-hidden'),'false','DRAWER_ARIA');
    const navContentPadding=await page.locator('#b46m-drawer .b46m-menucontent').evaluate(el=>[getComputedStyle(el).paddingLeft,getComputedStyle(el).paddingRight]);
    assert.deepEqual(navContentPadding,['7px','7px'],'DRAWER_GROUP_INSETS_NOT_7PX');
    if(width===390){let shot=join(filesDir,stage+'-mobile-menu-390.png');await page.screenshot({path:shot});screenshots.push(shot);}
    await page.locator('[data-b46m-status="live"]').click();
    assert.equal(await open.getAttribute('aria-expanded'),'false','DRAWER_NOT_CLOSED');
    assert(await page.locator('[data-status-filter="live"]').count()>0,'ORIGINAL_STATUS_MISSING');
    await open.click();
    await page.locator('[data-b46m-status="scheduled"]').click();
    assert.equal(await page.locator('.left-rail [data-status-filter="scheduled"]').getAttribute('class').then(x=>x.includes('active')),true,'UPCOMING_NOT_DELEGATED');
    await open.click();
    await page.locator('[data-b46m-status="all"]').click();
    assert.equal(await page.locator('.left-rail [data-status-filter="all"]').getAttribute('class').then(x=>x.includes('active')),true,'ALL_NOT_DELEGATED');
    // All MARKETS & INSIGHTS destinations must share the same native Signals layout.
    for(const market of ['ah','1x2','ou','corners','cards','other']){
      await open.click();
      await page.locator('[data-b46m-market="'+market+'"]').click();
      assert.equal(await page.locator('body').getAttribute('data-workspace-view'),'signal','MARKET_NOT_ROUTED_TO_SIGNALS:'+market);
      const metrics=await page.locator('[data-board-sections]').evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {left:s.paddingLeft,right:s.paddingRight,x:r.x,r:r.right,w:r.width};});
      assert.equal(metrics.left,'0px','SIGNAL_LEFT_NESTED_PADDING:'+market);
      assert.equal(metrics.right,'0px','SIGNAL_RIGHT_NESTED_PADDING:'+market);
      assert(metrics.x>=5&&metrics.x<=9,'SIGNALS_MARKET_NOT_ALIGNED_LEFT:'+market+':'+JSON.stringify(metrics));
      assert(Math.abs(width-metrics.r-7)<=3,'SIGNALS_MARKET_NOT_ALIGNED_RIGHT:'+market+':'+JSON.stringify(metrics));
      assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,'HORIZONTAL_OVERFLOW_MARKET:'+market);
      if(width===390&&market==='ah'){const shot=join(filesDir,stage+'-market-ah-390.png');await page.screenshot({path:shot});screenshots.push(shot);}
    }
    // Both BALL46 TOOLS pages use these same canonical 7px outer edges.
    await open.click();
    await page.locator('[data-b46m-page="signal"]').click();
    assert.equal(await page.locator('body').getAttribute('data-workspace-view'),'signal','TOOLS_SIGNALS_ROUTE_MISSING');
    await open.click();
    await page.locator('[data-b46m-page="statistics"]').click();
    assert.equal(await page.locator('body').getAttribute('data-workspace-view'),'statistics','TOOLS_STATISTICS_ROUTE_MISSING');
    const statsRect=await page.locator('[data-workspace-panel="statistics"]').evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,r:r.right,w:r.width,left:s.paddingLeft,right:s.paddingRight};});
    assert(statsRect.x>=-2&&statsRect.x<=2,'STATS_PANEL_NOT_FULL_WIDTH:'+JSON.stringify(statsRect));
    assert(Math.abs(width-statsRect.r)<=2,'STATS_PANEL_RIGHT_NOT_FULL_WIDTH:'+JSON.stringify(statsRect));
    assert.deepEqual([statsRect.left,statsRect.right],['7px','7px'],'STATS_GUTTER_NOT_7PX');
    const statsCard=await page.locator('[data-workspace-panel="statistics"] .sp-stat-hero').boundingBox();
    assert(statsCard&&statsCard.x>=5&&statsCard.x<=10,'STATISTICS_CARDS_NOT_ALIGNED_TO_7PX');
    assert(Math.abs(width-(statsCard.x+statsCard.width)-7)<=3,'STATISTICS_CARD_RIGHT_NOT_7PX');
    assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,'STATS_HORIZONTAL_OVERFLOW');
    if(width===390){const shot=join(filesDir,stage+'-statistics-wide7-390.png');await page.screenshot({path:shot});screenshots.push(shot);}
    await page.locator('[data-b46m-searchbutton]').click();
    assert.equal(await page.locator('[data-b46m-searchpanel]').getAttribute('data-open'),'true','SEARCH_PANEL_HIDDEN');
    await page.locator('[data-b46m-searchinput]').fill('Arsenal');
    assert.equal(await page.locator('[data-search]').inputValue(),'Arsenal','SEARCH_NOT_DELEGATED');
    await open.click();await page.keyboard.press('Escape');
    assert.equal(await open.getAttribute('aria-expanded'),'false','ESC_FAILED');
    if(width===390){let shot=join(filesDir,stage+'-mobile-390.png');await page.screenshot({path:shot});screenshots.push(shot);}
   } else {
    assert.equal(await page.locator('#b46m-teal-shell').isVisible(),false,'DESKTOP_CHANGED');
    assert.equal(await page.locator('.left-rail').isVisible(),true,'DESKTOP_NAV_HIDDEN');
    if(width===1280){let shot=join(filesDir,stage+'-desktop-1280.png');await page.screenshot({path:shot});screenshots.push(shot);}
   }
   assert(errors.every(x=>!x.includes('b46m')&&!x.includes('b46gn')),'GREEN_NOIR_JS_ERROR:'+errors.join('; ').slice(0,300));
   await page.close();
  }
 }finally{await browser.close();}
 return screenshots;
}
async function visualComparison(host,stage){
 const {chromium}=await import('playwright');
 const browser=await chromium.launch({headless:true});
 const proof=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:850},deviceScaleFactor:1});
  await page.goto(host+'/?_vischeck='+Date.now(),{waitUntil:'domcontentloaded',timeout:50000});
  await page.locator('#b46m-teal-shell').waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(2000);
  const synthetic=await page.evaluate(()=>{
   const root=document.querySelector('#b46gn-cards');
   if(!root||root.querySelector('.b46gn-card'))return false;
   const card=document.createElement('button');card.type='button';card.className='b46gn-card';
   card.dataset.visualOnly='1';
   card.innerHTML='<div class="b46gn-cardhead"><span class="b46gn-league">STYLE PREVIEW · NO LIVE DATA</span><span class="b46gn-live">VISUAL TEST</span></div><div class="b46gn-cardbody"><div class="b46gn-team"><span class="b46gn-team-name">Home sample</span><span class="b46gn-team-score">—</span></div><div class="b46gn-team"><span class="b46gn-team-name">Away sample</span><span class="b46gn-team-score">—</span></div></div>';
   root.replaceChildren(card);return true;
  });
  const screenshot=join(filesDir,stage+'-visual-mobile-390.png');
  await page.screenshot({path:screenshot});
  proof.push({path:screenshot,visualOnlySyntheticCard:synthetic});
  await page.close();
 }finally{await browser.close()}
 return proof;
}

async function deploy(to,expected,label){
  assert.equal((await active()).id,expected,'ACTIVE_DRIFT_BEFORE_DEPLOY');
  const deployment=await cf('/workers/scripts/'+SCRIPT+'/deployments',{strategy:'percentage',versions:[{version_id:to,percentage:100}],annotations:{'workers/message':label}});
  activationAttempted=activationAttempted||(to===candidate);
  for(let attempt=0;attempt<20;attempt++){
    const current=(await active()).id;
    if(current===to)return deployment.id;
    assert.equal(current,expected,'UNEXPECTED_THIRD_PARTY_ACTIVE_VERSION');
    await new Promise(r=>setTimeout(r,2000));
  }
  throw new Error('CLOUDFLARE_ACTIVATION_NOT_CONFIRMED_IN_40_SECONDS');
}
async function waitPublicIndex(expectedSha,timeoutMs=90000){
 const start=Date.now();let consecutive=0;
 while(Date.now()-start<timeoutMs){
  const current=await bytes(ORIGIN,'/index.html');
  const main=await bytes(ORIGIN,'/');
  consecutive=current.status===200&&main.status===200&&current.sha===expectedSha&&main.sha===expectedSha?consecutive+1:0;
  if(consecutive>=2)return;
  await new Promise(r=>setTimeout(r,2200));
 }
 throw new Error('PRODUCTION_PUBLIC_CUTOVER_NOT_VISIBLE');
}
let candidate=null, original=null, activated=false, activationAttempted=false;
try{
 assert(ACCOUNT&&TOKEN,'CLOUDFLARE_CREDENTIALS_MISSING');
 assert.equal(ACCOUNT,ACCOUNT_EXPECTED,'WRONG_ACCOUNT');
 const sourceB64=readFileSync(join(ROOT,'gn-source.br.b64'),'utf8').trim();
 const source=Buffer.from(sourceB64,'base64');
 assert.equal(hash(source),report.sourceSha256,'SOURCE_PACKAGE_CORRUPT');
 const decoded=(await import('node:zlib')).brotliDecompressSync(source);
 const packagePath=join(ROOT,'source.tar');writeFileSync(packagePath,decoded);
 const unpack=spawnSync('tar',['-xf',packagePath,'-C',ROOT],{encoding:'utf8'});
 assert.equal(unpack.status,0,'TAR_UNPACK_FAILED:'+unpack.stderr);
 for(const p of ['green-noir.css','green-noir.js','green_noir_patch.py'])assert(readFileSync(join(ROOT,p)).length>0,'PATCH_SOURCE_MISSING:'+p);
 const addonBase64=readFileSync(join(ROOT,'enhance-source.br.b64'),'utf8').trim();
 const addonBytes=Buffer.from(addonBase64,'base64');
 assert.equal(hash(addonBytes),'a67377decdf8bdf6296e2e0e3cf27b76d763674ed2377888ba80a59936bb52d4','ENHANCEMENT_SOURCE_SHA_MISMATCH');
 const addonTar=(await import('node:zlib')).brotliDecompressSync(addonBytes);
 const addonPath=join(ROOT,'enhance-source.tar');writeFileSync(addonPath,addonTar);
 const addonUnpack=spawnSync('tar',['-xf',addonPath,'-C',ROOT],{encoding:'utf8'});
 assert.equal(addonUnpack.status,0,'ENHANCE_TAR_UNPACK_FAILED:'+addonUnpack.stderr);
 for(const p of ['apply_enhance.py','green-noir-enhance.css','green-noir-enhance.js'])assert(readFileSync(join(ROOT,p)).length>0,'ENHANCE_SOURCE_MISSING:'+p);
 const addonCheck=spawnSync('node',['--check',join(ROOT,'green-noir-enhance.js')],{encoding:'utf8'});
 assert.equal(addonCheck.status,0,'ENHANCE_JS_SYNTAX:'+addonCheck.stderr);
 const jsCheck=spawnSync('node',['--check',join(ROOT,'green-noir.js')],{encoding:'utf8'});
 assert.equal(jsCheck.status,0,'MOBILE_JS_SYNTAX:'+jsCheck.stderr);

 original=await active();
 assert(original.id&&original.deployment,'ACTIVE_VERSION_MISSING');
 const base=await version(original.id);const previousConfig=await config();
 const main=base.modules.find(m=>m.name===base.main_module);
 const indexModule=base.modules.find(m=>m.name==='assets/index.html');
 assert(main&&indexModule,'ACTIVE_VERSION_MODULE_MISSING');
 const old=Buffer.from(indexModule.content_base64,'base64');
 assert(old.length>50000,'ACTIVE_INDEX_SUSPICIOUSLY_SMALL');
 const currentIndexSha=hash(old);
 const originalIndex=old.toString('utf8');
 const inventory=JSON.parse(readFileSync('deploy-assets/member-orange-only-20261015/provenance.json','utf8')).paths;
 assert.equal(new Set(inventory).size,inventory.length,'DUPLICATE_ASSETS');
 const extra='ball46-footer.css',paths=[...inventory,extra];
 const referred=[...originalIndex.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
  .map(m=>new URL(m[1].replaceAll('&amp;','&'),ORIGIN))
  .filter(u=>u.origin===ORIGIN).map(u=>u.pathname.slice(1));
 const unknown=[...new Set(referred.filter(p=>!paths.includes(p)))];
 assert.deepEqual(unknown,['color-semantics-stat-entry-20261011.js'],'UNKNOWN_REFERENCES_CHANGED');
 const missing=await bytes(ORIGIN,'/color-semantics-stat-entry-20261011.js');
 assert.equal(missing.status,404,'KNOWN_MISSING_JS_BECAME_ACTIVE');
 const baseFiles=await allAssets(ORIGIN,paths);
 const sourceIndex=baseFiles.get('index.html');
 assert.equal(sourceIndex.sha,currentIndexSha,'PRODUCTION_PUBLIC_NOT_ACTIVE');
 const footer=baseFiles.get(extra);assert(footer.type.includes('text/css'),'FOOTER_IS_NOT_CSS');
 const assetView=await allAssets(preview(original.id),paths);
 for(const [p,f] of baseFiles)assert.equal(assetView.get(p).sha,f.sha,'ACTIVE_PREVIEW_ASSET_DRIFT:'+p);
 const before=await health(ORIGIN);
 report.beforeScreenshots=await visualComparison(preview(original.id),'before');
 report.phase='BASE_VALIDATED';
 report.preflight={activeVersion:original.id,deployment:original.deployment,indexSha:sourceIndex.sha,mainSha:hash(Buffer.from(main.content_base64,'base64')),files:paths.length,extraAsset:extra,bindings:base.bindings.map(x=>({type:x.type,name:x.name})),domains:previousConfig.domains,health:before};save();

 const originalPath=join(ROOT,'active-index.html'),candidatePath=join(ROOT,'candidate-index.html');
 writeFileSync(originalPath,old);
 const patched=spawnSync('python3',[join(ROOT,'apply_borderless_soft.py'),originalPath,join(ROOT,'borderless-soft.css'),candidatePath],{encoding:'utf8'});
 assert.equal(patched.status,0,'PATCH_FAILED:'+patched.stderr);
 const html=readFileSync(candidatePath,'utf8');
 assert(html.includes('b46-mobile-deep-teal-20261018')&&html.includes('b46-mobile-deep-teal-runtime-20261018'),'PATCH_MARKERS_MISSING');
 assert(html.includes('b46m-compact-brand-hidden-heading-20261018'),'COMPACT_BRAND_PATCH_MISSING');
 assert(html.includes('b46gn-mobile-real-board-20261018')&&html.includes('b46gn-mobile-real-board-runtime-20261018'),'GREEN_NOIR_PATCH_MISSING');
 assert(html.includes('b46gn-flow-kits-menu-runtime-20261018')&&html.includes('b46gn-flow-kits-menu-style-20261018'),'PREVIOUS_EVENTFLOW_KITS_MISSING');
 assert(html.includes('b46gn-mobile-wide7-hidehero-20261018'),'PREVIOUS_WIDE7_HIDE_HERO_MISSING');
 assert(html.includes('b46gn-tools-markets-wide7-20261019'),'PREVIOUS_TOOLS_MARKETS_WIDE7_PATCH_MISSING');
 assert(html.includes('b46gn-mobile-borderless-soft-20261019'),'BORDERLESS_SOFT_PATCH_MISSING');
 const uploadedFiles=new Map([...baseFiles].map(([p,file])=>[p,{bytes:p==='index.html'?Buffer.from(html):file.bytes,type:file.type}]));
 assert.equal(uploadedFiles.size,paths.length,'NEW_ASSET_SET_INCOMPLETE');
 report.change={path:'index.html',before:hash(old),after:hash(Buffer.from(html)),unchangedAssets:paths.length-1};
 save();

 assert.equal((await active()).id,original.id,'ACTIVE_CHANGED_DURING_ASSET_READ');
 const uploaded=await completeAssetUpload({account:ACCOUNT,script:SCRIPT,files:uploadedFiles,expectedPaths:paths,api:cf});
 report.upload={files:uploaded.fileCount,completionToken:!!uploaded.jwt,uploadedHashes:uploaded.uploadedHashCount};
 assert.equal((await active()).id,original.id,'UPLOAD_ALTERED_ACTIVE');
 const payload=createPayload(base,html,uploaded.jwt,MARK);
 payload.annotations['workers/message']='BALL46 main mobile: borderless menu/search controls, soft borderless match cards only';
 candidate=(await cf('/workers/workers/'+SCRIPT+'/versions?deploy=false',payload)).id;
 assert(candidate&&candidate!==original.id,'CANDIDATE_INVALID');
 const cv=await version(candidate);
 assert.equal(cv.annotations?.['workers/tag'],MARK,'CANDIDATE_NOT_OWNED');
 const hashes=v=>v.modules.map(m=>[m.name,hash(Buffer.from(m.content_base64,'base64'))]).sort(([a],[b])=>a.localeCompare(b));
 assert.deepEqual(hashes(cv),hashes({modules:candidateModules(base,html)}),'CANDIDATE_MODULES_CHANGED');
 assert.equal(canonical(cv.bindings),canonical(base.bindings),'CANDIDATE_BINDINGS_CHANGED');
 assert.equal(canonical(cv.assets?.config),canonical(base.assets?.config),'CANDIDATE_ASSET_CONFIG_CHANGED');
 assert.equal(cv.compatibility_date,base.compatibility_date,'COMPATIBILITY_DATE_CHANGED');
 const candidateHost=preview(candidate);
 const previewFiles=await allAssets(candidateHost,paths);
 for(const [p,f] of uploadedFiles)assert.equal(previewFiles.get(p).sha,hash(f.bytes),'CANDIDATE_ASSET_DRIFT:'+p);
 report.candidate={id:candidate,url:candidateHost,health:await health(candidateHost)};
 report.phase='CANDIDATE_VERIFIED';save();
 report.candidate.screenshots=await ui(candidateHost,'candidate');
 report.candidate.comparison=await visualComparison(candidateHost,'candidate');
 assert.equal(canonical(await config()),canonical(previousConfig),'DEPLOY_CONFIGURATION_CHANGED_BEFORE_ACTIVATION');
 assert.equal((await active()).id,original.id,'CANDIDATE_ALTERED_ACTIVE');
 report.phase='UI_VERIFIED';save();
 console.log('BALL46 CANDIDATE OK',JSON.stringify({version:candidate,assetCount:paths.length,index:report.change.after,screenshots:report.candidate.screenshots}));
 report.activationDeployment=await deploy(candidate,original.id,'BALL46 main mobile Borderless & Soft Elevation owner approved');
 activated=true;report.activated=true;report.phase='ACTIVATED';save();
 await waitPublicIndex(report.change.after);
 report.productionScreenshots=await ui(ORIGIN,'production');
 report.productionComparison=await visualComparison(ORIGIN,'production');
 report.postHealth=await health(ORIGIN);
 assert.equal(canonical(await config()),canonical(previousConfig),'PRODUCTION_CONFIGURATION_CHANGED');
 assert.equal((await active()).id,candidate,'ACTIVE_CHANGED_AFTER_ACTIVATION');
 report.phase='SUCCESS';report.ok=true;report.finishedAt=new Date().toISOString();save();
 console.log('BALL46 BORDERLESS SOFT ELEVATION DEPLOY SUCCESS',JSON.stringify({activeVersion:candidate,previousVersion:original.id,deployment:report.activationDeployment}));
}catch(error){
 report.error=String(error?.stack||error);
 console.error('BALL46 DEPLOY BLOCKED:',String(error?.message||error));
 if((activated||activationAttempted)&&original?.id){
  const seen=await active().catch(()=>null);
  if(seen?.id!==candidate){
    report.phase='ACTIVATION_UNVERIFIED_OR_CONCURRENT_UPDATE';
    report.currentActive=seen?.id||null;
    report.ok=false;report.finishedAt=new Date().toISOString();save();
    process.exitCode=1;
  }else {
  try {
   report.rollbackDeployment=await deploy(original.id,candidate,'ROLLBACK BALL46 Green Noir on postdeploy failure');
   await waitPublicIndex(report.preflight.indexSha,90000);
   report.phase='ROLLED_BACK';report.activated=false;
  }catch(rollbackError){report.rollbackError=String(rollbackError?.stack||rollbackError);report.phase='ROLLBACK_FAILED';}
 }
 } else report.phase='BLOCKED_BEFORE_PRODUCTION_ACTIVATION';
 report.ok=false;report.finishedAt=new Date().toISOString();save();
 process.exitCode=1;
}
