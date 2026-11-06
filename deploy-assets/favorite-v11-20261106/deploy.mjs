import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const MARK='BALL46_FAVORITE_V11_20261106';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const favJs=readFileSync('../favorite-v1-20261106/favorite-v1.js','utf8');
const sha=b=>createHash('sha256').update(b).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const canon=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
let base=null,candidate=null,activated=false;

async function api(path,options={}){
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json();assert(r.ok&&j.success===true,`CF_ERROR ${r.status} ${JSON.stringify(j.errors||j)}`);return j.result;
}
async function active(){
  const d=await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
  const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_NOT_SINGLE_VERSION');
  return v[0].version_id;
}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function activate(id,msg){
  await api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
async function ensureTheme(page,want){
  for(let i=0;i<3;i++){
    const cur=await page.evaluate(()=>document.documentElement.dataset.theme||'');
    if(cur===want)return;
    const ok=await page.evaluate(()=>{const b=document.querySelector('.workspace-theme-btn');if(!b)return false;b.click();return true});
    assert(ok,'THEME_BUTTON_MISSING'); await delay(250);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),want,'THEME_SWITCH_FAILED');
}
async function qaSurface(browser,name,viewport,theme){
  const page=await browser.newPage(); await page.setViewport(viewport);
  try{
    await page.goto(ORIGIN+'/?favProdQa='+name+theme+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await delay(4800); await ensureTheme(page,theme); await delay(250);
    await page.evaluate(()=>{try{localStorage.removeItem('ball46_favorites_v1')}catch{}});
    await page.reload({waitUntil:'domcontentloaded',timeout:90000});
    await delay(3800); await ensureTheme(page,theme); await delay(180);
    const out=await page.evaluate(name=>{
      const surface=name==='mobile'?'mobile':'desktop';
      const selector=surface==='mobile'?'.b46gn-card[data-b46gn-fixture]':'.match-row[data-match-id]';
      const node=document.querySelector(selector);
      if(!node)return {missing:'row'};
      const star=node.querySelector('[data-b46-favorite-surface="'+surface+'"]');
      const filter=document.querySelector('[data-b46-favorite-filter="'+surface+'"]');
      const r=star?.getBoundingClientRect(),nr=node.getBoundingClientRect();
      return {
        theme:document.documentElement.dataset.theme,
        id:surface==='mobile'?node.getAttribute('data-b46gn-fixture'):node.getAttribute('data-match-id'),
        glyph:star?.textContent||null,
        pressed:star?.getAttribute('aria-pressed')||null,
        starCount:document.querySelectorAll('[data-b46-favorite-surface="'+surface+'"]').length,
        rowCount:document.querySelectorAll(selector).length,
        filter:Boolean(filter),
        x:r?.x||0,w:r?.width||0,h:r?.height||0,nodeX:nr.x,nodeW:nr.width
      };
    },name);
    assert(!out.missing,'ROW_MISSING');
    assert.equal(out.theme,theme,'THEME_BAD');
    assert.equal(out.glyph,'☆','INACTIVE_GLYPH_BAD');
    assert.equal(out.pressed,'false','INACTIVE_STATE_BAD');
    assert.equal(out.starCount,out.rowCount,'STAR_COUNT_BAD');
    assert(out.filter,'FILTER_MISSING');
    assert(out.w>=35&&out.h>=35,'TOUCH_TARGET_BAD');
    assert(out.x-out.nodeX<=4,'STAR_NOT_LEFT');
    await page.evaluate((name,id)=>{
      const s=name==='mobile'?'mobile':'desktop';
      document.querySelector('[data-b46-favorite-surface="'+s+'"][data-b46-favorite-toggle="'+CSS.escape(id)+'"]')?.click();
    },name,out.id);
    await delay(150);
    const activeState=await page.evaluate((name,id)=>{
      const s=name==='mobile'?'mobile':'desktop';
      const el=document.querySelector('[data-b46-favorite-surface="'+s+'"][data-b46-favorite-toggle="'+CSS.escape(id)+'"]');
      return {glyph:el?.textContent,pressed:el?.getAttribute('aria-pressed'),storage:localStorage.getItem('ball46_favorites_v1')};
    },name,out.id);
    assert.equal(activeState.glyph,'★','ACTIVE_GLYPH_BAD');
    assert.equal(activeState.pressed,'true','ACTIVE_STATE_BAD');
    assert(activeState.storage?.includes(out.id),'STORAGE_BAD');
    return {out,activeState};
  }finally{await page.close()}
}
async function browserQa(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>{try{return !!readFileSync(p)}catch{return false}});
  assert(exe,'CHROME_MISSING');
  const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const pcLight=await qaSurface(browser,'pc',{width:1280,height:900,deviceScaleFactor:1},'light');
    const pcDark=await qaSurface(browser,'pc',{width:1280,height:900,deviceScaleFactor:1},'dark');
    const mobLight=await qaSurface(browser,'mobile',{width:390,height:844,isMobile:true,deviceScaleFactor:2},'light');
    const mobDark=await qaSurface(browser,'mobile',{width:390,height:844,isMobile:true,deviceScaleFactor:2},'dark');
    return {pcLight,pcDark,mobLight,mobDark};
  }finally{await browser.close()}
}

