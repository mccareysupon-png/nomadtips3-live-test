import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const MARK='BALL46_FULLMARKET_PUBLIC_COPY_HIDE_20261106';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const css=readFileSync('fullmarket-copy-hide.css','utf8');
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
async function upload(current,patchedMain){
  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':MARK,'workers/message':'Hide Full Market internal snapshot diagnostics only'}};
  if(current.placement)metadata.placement=current.placement;
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const m of current.modules){
    const bytes=m.name===current.main_module?Buffer.from(patchedMain):Buffer.from(m.content_base64,'base64');
    let type=m.content_type;
    if(!type){if(m.name===current.main_module||/\.m?js$/.test(m.name))type='application/javascript+module';else if(m.name.endsWith('.html'))type='text/html';else if(m.name.endsWith('.css'))type='text/css';else type='application/octet-stream';}
    form.append(m.name,new Blob([bytes],{type}),m.name);
  }
  const r=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});assert(r?.id,'CANDIDATE_ID_MISSING');return r.id;
}
async function browserQa(){
  const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>{try{return !!readFileSync(p)}catch{return false}});
  assert(exe,'CHROME_MISSING');
  const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1268,height:760});
    await page.goto(ORIGIN+'/?fmbProdQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector('.match-row[data-match-id]',{timeout:90000});await delay(4500);
    const rows=await page.$$('.match-row[data-match-id]');
    let opened=false;
    for(const row of rows.slice(0,12)){
      await row.click();await delay(1300);
      if(await page.$('.expand-full-market-card .fmb-head')){opened=true;break}
    }
    assert(opened,'FULL_MARKET_NOT_OPENED');
    const st=await page.evaluate(()=>{
      const head=document.querySelector('.expand-full-market-card .fmb-head span');
      const bulk=document.querySelector('.expand-full-market-card .fmb-head > div > b');
      const snap=document.querySelector('.expand-full-market-card .fmb-head > small');
      return {
        heading:head?.textContent?.trim()||'',
        headingDisplay:head?getComputedStyle(head).display:null,
        bulkDisplay:bulk?getComputedStyle(bulk).display:null,
        snapDisplay:snap?getComputedStyle(snap).display:null,
        tabs:document.querySelectorAll('.expand-full-market-card [data-fmb-book]').length,
        markets:document.querySelectorAll('.expand-full-market-card .fmb-market').length,
        tables:document.querySelectorAll('.expand-full-market-card .fmb-market table').length
      };
    });
    assert(st.bulkDisplay==='none','BULK_LABEL_VISIBLE');
    assert(st.snapDisplay==='none','SNAPSHOT_LABEL_VISIBLE');
    assert(st.headingDisplay!=='none'&&/FULL MARKET · BOOKMAKERS/i.test(st.heading),'PUBLIC_HEADING_BAD');
    assert(st.tabs>0&&st.markets>0&&st.tables>0,'FULL_MARKET_DATA_BAD');
    return st;
  } finally { await browser.close(); }
}

try{
  assert(css.includes(MARK),'CSS_MARKER_MISSING');
  base=await active();
  const current=await version(base);
  const main=current.modules.find(m=>m.name===current.main_module);assert(main,'MAIN_MISSING');
  const indexAsset=current.modules.find(m=>m.name==='assets/index.html');assert(indexAsset,'INDEX_ASSET_MISSING');
  const source=Buffer.from(indexAsset.content_base64,'base64').toString('utf8');
  assert(!source.includes(MARK),'PATCH_ALREADY_PRESENT');

  const anchor='</head>';
  assert.equal(source.split(anchor).length-1,1,'INDEX_HEAD_ANCHOR_CHANGED');
  const style=`<style id="b46-fullmarket-copy-hide-20261106">${css}</style>`;
  const patched=source.replace(anchor,style+anchor);

  const settingsBefore=await api(`/scripts/${SCRIPT}/settings`);
  const cronsBefore=await api(`/scripts/${SCRIPT}/schedules`);
  assert.equal(await active(),base,'PRODUCTION_MOVED_BEFORE_UPLOAD');

  const metadata={main_module:current.main_module,compatibility_date:current.compatibility_date,compatibility_flags:current.compatibility_flags||[],bindings:current.bindings,keep_assets:true,assets:{config:current.assets?.config},annotations:{'workers/tag':MARK,'workers/message':'Hide Full Market internal snapshot diagnostics only'}};
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

  await activate(candidate,'Hide Full Market internal snapshot/request labels');
  activated=true;
  for(let i=0;i<20;i++){if(await active()===candidate)break;await delay(1000)}
  assert.equal(await active(),candidate,'CANDIDATE_NOT_ACTIVE');

  const qa=await browserQa();
  assert.equal(canon(await api(`/scripts/${SCRIPT}/settings`)),canon(settingsBefore),'SETTINGS_CHANGED');
  assert.equal(canon(await api(`/scripts/${SCRIPT}/schedules`)),canon(cronsBefore),'CRONS_CHANGED');
  console.log('BASE_VERSION='+base);
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('QA='+JSON.stringify(qa));
  console.log('BALL46_FULLMARKET_COPY_HIDE_DEPLOY_SUCCESS');
}catch(e){
  console.error(e.stack);
  try{
    if(activated&&base&&candidate&&await active()===candidate){
      await activate(base,'Rollback Full Market copy hide after failed verification');
      for(let i=0;i<20;i++){if(await active()===base)break;await delay(1000)}
      assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
      console.log('ROLLBACK_CONFIRMED='+base);
    }
  }catch(rb){console.error('ROLLBACK_ERROR',rb)}
  process.exit(1);
}
