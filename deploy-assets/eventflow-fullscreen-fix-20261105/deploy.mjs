import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';
import puppeteer from 'puppeteer-core';

const MARK='B46_EVENTFLOW_FULLSCREEN_PORTAL_FIX_20261105';
const TARGET='__B46_EVENTFLOW_SIGNAL_JS_20261002__';
const SCRIPT='ball46-production';
const ORIGIN='https://ball46.com';
const DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,marker:MARK,target:TARGET,startedAt:new Date().toISOString(),scope:'Event Flow fullscreen lifecycle only'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null,activated=false;

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);
  return j.result;
}
async function activeVersion(){
  const r=await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
  const v=r.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_VERSION');
  return v[0].version_id;
}
async function getVersion(id){const v=await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);assert(v.main_module&&v.modules?.length,'VERSION_MODULES_MISSING');return v}
async function schedules(){const r=await api(`/scripts/${SCRIPT}/schedules`);const e=Array.isArray(r)?r:r.schedules;assert(Array.isArray(e),'SCHEDULES_MISSING');return e.map(x=>x.cron).sort()}
async function publicFile(path,origin=ORIGIN){
  const u=new URL(path,origin);u.searchParams.set('eventFlowDeployAudit',Date.now()+''+Math.random());
  const r=await fetch(u,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(45000)});
  assert(r.ok,`PUBLIC_HTTP:${u.pathname}:${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function backend(){
  const out={};
  for(const [k,p] of [['engine','/api/engine/health'],['market','/api/full-market/health'],['statistics','/api/engine/statistics']]){
    const j=JSON.parse(await publicFile(p));
    assert(j.ok===true,`BACKEND_NOT_OK:${k}`);
    out[k]=k==='statistics'?j.settlementRevision:j.version;
  }
  return out;
}
function literals(source){
  const found=new Map();
  const walk=n=>{if(!n||typeof n!=='object')return;
    if(n.type==='VariableDeclarator'&&n.id?.type==='Identifier'&&n.id.name.startsWith('__B46_')&&n.init?.type==='Literal'&&typeof n.init.value==='string'){
      assert(!found.has(n.id.name),`DUP_LITERAL:${n.id.name}`);found.set(n.id.name,{start:n.init.start,end:n.init.end,value:n.init.value});
    }
    for(const [k,c] of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(c))c.forEach(walk);else if(c&&typeof c==='object')walk(c)}
  };
  walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
  return found;
}
function patchOne(source,name,value){
  const found=literals(source),hit=found.get(name);assert(hit,`TARGET_LITERAL_MISSING:${name}`);
  return source.slice(0,hit.start)+JSON.stringify(value)+source.slice(hit.end);
}
function contentType(module,current){
  if(module.content_type)return module.content_type;
  if(module.name===current.main_module||/\.m?js$/.test(module.name))return 'application/javascript+module';
  if(module.name.endsWith('.bin'))return 'application/octet-stream';
  if(module.name.endsWith('.txt'))return 'text/plain';
  throw new Error('MODULE_CONTENT_TYPE_UNKNOWN:'+module.name);
}
async function uploadVersion(current,patchedSource){
  const metadata={
    main_module:current.main_module,
    compatibility_date:current.compatibility_date,
    compatibility_flags:current.compatibility_flags||[],
    bindings:current.bindings,
    keep_assets:true,
    assets:{config:current.assets.config},
    annotations:{'workers/tag':MARK,'workers/message':'BALL46 Event Flow fullscreen lifecycle fix only'}
  };
  if(current.placement)metadata.placement=current.placement;
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
  for(const module of current.modules){
    const bytes=module.name===current.main_module?Buffer.from(patchedSource):Buffer.from(module.content_base64,'base64');
    form.append(module.name,new Blob([bytes],{type:contentType(module,current)}),module.name);
  }
  const r=await api(`/scripts/${SCRIPT}/versions`,{method:'POST',body:form});
  assert(r?.id,'VERSION_UPLOAD_ID_MISSING');return r.id;
}
async function activate(id){
  await api(`/scripts/${SCRIPT}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'BALL46 Event Flow fullscreen fix 20261105'}})});
}
async function verifyLiveBrowser(){
  const w=spawnSync('bash',['-lc','command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser'],{encoding:'utf8'});
  const executable=(w.stdout||'').trim();
  assert(executable,'CHROME_MISSING');
  const browser=await puppeteer.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
    await page.setViewport({width:1628,height:889});
    await page.goto(ORIGIN+'/?eventFlowProdQa='+Date.now(),{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForSelector('.match-row[data-match-id]',{timeout:90000});await delay(4000);
    const id=await page.$eval('.match-row[data-match-id]',e=>e.dataset.matchId);
    await page.click(`.match-row[data-match-id="${id}"]`);
    await page.waitForSelector('.expand-flow-card [data-eventflow-expand-toggle]',{timeout:60000});
    await page.click('.expand-flow-card [data-eventflow-expand-toggle]');
    await page.waitForFunction(()=>document.body.classList.contains('b46-eventflow-viewport-lock'),{timeout:10000});
    await delay(300);
    const expanded=await page.evaluate(()=>{const f=document.querySelector('.expand-flow-card.b46-eventflow-viewport-expanded'),r=f?.getBoundingClientRect(),d=f?.closest('dialog.b46-eventflow-top-layer');return{parentIsDialog:Boolean(d),dialogOpen:Boolean(d?.open),x:r?.x,y:r?.y,w:r?.width,h:r?.height,vw:innerWidth,vh:innerHeight}});
    assert(expanded.parentIsDialog&&expanded.dialogOpen&&expanded.x<=1&&expanded.y<=1&&expanded.w>=expanded.vw-2&&expanded.h>=expanded.vh-2,'LIVE_FULLSCREEN_NOT_VIEWPORT');
    for(let i=0;i<2;i++){await page.evaluate(()=>window.NOMAD343_EXPANDED_MATCH?.reload?.());await delay(900)}
    const after=await page.evaluate(()=>({bodyLock:document.body.classList.contains('b46-eventflow-viewport-lock'),portal:Boolean(document.querySelector('dialog.b46-eventflow-top-layer[open] > .expand-flow-card.b46-eventflow-viewport-expanded')),button:Boolean(document.querySelector('.expand-flow-card [data-eventflow-expand-toggle]')),svg:Boolean(document.querySelector('.expand-flow-card .expand-flow-chart svg'))}));
    assert(after.bodyLock&&after.portal&&after.button&&after.svg,'LIVE_REFRESH_BROKE_FULLSCREEN');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.body.classList.contains('b46-eventflow-viewport-lock'),{timeout:10000});
    const closed=await page.evaluate(()=>({restored:Boolean(document.querySelector('.match-expanded .expand-flow-card')),portal:Boolean(document.querySelector('dialog.b46-eventflow-top-layer[open] > .expand-flow-card.b46-eventflow-viewport-expanded')),dialog:Boolean(document.querySelector('dialog.b46-eventflow-top-layer')),locks:document.body.classList.contains('b46-eventflow-viewport-lock')||document.documentElement.classList.contains('b46-eventflow-viewport-lock')}));
    assert(closed.restored&&!closed.portal&&!closed.dialog&&!closed.locks,'LIVE_FULLSCREEN_CLEANUP_FAILED');
    assert.equal(errors.length,0,'LIVE_PAGE_ERRORS:'+errors.join('|'));
    return{expanded,after,closed};
  }finally{await browser.close()}
}
async function rollback(){
  if(!activated||!base)return;
  const active=await activeVersion();
  if(active===base)return;
  assert.equal(active,candidate,'PRODUCTION_MOVED_REFUSE_ROLLBACK');
  await activate(base);
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={version:base,confirmed:true};save();
}