try{
  assert(favJs.includes('BALL46_FAVORITE_V1_TEST_20261106'),'FAVORITE_MARKER_MISSING');
  base=await active();
  const current=await version(base);
  const index=current.modules.find(m=>m.name==='assets/index.html'); assert(index,'INDEX_MISSING');
  const src=Buffer.from(index.content_base64,'base64').toString('utf8');
  const injected=`<script id="b46-favorite-v11-20261106">/* ${MARK} */\n${favJs}</script>`;
  const start=src.indexOf('<script id="b46-favorite-v11-20261106">');
  let patched;
  if(start>=0){
    const end=src.indexOf('</script>',start);
    assert(end>start,'EXISTING_FAVORITE_END_MISSING');
    patched=src.slice(0,start)+injected+src.slice(end+9);
  }else{
    assert.equal(src.split('</body>').length-1,1,'BODY_ANCHOR_CHANGED');
    patched=src.replace('</body>',injected+'</body>');
  }

  const settingsBefore=await api(`/scripts/${SCRIPT}/settings`);
  const cronsBefore=await api(`/scripts/${SCRIPT}/schedules`);
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');

  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':MARK,'workers/message':'Favorite V1.1 left-column light-dark PC-mobile'}};
  if(current.placement)metadata.placement=current.placement;
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name==='assets/index.html'?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
    let type=m.content_type;
    if(!type){if(m.name===current.main_module||/\.m?js$/.test(m.name))type='application/javascript+module';else if(m.name.endsWith('.html'))type='text/html';else if(m.name.endsWith('.css'))type='text/css';else type='application/octet-stream';}
    form.append(m.name,new Blob([bytes],{type}),m.name);
  }
  const uploaded=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});assert(uploaded?.id,'CANDIDATE_ID_MISSING');candidate=uploaded.id;

  const cv=await version(candidate);
  assert.equal(canon(cv.bindings),canon(current.bindings),'BINDINGS_CHANGED');
  assert.equal(cv.modules.length,current.modules.length,'MODULE_COUNT_CHANGED');
  for(const m of current.modules){
    const cm=cv.modules.find(x=>x.name===m.name);assert(cm,`MODULE_MISSING:${m.name}`);
    if(m.name==='assets/index.html')assert.equal(sha(Buffer.from(cm.content_base64,'base64')),sha(Buffer.from(patched)),'INDEX_HASH_BAD');
    else assert.equal(sha(Buffer.from(cm.content_base64,'base64')),sha(Buffer.from(m.content_base64,'base64')),`UNRELATED_MODULE_CHANGED:${m.name}`);
  }

  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(canon(await api(`/scripts/${SCRIPT}/settings`)),canon(settingsBefore),'SETTINGS_CHANGED_BEFORE_ACTIVATE');
  assert.equal(canon(await api(`/scripts/${SCRIPT}/schedules`)),canon(cronsBefore),'CRONS_CHANGED_BEFORE_ACTIVATE');

  await activate(candidate,'Deploy Favorite V1.1');
  activated=true;
  for(let i=0;i<20;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const qa=await browserQa();
  assert.equal(canon(await api(`/scripts/${SCRIPT}/settings`)),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await api(`/scripts/${SCRIPT}/schedules`)),canon(cronsBefore),'CRONS_CHANGED');
  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('QA='+JSON.stringify(qa));
  console.log('BALL46_FAVORITE_V11_DEPLOY_SUCCESS');
}catch(e){
  console.error(e.stack);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback Favorite V1.1 after failed verification');
      for(let i=0;i<20;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb)}
  process.exit(1);
}
