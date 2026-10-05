import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { inspect, activeVersion, getVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend, literals } from '../../deploy-assets/match-status-svg-20261003/production.mjs';
import { rail, schedules, configFromCurrent, wrangler } from '../../deploy-assets/match-status-svg-20261003/rail.mjs';

const require = createRequire(new URL('../../deploy-assets/match-status-svg-20261003/package.json', import.meta.url));
const { chromium } = require('playwright');
const postcss = require('postcss');
const deploy = process.env.DEPLOY_ENABLED === 'true';
const MARKER = 'B46_LEFT_RAIL_TRANSPARENT_20261005';
const CSS_LITERAL = '__B46_SCOREBAR_TUNE_CSS__';
const CSS_PATH = 'dashboard-v2-tune.css';
const auditDir = 'deploy-assets/match-status-svg-20261003/audit/left-rail-transparent-20261005';
const report = { startedAt:new Date().toISOString(), run:process.env.GITHUB_RUN_ID||'local', commit:process.env.GITHUB_SHA||'local', deploy, scope:'Left rail presentation only: transparent card/menu surfaces; no icon, font, layout, navigation, API, engine, statistics or Event Flow changes.' };
mkdirSync(auditDir,{recursive:true});
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));

const patchCss=`
/* ${MARKER}: presentation-only left navigation cleanup */
body .workspace.singlepage > .left-rail,
body .workspace.singlepage > .left-rail > .rail-card,
body .workspace.singlepage > .left-rail .rail-card {
  background-color: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
body .workspace.singlepage > .left-rail .rail-card::before,
body .workspace.singlepage > .left-rail .rail-card::after {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
body .workspace.singlepage > .left-rail .rail-card > :is(button,a,[role="button"]) {
  background-color: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
@media (hover: hover) and (pointer: fine) {
  body .workspace.singlepage > .left-rail .rail-card > :is(button,a,[role="button"]):not(.active):hover {
    background-color: color-mix(in srgb, currentColor 4%, transparent) !important;
    background-image: none !important;
    box-shadow: none !important;
  }
}
body .workspace.singlepage > .left-rail .rail-card > :is(button,a,[role="button"]).active {
  background-color: color-mix(in srgb, var(--green) 9%, transparent) !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
`;

