import assert from 'node:assert/strict';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { inspect,activeVersion,getVersion,api,script,origin,directOrigin,sha,canonical,publicFile,backend,manifest,literals } from './production.mjs';
import { rail,schedules,configFromCurrent,wrangler } from './rail.mjs';
import { patchEventFlowExpand,MARKER } from './eventflow-expand-patch.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const target='expanded-match-343.js',embeddedName='__B46_EVENTFLOW_SIGNAL_JS_20261002__';
const auditDir='audit/eventflow-expand-atomic';
const report={startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID||'local',commit:process.env.GITHUB_SHA||'local',deploy,scope:'Event Flow expanded-mode presentation only. Atomic update of the existing embedded Event Flow literal plus matching expanded-match-343.js static asset; no API, signal, odds, statistics, Full Market, routing, header/footer, or backend logic changes.'};
mkdirSync(auditDir,{recursive:true});
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function safeBindings(bs=[]){return bs.map(b=>({name:b.name,type:b.type,service:b.service??null,environment:b.environment??null,namespace_id:b.namespace_id??null,dataset:b.dataset??null})).sort((a,b)=>String(a.name).localeCompare(String(b.name)))}
function functionalSettings(s={}){return Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations'))}
function functionalVersion(v={}){return{main_module:v.main_module??null,compatibility_date:v.compatibility_date??null,compatibility_flags:v.compatibility_flags??[],usage_model:v.usage_model??null,placement:v.placement??{},bindings:safeBindings(v.bindings||[]),assets:v.assets??null}}

async function stage(version,settings,crons,source){
  const runtime=resolve('runtime-eventflow-expand-atomic'),assets=resolve(runtime,'assets');
  const paths=readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(paths.length,79,'CONFIRMED_RAIL_PATH_COUNT_CHANGED');assert.equal(new Set(paths).size,79,'CONFIRMED_RAIL_DUPLICATE_PATH');assert(paths.includes(target),'EVENTFLOW_PATH_MISSING');
  const hashes={};
  for(const path of paths){
    assert(/^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(path)&&!path.split('/').includes('..'),'UNSAFE_ASSET_PATH');
    const direct=await publicFile('/'+path,undefined,directOrigin),pub=await publicFile('/'+path);
    assert.equal(sha(pub),sha(direct),`CURRENT_PRODUCTION_HOSTS_DIFFER:${path}`);
    const out=resolve(assets,path);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,direct);hashes[path]=sha(direct);
  }
  for(const m of version.modules.filter(m=>m.name!==version.main_module)){
    const path=m.name.slice('assets/'.length),moduleSha=sha(Buffer.from(m.content_base64,'base64')),publicSha=hashes[path];
    if(moduleSha!==publicSha){const known=path==='index.html'&&moduleSha==='0da7f30886a1389a8cbab06822cb4bb81c6b9a90984003127775f372ab34a5d9'&&publicSha==='fc6a094fc8e4d8f39f5e67d527cf1352de821702e99701a1cbf66a95dc7b9b3b';assert(known,`CURRENT_TEXT_MODULE_NOT_IDENTICAL_TO_PUBLIC_ASSET:${m.name}`)}
  }
  writeFileSync(resolve(runtime,'index.js'),source);
  writeFileSync(resolve(runtime,'wrangler.jsonc'),JSON.stringify(configFromCurrent(version,settings,crons,assets),null,2));
  return{runtime,assets,paths,hashes,crons};
}
function expectedManifestFor(version,worker,hashes){return manifest(version).map(row=>{if(row.name===version.main_module)return{...row,sha:sha(worker)};if(row.name.startsWith('assets/')){const p=row.name.slice(7);assert(hashes[p],`EXPECTED_ASSET_MODULE_MISSING:${p}`);return{...row,sha:hashes[p]}}return row}).sort((a,b)=>a.name.localeCompare(b.name))}
function replaceLiteralOnly(source,entry,value){
  assert(entry&&Number.isInteger(entry.start)&&Number.isInteger(entry.end),'EMBEDDED_LITERAL_ENTRY_MISSING');
  const beforePrefix=source.slice(0,entry.start),beforeSuffix=source.slice(entry.end),token=source.slice(entry.start,entry.end);
  assert(token.length>1000,'EMBEDDED_LITERAL_TOKEN_TOO_SMALL');
  const out=beforePrefix+JSON.stringify(value)+beforeSuffix;
  assert.equal(out.slice(0,entry.start),beforePrefix,'WORKER_PREFIX_CHANGED');
  assert(out.endsWith(beforeSuffix),'WORKER_SUFFIX_CHANGED');
  return out;
}
let base,baseVersion,baseWorker,patchedWorker,expectedManifest,baseFunctionalVersion,baseSettingsFunctionalSha;
async function candidateOwned(id){try{const v=await getVersion(id);return canonical(manifest(v))===canonical(expectedManifest)&&canonical(functionalVersion(v))===canonical(baseFunctionalVersion)}catch{return false}}
async function rollback(){const now=await activeVersion();if(now===base){report.rollback={status:'base-still-active',version:base};return}if(!expectedManifest||!await candidateOwned(now)){report.rollback={status:'skipped-foreign-deployment',version:now};return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Event Flow expanded mode ${report.run}`}})});assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:base}}

async function uiCheck(baseOrigin){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});const rows=[];
  try{for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
    const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${baseOrigin}/index.html?eventFlowExpandAtomic=${report.run}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.NOMAD343_EXPANDED_MATCH&&document.querySelector('.match-row[data-match-id]'),{timeout:50000});
    await page.locator('.match-row[data-match-id]').first().click();
    await page.waitForSelector('.expand-flow-card .expand-card-head',{timeout:30000});await page.waitForSelector('[data-eventflow-expand-toggle]',{timeout:10000});
    const normal=await page.locator('.expand-flow-card').boundingBox();assert(normal,'NORMAL_FLOW_RECT_MISSING');
    await page.locator('[data-eventflow-expand-toggle]').click();
    await page.waitForFunction(()=>document.querySelector('.expand-flow-card')?.classList.contains('b46-eventflow-viewport-expanded')&&document.documentElement.classList.contains('b46-eventflow-viewport-lock'),{timeout:10000});
    const expanded=await page.locator('.expand-flow-card').boundingBox();assert(expanded,'EXPANDED_RECT_MISSING');assert(expanded.x<=12&&expanded.y<=12,`EXPANDED_EDGE_BAD:${vp.name}`);assert(expanded.width>=vp.width-24&&expanded.height>=vp.height-24,`EXPANDED_SIZE_BAD:${vp.name}:${JSON.stringify(expanded)}`);
    await page.evaluate(()=>{window.__b46FlowNode=document.querySelector('.expand-flow-card');window.NOMAD343_EXPANDED_MATCH.reload()});await page.waitForTimeout(3200);
    const persisted=await page.evaluate(()=>({same:window.__b46FlowNode===document.querySelector('.expand-flow-card'),expanded:document.querySelector('.expand-flow-card')?.classList.contains('b46-eventflow-viewport-expanded'),locked:document.documentElement.classList.contains('b46-eventflow-viewport-lock'),pressed:document.querySelector('[data-eventflow-expand-toggle]')?.getAttribute('aria-pressed'),api:window.NOMAD343_EXPANDED_MATCH?.isFlowExpanded?.()}));
    assert.deepEqual(persisted,{same:true,expanded:true,locked:true,pressed:'true',api:true},`EXPANDED_STATE_LOST_AFTER_REFRESH:${vp.name}`);
    await page.screenshot({path:`${auditDir}/${vp.name}-expanded.png`});await page.locator('[data-eventflow-expand-toggle]').click();
    await page.waitForFunction(()=>!document.querySelector('.expand-flow-card')?.classList.contains('b46-eventflow-viewport-expanded')&&!document.documentElement.classList.contains('b46-eventflow-viewport-lock'),{timeout:10000});
    const collapsed=await page.evaluate(()=>({pressed:document.querySelector('[data-eventflow-expand-toggle]')?.getAttribute('aria-pressed'),api:window.NOMAD343_EXPANDED_MATCH?.isFlowExpanded?.()}));assert.deepEqual(collapsed,{pressed:'false',api:false},`COLLAPSE_BAD:${vp.name}`);
    assert(!errors.some(x=>/event.?flow|expanded/i.test(x)),`EVENTFLOW_PAGE_ERROR:${vp.name}:${errors.join('|')}`);rows.push({viewport:vp.name,normal,expanded,persisted,collapsed,pageErrors:errors});await page.close();
  }}finally{await browser.close()}return rows;
}

try{
  const inspected=await inspect();const {restore,version,source}=inspected;assert.equal(process.env.GITHUB_REF_NAME,rail.branch,'UNCONFIRMED_DEPLOY_BRANCH_STOP');
  base=restore.version;baseVersion=version;baseWorker=source;report.baseVersion=base;report.deploymentRail=rail;report.backendBefore=restore.backend;baseFunctionalVersion=functionalVersion(version);
  const settingsBefore=await api(`/scripts/${script}/settings`);baseSettingsFunctionalSha=sha(canonical(functionalSettings(settingsBefore)));report.configBeforeFunctionalSha=baseSettingsFunctionalSha;
  const cronsBefore=await schedules();report.cronsBefore=cronsBefore;
  const staged=await stage(version,settingsBefore,cronsBefore,source),targetPath=resolve(staged.assets,target),beforeText=readFileSync(targetPath,'utf8'),beforeSha=sha(beforeText);report.targetBeforeSha=beforeSha;report.assetCount=79;
  const embedded=literals(source).get(embeddedName);assert(embedded,'CURRENT_EVENTFLOW_EMBEDDED_LITERAL_MISSING_STOP');assert.equal(sha(embedded.value),beforeSha,'CURRENT_EVENTFLOW_ROUTE_AND_STATIC_DIFFER_STOP');assert(embedded.value.includes('B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004'),'CURRENT_SIGNAL_ANNOTATION_MISSING_STOP');
  const directBefore=await publicFile('/'+target,undefined,directOrigin);assert.equal(sha(directBefore),sha(embedded.value),'DIRECT_ROUTE_NOT_EMBEDDED_LITERAL_STOP');
  if(embedded.value.includes(MARKER)){report.result='ALREADY_FIXED';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log(`ALREADY_FIXED_PRODUCTION=${base}`);process.exit(0)}
  const afterText=patchEventFlowExpand(embedded.value),afterSha=sha(afterText);writeFileSync(targetPath,afterText);execFileSync(process.execPath,['--check',targetPath],{stdio:'inherit'});report.targetAfterSha=afterSha;
  patchedWorker=replaceLiteralOnly(source,embedded,afterText);writeFileSync(resolve(staged.runtime,'index.js'),patchedWorker);execFileSync(process.execPath,['--check',resolve(staged.runtime,'index.js')],{stdio:'inherit'});
  const afterLits=literals(patchedWorker),afterEmbedded=afterLits.get(embeddedName);assert(afterEmbedded&&afterEmbedded.value===afterText,'PATCHED_EMBEDDED_LITERAL_MISMATCH');
  const beforeLitHashes=Object.fromEntries([...literals(source)].map(([n,e])=>[n,sha(e.value)])),afterLitHashes=Object.fromEntries([...afterLits].map(([n,e])=>[n,sha(e.value)]));
  const literalDiff=Object.keys(beforeLitHashes).filter(n=>beforeLitHashes[n]!==afterLitHashes[n]);assert.deepEqual(literalDiff,[embeddedName],'WORKER_LITERAL_DIFF_GATE_FAILED');report.changedWorkerLiterals=literalDiff;
  const changed=[];for(const [p,h] of Object.entries(staged.hashes))if(sha(readFileSync(resolve(staged.assets,p)))!==h)changed.push(p);changed.sort();assert.deepEqual(changed,[target],'STATIC_DIFF_GATE_FAILED');report.changedAssets=changed;
  assert.equal((embedded.value.match(/fetch\(/g)||[]).length,(afterText.match(/fetch\(/g)||[]).length,'EVENTFLOW_FETCH_COUNT_CHANGED');
  expectedManifest=expectedManifestFor(version,patchedWorker,{...staged.hashes,[target]:afterSha});
  const protectedFiles=Object.fromEntries(Object.entries(staged.hashes).filter(([p])=>p!==target).map(([p,h])=>['/'+p,h]));
  wrangler(staged,true);save();assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_AFTER_PREVIEW_STOP');assert.equal(sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`)))),baseSettingsFunctionalSha,'FUNCTIONAL_CONFIG_MOVED_STOP');
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('EVENTFLOW_EXPAND_ATOMIC_PREVIEW_PASS');process.exit(0)}
  try{
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_STOP');const currentDirect=await publicFile('/'+target,undefined,directOrigin);assert.equal(sha(currentDirect),beforeSha,'EVENTFLOW_ROUTE_MOVED_BEFORE_DEPLOY_STOP');
    for(const [p,h] of Object.entries(staged.hashes))if(p!==target)assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,`CURRENT_RAIL_ASSET_MOVED_STOP:${p}`);
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');wrangler(staged);
    let candidate;for(let i=0;i<30;i++){const now=await activeVersion();if(now!==base){assert(await candidateOwned(now),'FOREIGN_ACTIVE_VERSION_STOP');candidate=now;break}await delay(1500)}assert(candidate,'NO_OWNED_PRODUCTION_CANDIDATE');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<30;i++){const bytes=await publicFile('/'+target,undefined,directOrigin);if(sha(bytes)===afterSha&&bytes.toString().includes(MARKER)){directOk=true;break}await delay(1500)}assert(directOk,'DIRECT_EVENTFLOW_EXPAND_NOT_PUBLISHED');
    let publicOk=false,attempts=0;for(let i=0;i<60;i++){attempts=i+1;const bytes=await publicFile('/'+target);if(sha(bytes)===afterSha&&bytes.toString().includes(MARKER)){publicOk=true;break}await delay(2000)}const verificationOrigin=publicOk?origin:directOrigin;report.publicPropagation={published:publicOk,attempts,verificationOrigin};
    for(const [p,h] of Object.entries(protectedFiles))assert.equal(sha(await publicFile(p,undefined,verificationOrigin)),h,`UNRELATED_ASSET_CHANGED_STOP:${p}`);
    const candidateVersion=await getVersion(candidate),candidateLiteral=literals(Buffer.from(candidateVersion.modules.find(m=>m.name===candidateVersion.main_module).content_base64,'base64').toString('utf8')).get(embeddedName);assert(candidateLiteral&&sha(candidateLiteral.value)===afterSha,'CANDIDATE_EMBEDDED_LITERAL_NOT_PATCHED');
    report.backendAfter=await backend();assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');const settingsAfter=await api(`/scripts/${script}/settings`);report.configAfterFunctionalSha=sha(canonical(functionalSettings(settingsAfter)));assert.equal(report.configAfterFunctionalSha,baseSettingsFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_CHANGED_STOP');report.cronsAfter=await schedules();assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_BEFORE_UI_STOP');assert(await candidateOwned(candidate),'FINAL_MODULE_BYTES_CHANGED_STOP');
    report.ui=await uiCheck(verificationOrigin);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_AFTER_UI_STOP');report.finalVersion=candidate;report.result='SUCCESS';report.atomicEmbeddedAndStaticMatch=true;report.unrelatedAssetsUnchanged=true;report.backendUnchanged=true;report.eventFlowExpandPersistsAcrossRefresh=true;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log('EVENTFLOW_EXPAND_ATOMIC_DEPLOY_SUCCESS');
  }catch(error){report.deployError=error.stack||error.message;try{await rollback()}catch(e){report.rollbackError=e.stack||e.message}throw error}
}catch(error){report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error);process.exitCode=1}
