import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { inspect, activeVersion, getVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend, manifest } from './production.mjs';
import { rail, schedules, configFromCurrent, wrangler } from './rail.mjs';
import { patchEventFlowExpand, MARKER } from './eventflow-expand-patch.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const target='expanded-match-343.js';
const auditDir='audit/eventflow-expand';
const report={startedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||'local',run:process.env.GITHUB_RUN_ID||'local',deploy,scope:'Event Flow viewport expand/collapse presentation only. Exactly expanded-match-343.js; no API, signal detection, odds, statistics, Full Market, routing, header/footer, or backend logic changes.'};
mkdirSync(auditDir,{recursive:true});
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

function safeBindings(bindings=[]){return bindings.map(b=>({name:b.name,type:b.type,service:b.service??null,environment:b.environment??null,namespace_id:b.namespace_id??null,dataset:b.dataset??null})).sort((a,b)=>String(a.name).localeCompare(String(b.name)))}
function functionalSettings(settings={}){return Object.fromEntries(Object.entries(settings).filter(([key])=>key!=='annotations'))}
function functionalVersion(v={}){return{main_module:v.main_module??null,compatibility_date:v.compatibility_date??null,compatibility_flags:v.compatibility_flags??[],usage_model:v.usage_model??null,placement:v.placement??{},bindings:safeBindings(v.bindings||[]),assets:v.assets??null}}

async function stageExactCurrent(version,settings,crons,workerSource){
  const runtime=resolve('runtime-eventflow-expand'),assets=resolve(runtime,'assets');
  const paths=readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(paths.length,79,'CONFIRMED_RAIL_PATH_COUNT_CHANGED');
  assert.equal(new Set(paths).size,79,'CONFIRMED_RAIL_DUPLICATE_PATH');
  assert(paths.includes(target),'EVENTFLOW_PATH_MISSING_FROM_CONFIRMED_RAIL');
  const hashes={};
  for(const path of paths){
    assert(/^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(path)&&!path.split('/').includes('..'),'UNSAFE_CURRENT_ASSET_PATH');
    const direct=await publicFile('/'+path,undefined,directOrigin),pub=await publicFile('/'+path);
    assert.equal(sha(pub),sha(direct),`CURRENT_PRODUCTION_HOSTS_DIFFER:${path}`);
    const file=resolve(assets,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,direct);hashes[path]=sha(direct);
  }
  for(const module of version.modules.filter(m=>m.name!==version.main_module)){
    const assetPath=module.name.slice('assets/'.length),moduleSha=sha(Buffer.from(module.content_base64,'base64')),publicSha=hashes[assetPath];
    if(moduleSha!==publicSha){
      const knownFlagIndexLag=assetPath==='index.html'&&moduleSha==='0da7f30886a1389a8cbab06822cb4bb81c6b9a90984003127775f372ab34a5d9'&&publicSha==='fc6a094fc8e4d8f39f5e67d527cf1352de821702e99701a1cbf66a95dc7b9b3b';
      assert(knownFlagIndexLag,`CURRENT_TEXT_MODULE_NOT_IDENTICAL_TO_PUBLIC_ASSET:${module.name}`);
    }
  }
  writeFileSync(resolve(runtime,'index.js'),workerSource);
  writeFileSync(resolve(runtime,'wrangler.jsonc'),JSON.stringify(configFromCurrent(version,settings,crons,assets),null,2));
  return{runtime,assets,paths,hashes,crons};
}

function expectedCandidateManifest(version,workerSource,hashes){
  return manifest(version).map(row=>{
    if(row.name===version.main_module)return{...row,sha:sha(workerSource)};
    if(row.name.startsWith('assets/')){const path=row.name.slice('assets/'.length);assert(hashes[path],`EXPECTED_MODULE_ASSET_MISSING:${path}`);return{...row,sha:hashes[path]}}
    return row;
  }).sort((a,b)=>a.name.localeCompare(b.name));
}