function validatePatch(){
  const root=postcss.parse(patchCss);
  const forbidden=new Set(['font','font-family','font-size','font-weight','line-height','width','height','min-width','max-width','min-height','max-height','margin','padding','gap','display','position','inset','top','right','bottom','left','transform','filter','opacity','visibility']);
  root.walkDecls(d=>assert(!forbidden.has(d.prop),`FORBIDDEN_LEFT_RAIL_PROPERTY:${d.prop}`));
  assert(!/mask|content\s*:|background-image\s*:\s*url|font-/i.test(patchCss),'ICON_OR_FONT_TOUCH_STOP');
}
function patchPresentationCss(before){
  validatePatch();
  assert(before.includes('.left-rail'),'CURRENT_LEFT_RAIL_CSS_MISSING_STOP');
  assert(before.includes('.rail-card'),'CURRENT_RAIL_CARD_CSS_MISSING_STOP');
  if(before.includes(MARKER)) return {after:before,already:true};
  const trimmed=before.replace(/\s*$/,'');
  const after=trimmed+'\n'+patchCss;
  postcss.parse(after);
  assert(after.startsWith(trimmed),'NON_APPEND_CSS_CHANGE_STOP');
  return {after,already:false};
}
function replaceLiteralOnly(source,entry,value){
  assert(entry&&Number.isInteger(entry.start)&&Number.isInteger(entry.end),'CSS_LITERAL_ENTRY_MISSING');
  const prefix=source.slice(0,entry.start),suffix=source.slice(entry.end);
  const out=prefix+JSON.stringify(value)+suffix;
  assert.equal(out.slice(0,entry.start),prefix,'WORKER_PREFIX_CHANGED');
  assert(out.endsWith(suffix),'WORKER_SUFFIX_CHANGED');
  return out;
}
function safeBindings(bs=[]){return bs.map(b=>({name:b.name,type:b.type,service:b.service??null,environment:b.environment??null,namespace_id:b.namespace_id??null,dataset:b.dataset??null})).sort((a,b)=>String(a.name).localeCompare(String(b.name)))}
function functionalSettings(s={}){return Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations'))}
function functionalVersion(v={}){return{main_module:v.main_module??null,compatibility_date:v.compatibility_date??null,compatibility_flags:v.compatibility_flags??[],usage_model:v.usage_model??null,placement:v.placement??{},bindings:safeBindings(v.bindings||[]),assets:v.assets??null}}

async function stageCurrent(version,settings,crons,patchedWorker,afterCss){
  const runtime=resolve('deploy-assets/match-status-svg-20261003/runtime-left-rail-20261005'),assets=resolve(runtime,'assets');
  const paths=readFileSync('.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(paths.length,79,'CONFIRMED_RAIL_PATH_COUNT_CHANGED');
  assert.equal(new Set(paths).size,79,'CONFIRMED_RAIL_DUPLICATE_PATH');
  assert(paths.includes(CSS_PATH),'PRESENTATION_CSS_PATH_MISSING');
  const hashes={};
  for(const path of paths){
    assert(/^[a-zA-Z0-9][a-zA-Z0-9./_-]*$/.test(path)&&!path.split('/').includes('..'),`UNSAFE_ASSET_PATH:${path}`);
    const direct=await publicFile('/'+path,undefined,directOrigin),pub=await publicFile('/'+path);
    assert.equal(sha(pub),sha(direct),`CURRENT_PRODUCTION_HOSTS_DIFFER:${path}`);
    const out=resolve(assets,path); mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,direct); hashes[path]=sha(direct);
  }
  for(const m of version.modules.filter(m=>m.name!==version.main_module)){
    const path=m.name.slice('assets/'.length),moduleSha=sha(Buffer.from(m.content_base64,'base64')),publicSha=hashes[path];
    if(moduleSha!==publicSha){
      const known=path==='index.html'&&moduleSha==='0da7f30886a1389a8cbab06822cb4bb81c6b9a90984003127775f372ab34a5d9'&&publicSha==='fc6a094fc8e4d8f39f5e67d527cf1352de821702e99701a1cbf66a95dc7b9b3b';
      assert(known,`CURRENT_TEXT_MODULE_NOT_IDENTICAL_TO_PUBLIC_ASSET:${m.name}`);
    }
  }
  assert.equal(hashes[CSS_PATH],sha(await publicFile('/'+CSS_PATH,'css',directOrigin)),'CSS_STAGE_BASE_MOVED');
  writeFileSync(resolve(assets,CSS_PATH),afterCss);
  writeFileSync(resolve(runtime,'index.js'),patchedWorker);
  writeFileSync(resolve(runtime,'wrangler.jsonc'),JSON.stringify(configFromCurrent(version,settings,crons,assets),null,2));
  return{runtime,assets,paths,hashes,crons};
}
function mainSource(v){const m=v.modules.find(x=>x.name===v.main_module);assert(m,'MAIN_MODULE_MISSING');return Buffer.from(m.content_base64,'base64').toString('utf8')}
let baseVersionId,patchedWorker,afterCss,baseFunctionalVersion,baseSettingsFunctionalSha;
async function candidateOwned(id){try{const v=await getVersion(id);if(sha(mainSource(v))!==sha(patchedWorker))return false;if(canonical(functionalVersion(v))!==canonical(baseFunctionalVersion))return false;const lit=literals(mainSource(v)).get(CSS_LITERAL);return Boolean(lit&&lit.value.includes(MARKER)&&sha(lit.value)===sha(afterCss))}catch{return false}}
async function rollback(){const now=await activeVersion();if(now===baseVersionId){report.rollback={status:'base-still-active',version:baseVersionId};return}if(!await candidateOwned(now)){report.rollback={status:'skipped-foreign-deployment',version:now};return}await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:baseVersionId,percentage:100}],annotations:{'workers/message':`Rollback left-rail transparency ${report.run}`}})});assert.equal(await activeVersion(),baseVersionId,'ROLLBACK_NOT_CONFIRMED');report.rollback={status:'confirmed',version:baseVersionId}}
const transparent=v=>v==='transparent'||/^rgba\(0,\s*0,\s*0,\s*0(?:\.0+)?\)$/.test(v);