try{
  base=await activeVersion();report.baseVersion=base;
  const current=await getVersion(base);
  const main=current.modules.find(m=>m.name===current.main_module);assert(main,'MAIN_MODULE_MISSING');
  const source=Buffer.from(main.content_base64,'base64').toString('utf8');
  const before=literals(source),target=before.get(TARGET);assert(target,'TARGET_LITERAL_MISSING');
  assert(!target.value.includes(MARK),'TARGET_ALREADY_PATCHED');
  writeFileSync('audit/expanded-match-current.js',target.value);
  const p=spawnSync(process.execPath,['patch-expanded-match.mjs','--input','audit/expanded-match-current.js','--output','audit/expanded-match-patched.js'],{encoding:'utf8'});
  if(p.stdout)process.stdout.write(p.stdout);if(p.stderr)process.stderr.write(p.stderr);assert(!p.error&&p.status===0,'PATCHER_FAILED');
  const patchedLiteral=readFileSync('audit/expanded-match-patched.js','utf8');
  const check=spawnSync(process.execPath,['--check','audit/expanded-match-patched.js'],{encoding:'utf8'});assert(!check.error&&check.status===0,'PATCHED_LITERAL_SYNTAX_BAD');
  assert(patchedLiteral.includes(MARK),'PATCH_MARKER_MISSING');

  const patchedSource=patchOne(source,TARGET,patchedLiteral);
  parse(patchedSource,{ecmaVersion:'latest',sourceType:'module'});
  const after=literals(patchedSource);
  for(const [name,b] of before){
    const a=after.get(name);assert(a,`LITERAL_REMOVED:${name}`);
    if(name===TARGET)assert.equal(sha(Buffer.from(a.value)),sha(Buffer.from(patchedLiteral)),'TARGET_PATCH_HASH_BAD');
    else assert.equal(sha(Buffer.from(a.value)),sha(Buffer.from(b.value)),`UNRELATED_LITERAL_CHANGED:${name}`);
  }

  const settingsBefore=await api(`/scripts/${SCRIPT}/settings`);
  const settingsSha=sha(Buffer.from(canonical(settingsBefore)));
  const cronsBefore=await schedules();
  const backendBefore=await backend();
  report.before={settingsSha,crons:cronsBefore,backend:backendBefore,targetSha:sha(Buffer.from(target.value)),patchedTargetSha:sha(Buffer.from(patchedLiteral)),workerSha:sha(Buffer.from(source)),patchedWorkerSha:sha(Buffer.from(patchedSource)),moduleCount:current.modules.length};save();

  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_BEFORE_VERSION_UPLOAD');
  candidate=await uploadVersion(current,patchedSource);report.candidateVersion=candidate;save();
  const cand=await getVersion(candidate);
  assert.equal(canonical(cand.bindings),canonical(current.bindings),'CANDIDATE_BINDINGS_CHANGED');
  assert.equal(canonical(cand.assets?.config),canonical(current.assets?.config),'CANDIDATE_ASSET_CONFIG_CHANGED');
  assert.equal(cand.modules.length,current.modules.length,'CANDIDATE_MODULE_COUNT_CHANGED');
  const cm=cand.modules.find(m=>m.name===cand.main_module);assert(cm,'CANDIDATE_MAIN_MISSING');
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),sha(Buffer.from(patchedSource)),'CANDIDATE_MAIN_HASH_BAD');
  for(const m of current.modules){if(m.name===current.main_module)continue;const x=cand.modules.find(y=>y.name===m.name);assert(x,`CANDIDATE_MODULE_MISSING:${m.name}`);assert.equal(sha(Buffer.from(x.content_base64,'base64')),sha(Buffer.from(m.content_base64,'base64')),`CANDIDATE_MODULE_CHANGED:${m.name}`)}

  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_BEFORE_ACTIVATE');
  assert.equal(sha(Buffer.from(canonical(await api(`/scripts/${SCRIPT}/settings`)))),settingsSha,'SETTINGS_MOVED_BEFORE_ACTIVATE');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_MOVED_BEFORE_ACTIVATE');
  assert.equal(canonical(await backend()),canonical(backendBefore),'BACKEND_MOVED_BEFORE_ACTIVATE');

  await activate(candidate);activated=true;
  for(let i=0;i<20;i++){if(await activeVersion()===candidate)break;await delay(1000)}
  assert.equal(await activeVersion(),candidate,'CANDIDATE_NOT_ACTIVE');

  for(const origin of [DIRECT,ORIGIN]){
    let ok=false,last='';
    for(let i=0;i<150;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_ROUTE_VERIFY');
      try{
        const b=await publicFile('/expanded-match-343.js',origin);
        const text=b.toString('utf8');
        last=sha(b);
        if(
          text.includes(MARK) &&
          text.includes('b46-eventflow-viewport-expanded') &&
          text.includes('data-eventflow-expand-toggle') &&
          text.includes('data-b46-flow=')
        ){ok=true;break}
      }catch{}
      await delay(1000)
    }
    assert(ok,`LIVE_ROUTE_PATCH_MARKER_BAD:${origin}:${last}`);
  }

  const [board,signals,stats]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics'].map(async p=>JSON.parse(await publicFile(p))));
  assert(board.ok===true&&Array.isArray(board.fixtures),'BOARD_BAD');
  assert(Array.isArray(signals.signals),'SIGNALS_BAD');
  assert(stats.ok===true&&Array.isArray(stats.rows),'STATS_BAD');
  assert.equal(sha(Buffer.from(canonical(await api(`/scripts/${SCRIPT}/settings`)))),settingsSha,'SETTINGS_CHANGED');
  assert.equal(canonical(await schedules()),canonical(cronsBefore),'CRONS_CHANGED');
  assert.equal(canonical(await backend()),canonical(backendBefore),'BACKEND_CHANGED');

  report.browser=await verifyLiveBrowser();
  const final=await getVersion(candidate),fm=final.modules.find(m=>m.name===final.main_module);
  assert.equal(sha(Buffer.from(fm.content_base64,'base64')),sha(Buffer.from(patchedSource)),'FINAL_MAIN_NOT_EXACT');
  assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_MOVED');

  report.result='SUCCESS';report.finalVersion=candidate;report.apiCounts={fixtures:board.fixtures.length,signals:signals.signals.length,settled:stats.rows.length};report.completedAt=new Date().toISOString();save();
  console.log('FINAL_PRODUCTION='+candidate);
  console.log('BALL46_EVENTFLOW_FULLSCREEN_DEPLOY_SUCCESS');
}catch(e){
  report.result='FAIL';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);
  try{await rollback()}catch(rb){report.rollbackError=rb.message;save();console.error('ROLLBACK_ERROR',rb)}
  process.exitCode=1;
}