let base,originalVersion,workerSource,expectedManifest,baselineVersionConfig,baselineSettingsFunctionalSha;
async function candidateOwned(versionId){
  try{
    const v=await getVersion(versionId);
    return canonical(manifest(v))===canonical(expectedManifest)&&canonical(functionalVersion(v))===canonical(baselineVersionConfig);
  }catch{return false}
}
async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return}
  if(!expectedManifest||!await candidateOwned(now)){report.rollback={status:'skipped-foreign-deployment',version:now};return}
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Event Flow expand ${report.run}`}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:base}
}

async function uiCheck(baseOrigin){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const results=[];
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${baseOrigin}/index.html?eventFlowExpandAudit=${report.run}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>window.NOMAD343_EXPANDED_MATCH&&document.querySelector('.match-row[data-match-id]'),{timeout:50000});
      const row=page.locator('.match-row[data-match-id]').first();await row.click();
      await page.waitForSelector('.expand-flow-card .expand-card-head',{timeout:30000});
      await page.waitForSelector('[data-eventflow-expand-toggle]',{timeout:10000});
      const normal=await page.locator('.expand-flow-card').boundingBox();assert(normal,'NORMAL_FLOW_RECT_MISSING');
      await page.locator('[data-eventflow-expand-toggle]').click();
      await page.waitForFunction(()=>document.querySelector('.expand-flow-card')?.classList.contains('b46-eventflow-viewport-expanded')&&document.documentElement.classList.contains('b46-eventflow-viewport-lock'),{timeout:10000});
      const expanded=await page.locator('.expand-flow-card').boundingBox();assert(expanded,'EXPANDED_FLOW_RECT_MISSING');
      assert(expanded.x<=12&&expanded.y<=12,`EXPANDED_NOT_AT_VIEWPORT_EDGE:${vp.name}:${JSON.stringify(expanded)}`);
      assert(expanded.width>=vp.width-24&&expanded.height>=vp.height-24,`EXPANDED_NOT_VIEWPORT_SIZED:${vp.name}:${JSON.stringify(expanded)}`);
      const state=await page.evaluate(()=>({pressed:document.querySelector('[data-eventflow-expand-toggle]')?.getAttribute('aria-pressed'),label:document.querySelector('[data-eventflow-expand-toggle]')?.getAttribute('aria-label'),api:window.NOMAD343_EXPANDED_MATCH?.isFlowExpanded?.(),marker:Boolean(document.querySelector('.expand-flow-card.b46-eventflow-viewport-expanded'))}));
      assert.deepEqual(state,{pressed:'true',label:'Collapse Event Flow',api:true,marker:true},`EXPANDED_STATE_BAD:${vp.name}`);
      await page.evaluate(()=>{window.__b46EventFlowRef=document.querySelector('.expand-flow-card');window.NOMAD343_EXPANDED_MATCH.reload()});
      await page.waitForTimeout(3000);
      const persisted=await page.evaluate(()=>({same:window.__b46EventFlowRef===document.querySelector('.expand-flow-card'),expanded:document.querySelector('.expand-flow-card')?.classList.contains('b46-eventflow-viewport-expanded'),locked:document.documentElement.classList.contains('b46-eventflow-viewport-lock'),api:window.NOMAD343_EXPANDED_MATCH?.isFlowExpanded?.()}));
      assert.deepEqual(persisted,{same:true,expanded:true,locked:true,api:true},`EXPANDED_STATE_LOST_AFTER_REFRESH:${vp.name}`);
      await page.screenshot({path:`${auditDir}/${vp.name}-expanded.png`,fullPage:false});
      await page.locator('[data-eventflow-expand-toggle]').click();
      await page.waitForFunction(()=>!document.querySelector('.expand-flow-card')?.classList.contains('b46-eventflow-viewport-expanded')&&!document.documentElement.classList.contains('b46-eventflow-viewport-lock'),{timeout:10000});
      const collapsed=await page.evaluate(()=>({pressed:document.querySelector('[data-eventflow-expand-toggle]')?.getAttribute('aria-pressed'),api:window.NOMAD343_EXPANDED_MATCH?.isFlowExpanded?.()}));
      assert.deepEqual(collapsed,{pressed:'false',api:false},`COLLAPSE_STATE_BAD:${vp.name}`);
      assert(!errors.some(x=>/event.?flow|expanded/i.test(x)),`EVENTFLOW_PAGE_ERROR:${vp.name}:${errors.join('|')}`);
      results.push({viewport:vp.name,normal,expanded,persisted,collapsed,pageErrors:errors});
      await page.close();
    }
  }finally{await browser.close()}
  return results;
}

try{
  const inspected=await inspect();
  const {restore,version,source}=inspected;
  assert.equal(process.env.GITHUB_REF_NAME,rail.branch,'UNCONFIRMED_DEPLOY_BRANCH_STOP');
  base=restore.version;originalVersion=version;workerSource=source;
  report.baseVersion=base;report.deploymentRail=rail;report.backendBefore=restore.backend;
  baselineVersionConfig=functionalVersion(version);
  const settingsBefore=await api(`/scripts/${script}/settings`);
  baselineSettingsFunctionalSha=sha(canonical(functionalSettings(settingsBefore)));
  report.configBeforeFunctionalSha=baselineSettingsFunctionalSha;
  const cronsBefore=await schedules();report.cronsBefore=cronsBefore;
  const staged=await stageExactCurrent(version,settingsBefore,cronsBefore,source);
  const targetPath=resolve(staged.assets,target),beforeText=readFileSync(targetPath,'utf8'),beforeSha=sha(beforeText);
  report.targetBeforeSha=beforeSha;report.assetCount=staged.paths.length;
  assert(beforeText.includes('B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004'),'CURRENT_SIGNAL_ANNOTATION_MISSING_STOP');
  if(beforeText.includes(MARKER)){
    report.result='ALREADY_FIXED';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log(`ALREADY_FIXED_PRODUCTION=${base}`);process.exit(0)
  }
  const afterText=patchEventFlowExpand(beforeText);writeFileSync(targetPath,afterText);execFileSync(process.execPath,['--check',targetPath],{stdio:'inherit'});
  const afterSha=sha(afterText);report.targetAfterSha=afterSha;
  const changed=[];for(const [path,before] of Object.entries(staged.hashes))if(sha(readFileSync(resolve(staged.assets,path)))!==before)changed.push(path);changed.sort();
  assert.deepEqual(changed,[target],'SURGICAL_DIFF_GATE_FAILED');report.changedAssets=changed;
  assert.equal((beforeText.match(/fetch\(/g)||[]).length,(afterText.match(/fetch\(/g)||[]).length,'EVENTFLOW_FETCH_COUNT_CHANGED');
  assert(afterText.includes('data-eventflow-expand-toggle'),'EXPAND_TOGGLE_MISSING');
  assert(afterText.includes('b46-eventflow-viewport-expanded'),'EXPAND_CLASS_MISSING');
  assert(afterText.includes('isFlowExpanded'),'EXPAND_STATE_API_MISSING');
  expectedManifest=expectedCandidateManifest(version,source,staged.hashes);
  const protectedFiles=Object.fromEntries(Object.entries(staged.hashes).filter(([path])=>path!==target).map(([path,value])=>['/'+path,value]));
  wrangler(staged,true);save();
  assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_AFTER_PREVIEW_STOP');
  assert.equal(sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`)))),baselineSettingsFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_MOVED_STOP');
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;report.completedAt=new Date().toISOString();save();console.log('EVENTFLOW_EXPAND_PREVIEW_PASS');process.exit(0)}

  try{
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_STOP');
    for(const [path,expected] of Object.entries(staged.hashes))assert.equal(sha(await publicFile('/'+path,undefined,directOrigin)),expected,`CURRENT_RAIL_ASSET_MOVED_STOP:${path}`);
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');
    wrangler(staged);
    let candidate;
    for(let attempt=0;attempt<30;attempt++){const current=await activeVersion();if(current!==base){assert(await candidateOwned(current),'FOREIGN_ACTIVE_VERSION_STOP');candidate=current;break}await delay(1500)}
    assert(candidate,'NO_OWNED_PRODUCTION_CANDIDATE');report.candidateVersion=candidate;save();
    let directPublished=false;for(let attempt=0;attempt<30;attempt++){const bytes=await publicFile('/'+target,undefined,directOrigin);if(sha(bytes)===afterSha&&bytes.toString().includes(MARKER)){directPublished=true;break}await delay(1500)}assert(directPublished,'DIRECT_EVENTFLOW_EXPAND_NOT_PUBLISHED');
    let publicPublished=false,publicAttempts=0;for(let attempt=0;attempt<60;attempt++){publicAttempts=attempt+1;const bytes=await publicFile('/'+target);if(sha(bytes)===afterSha&&bytes.toString().includes(MARKER)){publicPublished=true;break}await delay(2000)}
    const verificationOrigin=publicPublished?origin:directOrigin;report.publicPropagation={published:publicPublished,attempts:publicAttempts,verificationOrigin};
    for(const [path,expected] of Object.entries(protectedFiles))assert.equal(sha(await publicFile(path,undefined,verificationOrigin)),expected,`UNRELATED_ASSET_CHANGED_STOP:${path}`);
    report.backendAfter=await backend();assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');
    const settingsAfter=await api(`/scripts/${script}/settings`);report.configAfterFunctionalSha=sha(canonical(functionalSettings(settingsAfter)));assert.equal(report.configAfterFunctionalSha,baselineSettingsFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_CHANGED_STOP');
    report.cronsAfter=await schedules();assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_BEFORE_UI_STOP');assert(await candidateOwned(candidate),'FINAL_MODULE_BYTES_CHANGED_STOP');
    report.ui=await uiCheck(verificationOrigin);
    assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_AFTER_UI_STOP');
    report.finalVersion=candidate;report.result='SUCCESS';report.unrelatedAssetsUnchanged=true;report.workerLogicUnchanged=true;report.backendUnchanged=true;report.eventFlowExpandPersistsAcrossRefresh=true;report.completedAt=new Date().toISOString();save();
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 Event Flow Expanded Mode\n\nResult: SUCCESS\n\nBase: ${base}\n\nFinal: ${candidate}\n\nChanged asset: ${target}\n\nDesktop + mobile expanded refresh persistence: PASS\n\nBackend / Signal logic / Statistics: unchanged\n`);
    console.log(`FINAL_PRODUCTION=${candidate}`);console.log('EVENTFLOW_EXPAND_DEPLOY_SUCCESS');
  }catch(error){report.deployError=error.stack||error.message;try{await rollback()}catch(rollbackError){report.rollbackError=rollbackError.stack||rollbackError.message}throw error}
}catch(error){report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error);process.exitCode=1}