async function uiCheck(baseOrigin){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH; assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${baseOrigin}/index.html?leftRailTransparent=${report.run}`,{waitUntil:'domcontentloaded',timeout:60000});
    const cardSel='body .workspace.singlepage > .left-rail .rail-card';
    const controlSel=`${cardSel} > :is(button[data-status-filter],button[data-workspace-view="signal"])`;
    await page.waitForSelector(cardSel,{timeout:30000});
    const initial=await page.evaluate(({cardSel,controlSel})=>{const card=document.querySelector(cardSel),controls=[...document.querySelectorAll(controlSel)];const css=el=>{const s=getComputedStyle(el);return{backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,borderTopColor:s.borderTopColor,boxShadow:s.boxShadow}};return{card:css(card),controls:controls.map(el=>({text:el.textContent.trim(),active:el.classList.contains('active'),style:css(el)})),count:controls.length}}, {cardSel,controlSel});
    assert(initial.count>=2,'LEFT_RAIL_CONTROLS_MISSING');
    assert(transparent(initial.card.backgroundColor),`RAIL_CARD_BACKGROUND_NOT_TRANSPARENT:${initial.card.backgroundColor}`);
    assert.equal(initial.card.backgroundImage,'none','RAIL_CARD_BACKGROUND_IMAGE_REMAINS');
    assert.equal(initial.card.boxShadow,'none','RAIL_CARD_SHADOW_REMAINS');
    assert(transparent(initial.card.borderTopColor),`RAIL_CARD_BORDER_VISIBLE:${initial.card.borderTopColor}`);
    for(const c of initial.controls){assert(c.text.length,'LEFT_RAIL_LABEL_MISSING');assert.equal(c.style.backgroundImage,'none','LEFT_RAIL_BUTTON_BACKGROUND_IMAGE_REMAINS');assert.equal(c.style.boxShadow,'none','LEFT_RAIL_BUTTON_SHADOW_REMAINS');assert(transparent(c.style.borderTopColor),`LEFT_RAIL_BUTTON_BORDER_VISIBLE:${c.text}`);if(!c.active)assert(transparent(c.style.backgroundColor),`INACTIVE_LEFT_RAIL_NOT_TRANSPARENT:${c.text}`)}
    const inactive=initial.controls.findIndex(c=>!c.active);if(inactive>=0){const target=page.locator(controlSel).nth(inactive),before=await target.boundingBox();await target.hover();await page.waitForTimeout(150);const after=await target.boundingBox();assert(before&&after,'HOVER_RECT_MISSING');for(const k of ['x','y','width','height'])assert(Math.abs(before[k]-after[k])<0.6,`HOVER_LAYOUT_SHIFT:${k}`)}
    const status=page.locator(`${cardSel} > button[data-status-filter]`).first();if(await status.count()){await status.click();await page.waitForTimeout(200);assert(await status.evaluate(el=>el.classList.contains('active')),'STATUS_CLICK_NO_ACTIVE_STATE')}
    await page.screenshot({path:`${auditDir}/desktop-left-rail.png`,fullPage:false});
    await page.close();
    const mobile=await browser.newPage({viewport:{width:390,height:844}}),mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));await mobile.goto(`${baseOrigin}/index.html?leftRailTransparent=${report.run}-mobile`,{waitUntil:'domcontentloaded',timeout:60000});await mobile.waitForTimeout(1000);const overflow=await mobile.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);await mobile.close();
    return{desktop:{...initial,pageErrors:errors},mobile:{overflow,pageErrors:mobileErrors}};
  }finally{await browser.close()}
}

try{
  assert.equal(process.env.GITHUB_REF_NAME,rail.branch,'UNCONFIRMED_DEPLOY_BRANCH_STOP');
  const {restore,version,source}=await inspect();baseVersionId=restore.version;baseFunctionalVersion=functionalVersion(version);report.baseVersion=baseVersionId;report.deploymentRail=rail;report.backendBefore=restore.backend;
  const settingsBefore=await api(`/scripts/${script}/settings`);baseSettingsFunctionalSha=sha(canonical(functionalSettings(settingsBefore)));report.configBeforeFunctionalSha=baseSettingsFunctionalSha;const cronsBefore=await schedules();report.cronsBefore=cronsBefore;
  const entry=literals(source).get(CSS_LITERAL);assert(entry,'ACTIVE_PRESENTATION_CSS_LITERAL_MISSING');const patched=patchPresentationCss(entry.value);afterCss=patched.after;report.cssBeforeSha=sha(entry.value);report.cssAfterSha=sha(afterCss);
  if(patched.already){assert((await publicFile('/'+CSS_PATH,'css')).toString('utf8').includes(MARKER),'MARKER_EMBEDDED_BUT_PUBLIC_CSS_MISSING');report.result='ALREADY_FIXED';report.finalVersion=baseVersionId;report.completedAt=new Date().toISOString();save();console.log(`ALREADY_FIXED_PRODUCTION=${baseVersionId}`);process.exit(0)}
  patchedWorker=replaceLiteralOnly(source,entry,afterCss);const beforeLits=Object.fromEntries([...literals(source)].map(([n,e])=>[n,sha(e.value)])),afterLits=Object.fromEntries([...literals(patchedWorker)].map(([n,e])=>[n,sha(e.value)]));const literalDiff=Object.keys(beforeLits).filter(n=>beforeLits[n]!==afterLits[n]);assert.deepEqual(literalDiff,[CSS_LITERAL],'WORKER_LITERAL_DIFF_GATE_FAILED');report.changedWorkerLiterals=literalDiff;
  const staged=await stageCurrent(version,settingsBefore,cronsBefore,patchedWorker,afterCss);assert.equal(staged.hashes[CSS_PATH],report.cssBeforeSha,'STATIC_CSS_AND_EMBEDDED_CSS_BASE_DIFFER');const changed=[];for(const [p,h] of Object.entries(staged.hashes))if(sha(readFileSync(resolve(staged.assets,p)))!==h)changed.push(p);changed.sort();assert.deepEqual(changed,[CSS_PATH],'STATIC_ASSET_DIFF_GATE_FAILED');report.changedAssets=changed;report.iconsUntouched=true;report.fontsUntouched=true;report.layoutPropertiesUntouched=true;report.logicUntouched=true;writeFileSync(`${auditDir}/before-dashboard-v2-tune.css`,entry.value);writeFileSync(`${auditDir}/after-dashboard-v2-tune.css`,afterCss);
  wrangler(staged,true);assert.equal(await activeVersion(),baseVersionId,'CONCURRENT_DEPLOY_AFTER_DRY_RUN_STOP');assert.equal(sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`)))),baseSettingsFunctionalSha,'FUNCTIONAL_CONFIG_MOVED_STOP');save();
  if(!deploy){report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=baseVersionId;report.completedAt=new Date().toISOString();save();console.log('LEFT_RAIL_TRANSPARENT_PREVIEW_PASS');process.exit(0)}
  try{
    assert.equal(await activeVersion(),baseVersionId,'CONCURRENT_DEPLOY_STOP');assert.equal(sha(await publicFile('/'+CSS_PATH,'css',directOrigin)),report.cssBeforeSha,'PRESENTATION_CSS_MOVED_BEFORE_DEPLOY_STOP');for(const [p,h] of Object.entries(staged.hashes))if(p!==CSS_PATH)assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,`CURRENT_RAIL_ASSET_MOVED_STOP:${p}`);assert.equal(await activeVersion(),baseVersionId,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');wrangler(staged);
    let candidate;for(let i=0;i<30;i++){const now=await activeVersion();if(now!==baseVersionId){assert(await candidateOwned(now),'FOREIGN_ACTIVE_VERSION_STOP');candidate=now;break}await delay(1500)}assert(candidate,'NO_OWNED_PRODUCTION_CANDIDATE');report.candidateVersion=candidate;save();
    let directOk=false;for(let i=0;i<30;i++){const bytes=await publicFile('/'+CSS_PATH,'css',directOrigin);if(sha(bytes)===report.cssAfterSha&&bytes.toString('utf8').includes(MARKER)){directOk=true;break}await delay(1500)}assert(directOk,'DIRECT_LEFT_RAIL_CSS_NOT_PUBLISHED');
    let publicOk=false,attempts=0;for(let i=0;i<60;i++){attempts=i+1;const bytes=await publicFile('/'+CSS_PATH,'css');if(sha(bytes)===report.cssAfterSha&&bytes.toString('utf8').includes(MARKER)){publicOk=true;break}await delay(2000)}const verificationOrigin=publicOk?origin:directOrigin;report.publicPropagation={published:publicOk,attempts,verificationOrigin};
    for(const [p,h] of Object.entries(staged.hashes)){if(p===CSS_PATH)continue;assert.equal(sha(await publicFile('/'+p,undefined,verificationOrigin)),h,`UNRELATED_ASSET_CHANGED_STOP:${p}`)}
    report.backendAfter=await backend();assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');report.configAfterFunctionalSha=sha(canonical(functionalSettings(await api(`/scripts/${script}/settings`))));assert.equal(report.configAfterFunctionalSha,baseSettingsFunctionalSha,'PRODUCTION_FUNCTIONAL_CONFIG_CHANGED_STOP');report.cronsAfter=await schedules();assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_BEFORE_UI_STOP');assert(await candidateOwned(candidate),'FINAL_MODULE_BYTES_CHANGED_STOP');
    report.ui=await uiCheck(verificationOrigin);assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_AFTER_UI_STOP');report.finalVersion=candidate;report.result='SUCCESS';report.unrelatedAssetsUnchanged=true;report.backendUnchanged=true;report.functionalConfigUnchanged=true;report.completedAt=new Date().toISOString();save();console.log(`FINAL_PRODUCTION=${candidate}`);console.log('LEFT_RAIL_TRANSPARENT_DEPLOY_SUCCESS');
  }catch(error){report.deployError=error.stack||error.message;try{await rollback()}catch(e){report.rollbackError=e.stack||e.message}throw error}
}catch(error){report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error.message);process.exitCode=1}
