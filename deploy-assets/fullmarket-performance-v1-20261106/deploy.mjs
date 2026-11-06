import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const MARK='BALL46_FULLMARKET_PERFORMANCE_V1_20261106';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const css=readFileSync('fullmarket-performance-v1.css','utf8');
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
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_NOT_SINGLE_VERSION');
  return v[0].version_id;
}
async function version(id){return api(`/workers/${SCRIPT}/versions/${id}?include=modules`)}
async function activate(id,msg){
  await api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})});
}
async function browserQa(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>{try{return !!readFileSync(p)}catch{return false}});
  assert(exe,'CHROME_MISSING');
  const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:2});
    await page.goto(ORIGIN+'/?fmbPerfProdQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector('.match-row[data-match-id]',{timeout:90000});await delay(4500);
    const ids=await page.evaluate(()=>Array.from(document.querySelectorAll('.match-row[data-match-id]')).slice(0,12).map(e=>e.dataset.matchId).filter(Boolean));
    let opened=false;
    for(const id of ids){
      await page.evaluate(mid=>document.querySelector('.match-row[data-match-id="'+CSS.escape(mid)+'"]')?.click(),id);
      await delay(1200);
      if(await page.$('.expand-full-market-card .fmb-market')){opened=true;break}
    }
    assert(opened,'FULL_MARKET_NOT_OPENED');
    const st=await page.evaluate(()=>{
      const m=document.querySelector('.expand-full-market-card .fmb-market');
      const t=document.querySelector('.expand-full-market-card .fmb-table-wrap');
      const tabs=document.querySelector('.expand-full-market-card .fmb-tabs');
      const ms=m?getComputedStyle(m):null,ts=t?getComputedStyle(t):null,tabsS=tabs?getComputedStyle(tabs):null;
      return {
        bookmakerTabs:document.querySelectorAll('.expand-full-market-card [data-fmb-book]').length,
        markets:document.querySelectorAll('.expand-full-market-card .fmb-market').length,
        tables:document.querySelectorAll('.expand-full-market-card .fmb-market table').length,
        contentVisibility:ms?.contentVisibility||null,
        marketContain:ms?.contain||null,
        tableContain:ts?.contain||null,
        tabsContain:tabsS?.contain||null,
        boxShadow:ms?.boxShadow||null
      };
    });
    assert.equal(st.bookmakerTabs,19,'BOOKMAKER_COUNT_CHANGED');
    assert.equal(st.markets,14,'MARKET_COUNT_CHANGED');
    assert.equal(st.tables,14,'TABLE_COUNT_CHANGED');
    assert.equal(st.contentVisibility,'auto','CONTENT_VISIBILITY_NOT_ACTIVE');
    assert(/layout/.test(st.marketContain)&&/paint/.test(st.marketContain),'MARKET_CONTAIN_NOT_ACTIVE');
    assert(/layout/.test(st.tableContain)&&/paint/.test(st.tableContain),'TABLE_CONTAIN_NOT_ACTIVE');
    assert(/layout/.test(st.tabsContain)&&/paint/.test(st.tabsContain),'TABS_CONTAIN_NOT_ACTIVE');
    assert(st.boxShadow==='none','MOBILE_SHADOW_NOT_REMOVED');
    return st;
  }finally{await browser.close()}
}

try{
  assert(css.includes(MARK),'CSS_MARKER_MISSING');
  base=await active();
  const current=await version(base);
  const indexAsset=current.modules.find(m=>m.name==='assets/index.html');assert(indexAsset,'INDEX_ASSET_MISSING');
  const source=Buffer.from(indexAsset.content_base64,'base64').toString('utf8');
  assert(!source.includes(MARK),'PATCH_ALREADY_PRESENT');
  const anchor='</head>';
  assert.equal(source.split(anchor).length-1,1,'INDEX_HEAD_ANCHOR_CHANGED');
  const style=`<style id="b46-fullmarket-performance-v1-20261106">${css}</style>`;
  const patched=source.replace(anchor,style+anchor);

  const settingsBefore=await api(`/scripts/${SCRIPT}/settings`);
  const cronsBefore=await api(`/scripts/${SCRIPT}/schedules`);
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');

  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':MARK,'workers/message':'Full Market Performance V1 rendering CSS only'}};
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

  await activate(candidate,'Deploy Full Market Performance V1 rendering optimization');
  activated=true;
  for(let i=0;i<20;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const qa=await browserQa();
  assert.equal(canon(await api(`/scripts/${SCRIPT}/settings`)),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await api(`/scripts/${SCRIPT}/schedules`)),canon(cronsBefore),'CRONS_CHANGED');

  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('QA='+JSON.stringify(qa));
  console.log('BALL46_FULLMARKET_PERFORMANCE_V1_DEPLOY_SUCCESS');
}catch(e){
  console.error(e.stack);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback Full Market Performance V1 after failed verification');
      for(let i=0;i<20;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb)}
  process.exit(1);
}
