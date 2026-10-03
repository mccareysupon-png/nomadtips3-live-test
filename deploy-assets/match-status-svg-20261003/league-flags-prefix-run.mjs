import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { inspect, activeVersion, getVersion, api, script, origin, directOrigin, sha, canonical, publicFile, backend, manifest } from './production.mjs';
import { rail, schedules, stageCurrentRail, verifyRailBase, wrangler } from './rail.mjs';
import { assetSource, patchIndex, registry, validateAsset, resolveLeagueLabel, TOKEN } from './league-flags-patch.mjs';

const deploy=process.env.DEPLOY_ENABLED==='true';
const report={
  startedAt:new Date().toISOString(),
  commit:process.env.GITHUB_SHA||'local',
  run:process.env.GITHUB_RUN_ID||'local',
  deploy,
  scope:'Ball46 league flags prefix resolver only: index.html cache token + league-flags-343.js. No worker logic, API, engines, signals, statistics, odds, event flow, or other assets.'
};
const auditDir='audit/league-flags-prefix';
mkdirSync(auditDir,{recursive:true});
const save=()=>writeFileSync(`${auditDir}/report.json`,JSON.stringify(report,null,2));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function verifyPrimaryIconSet(){
  const info=validateAsset();
  const codes=info.declared.slice().sort();
  assert.equal(codes.length,143,'ICON_DECLARATION_NOT_143');
  const failures=[];
  let cursor=0;
  async function worker(){
    while(cursor<codes.length){
      const code=codes[cursor++];
      const url=`https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/${code}.svg`;
      try{
        const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Ball46-Flag-Preflight/2.0'}});
        const body=await response.text();
        if(!response.ok||!body.includes('<svg'))failures.push({code,status:response.status,bytes:body.length});
      }catch(error){failures.push({code,error:error.message});}
    }
  }
  await Promise.all(Array.from({length:12},worker));
  assert.equal(failures.length,0,`FLAG_CDN_PREFLIGHT_FAILED:${JSON.stringify(failures)}`);
  return {checked:codes.length,base:'flag-icons@7.5.0/flags/4x3'};
}

async function liveLeagueCoverage(){
  const data=JSON.parse(await publicFile('/api/engine/board','json'));
  assert(data?.ok===true&&Array.isArray(data.fixtures),'LIVE_BOARD_BAD');
  const labels=[...new Set(data.fixtures.map(f=>[f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const rows=labels.map(label=>({label,code:resolveLeagueLabel(label)}));
  const unknown=rows.filter(row=>!row.code);
  assert.equal(unknown.length,0,`LIVE_LEAGUE_FLAG_MAPPING_MISSING:${unknown.map(x=>x.label).join('|')}`);
  const byCode={};for(const row of rows)byCode[row.code]=(byCode[row.code]||0)+1;
  return {
    fixtures:data.fixtures.length,
    leagues:labels.length,
    flags:rows.filter(x=>x.code!=='WORLD').length,
    world:rows.filter(x=>x.code==='WORLD').length,
    unknown:unknown.length,
    byCode,
    rows:rows.slice(0,300)
  };
}

function expectedManifest(baseVersion,source,expectedIndexSha){
  const rows=manifest(baseVersion).map(row=>{
    if(row.name===baseVersion.main_module)return {...row,sha:sha(source)};
    if(row.name==='assets/index.html')return {...row,sha:expectedIndexSha};
    return row;
  });
  assert(rows.some(row=>row.name==='assets/index.html'),'BASE_INDEX_MODULE_MISSING');
  return rows.sort((a,b)=>a.name.localeCompare(b.name));
}

let base,originalVersion,workerSource,expectedIndexSha,expectedFlagsSha,expectedCandidateManifest;
async function candidateOwned(versionId){
  const candidate=await getVersion(versionId);
  if(candidate.main_module!==originalVersion.main_module)return false;
  return canonical(manifest(candidate))===canonical(expectedCandidateManifest);
}

async function rollback(){
  const now=await activeVersion();
  if(now===base){report.rollback={status:'base-still-active',version:base};return;}
  if(!expectedCandidateManifest||!await candidateOwned(now)){report.rollback={status:'skipped-foreign-deployment',version:now};return;}
  await api(`/scripts/${script}/deployments`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':`Rollback Ball46 league flag prefix ${report.run}`}})
  });
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

async function surface(page,selector){
  return page.evaluate(sel=>[...document.querySelectorAll(sel)].map(el=>({
    text:(el.querySelector('.league-label')?.textContent||el.textContent||'').trim(),
    code:el.dataset.leagueFlagCode||null,
    img:Boolean(el.querySelector('img.league-flag')),
    globe:Boolean(el.querySelector('.league-globe'))
  })),selector);
}

async function uiCheck(phase,coverage){
  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  const out=[];
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const errors=[],failed=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('requestfailed',request=>{if(/league-flags|flag-icons|flagcdn/i.test(request.url()))failed.push({url:request.url(),error:request.failure()?.errorText||'failed'});});
      await page.goto(`${origin}/index.html?leagueFlagPrefixAudit=${report.run}-${phase}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>window.NOMAD_LEAGUE_FLAGS_343?.version==='343-league-flags-menu-143-20261004b',{timeout:45000});
      await page.waitForFunction(()=>document.querySelectorAll('[data-league-filter]').length>0,{timeout:45000});
      await page.waitForTimeout(2500);
      const api=await page.evaluate(()=>({
        version:window.NOMAD_LEAGUE_FLAGS_343?.version,
        iconCount:window.NOMAD_LEAGUE_FLAGS_343?.iconCount,
        aliasCount:window.NOMAD_LEAGUE_FLAGS_343?.aliasCount,
        thailand:window.NOMAD_LEAGUE_FLAGS_343?.codeForLeagueLabel?.('Thailand Premier League'),
        northernIreland:window.NOMAD_LEAGUE_FLAGS_343?.codeForLeagueLabel?.('Northern Ireland Championship'),
        senegal:window.NOMAD_LEAGUE_FLAGS_343?.codeForLeagueLabel?.('Senegal Premier League'),
        uefa:window.NOMAD_LEAGUE_FLAGS_343?.codeForLeagueLabel?.('UEFA Nations League A')
      }));
      assert.deepEqual(api,{version:'343-league-flags-menu-143-20261004b',iconCount:143,aliasCount:167,thailand:'th',northernIreland:'gb-nir',senegal:'sn',uefa:'WORLD'});
      const menu=await surface(page,'[data-league-filter] > span');
      assert(menu.length>0,'UI_NO_LEAGUE_FILTERS');
      const unknown=menu.filter(x=>!x.code||x.code==='unknown');
      assert.equal(unknown.length,0,`UI_UNKNOWN_LEAGUE_FLAG:${unknown.map(x=>x.text).join('|')}`);
      const world=menu.filter(x=>x.code==='WORLD');
      const flags=menu.filter(x=>x.code!=='WORLD');
      assert(flags.length>0,'UI_NO_COUNTRY_FLAGS');
      assert.equal(flags.filter(x=>x.img).length,flags.length,'UI_COUNTRY_FLAG_IMAGES_NOT_LOADED');
      assert.equal(world.filter(x=>x.globe).length,world.length,'UI_WORLD_GLOBES_MISSING');
      assert.equal(menu.length,coverage.leagues,'UI_MENU_LEAGUE_COUNT_DIFFERS_FROM_BOARD');
      assert.equal(flags.length,coverage.flags,'UI_COUNTRY_FLAG_COUNT_DIFFERS_FROM_PREFLIGHT');
      assert.equal(world.length,coverage.world,'UI_WORLD_COUNT_DIFFERS_FROM_PREFLIGHT');
      const heads=await surface(page,'.league-block .league-head > strong');
      assert(heads.length>0,'UI_NO_LEAGUE_HEADS');
      assert.equal(heads.filter(x=>!x.code||x.code==='unknown').length,0,'UI_LEAGUE_HEAD_UNKNOWN');
      const featured=await surface(page,'[data-featured-league]');
      assert(featured.length===1,'UI_FEATURED_LEAGUE_MISSING');
      assert(featured[0].code&&featured[0].code!=='unknown','UI_FEATURED_FLAG_UNKNOWN');
      assert(!errors.some(message=>/league.?flag/i.test(message)),`FLAG_PAGE_ERROR:${errors.join('|')}`);
      out.push({viewport:vp.name,api,menu:{total:menu.length,flags:flags.length,world:world.length,unknown:unknown.length,sample:menu.slice(0,40)},leagueHeads:heads.length,featured:featured[0],pageErrors:errors,requestFailures:failed});
      await page.screenshot({path:`${auditDir}/${vp.name}.png`,fullPage:true});
      await page.close();
    }
  }finally{await browser.close();}
  return out;
}

try{
  const inspected=await inspect();
  const {restore,version,source}=inspected;
  assert.equal(process.env.GITHUB_REF_NAME,rail.branch,'UNCONFIRMED_DEPLOY_BRANCH_STOP');
  base=restore.version;originalVersion=version;workerSource=source;
  report.baseVersion=base;
  report.deploymentRail=rail;
  report.registry=validateAsset();
  report.iconPreflight=await verifyPrimaryIconSet();
  report.liveCoverageBefore=await liveLeagueCoverage();
  report.backendBefore=restore.backend;
  report.configBeforeSha=restore.settingsSha;

  const settingsBefore=await api(`/scripts/${script}/settings`);
  assert.equal(sha(canonical(settingsBefore)),restore.settingsSha,'CURRENT_CONFIG_MOVED_STOP');
  const cronsBefore=await schedules();
  const staged=await stageCurrentRail(version,settingsBefore,cronsBefore,source);
  const indexPath=resolve(staged.runtime,'assets/index.html');
  const flagsPath=resolve(staged.runtime,'assets/league-flags-343.js');
  const beforeIndex=readFileSync(indexPath,'utf8');
  const beforeFlags=readFileSync(flagsPath,'utf8');
  assert.equal(sha(beforeIndex),staged.hashes['index.html'],'STAGED_INDEX_NOT_CURRENT');
  assert.equal(sha(beforeFlags),staged.hashes['league-flags-343.js'],'STAGED_FLAGS_NOT_CURRENT');

  const afterIndex=patchIndex(beforeIndex);
  writeFileSync(indexPath,afterIndex);
  writeFileSync(flagsPath,assetSource);
  const changed=[];
  for(const [path,beforeSha] of Object.entries(staged.hashes)){
    if(sha(readFileSync(resolve(staged.runtime,'assets',path)))!==beforeSha)changed.push(path);
  }
  changed.sort();
  assert.deepEqual(changed,['index.html','league-flags-343.js'],'SURGICAL_DIFF_GATE_FAILED');
  expectedIndexSha=sha(afterIndex);expectedFlagsSha=sha(assetSource);
  expectedCandidateManifest=expectedManifest(version,source,expectedIndexSha);
  report.changedAssets={index:{before:staged.hashes['index.html'],after:expectedIndexSha},leagueFlags:{before:staged.hashes['league-flags-343.js'],after:expectedFlagsSha}};
  report.token=TOKEN;
  report.cronsBefore=cronsBefore;
  const protectedFiles=Object.fromEntries(Object.entries(staged.hashes).filter(([path])=>!changed.includes(path)).map(([path,value])=>['/'+path,value]));

  wrangler(staged,true);
  save();
  if(!deploy){
    report.result='PREVIEW_SUCCESS_NO_DEPLOY';report.finalVersion=base;
  }else{
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_STOP');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),restore.settingsSha,'CONFIG_CHANGED_BEFORE_DEPLOY_STOP');
    await verifyRailBase(staged);
    assert.equal(await activeVersion(),base,'CONCURRENT_DEPLOY_BEFORE_WRANGLER_STOP');
    try{
      wrangler(staged);
      let candidate;
      for(let attempt=0;attempt<30;attempt++){
        const current=await activeVersion();
        if(current!==base){assert(await candidateOwned(current),'FOREIGN_ACTIVE_VERSION_STOP');candidate=current;break;}
        await delay(1500);
      }
      assert(candidate,'NO_OWNED_PRODUCTION_CANDIDATE');
      report.candidateVersion=candidate;save();

      let published=false;
      for(let attempt=0;attempt<25;attempt++){
        const directIndex=sha(await publicFile('/index.html',undefined,directOrigin));
        const directFlags=sha(await publicFile('/league-flags-343.js',undefined,directOrigin));
        if(directIndex===expectedIndexSha&&directFlags===expectedFlagsSha){published=true;break;}
        await delay(1500);
      }
      assert(published,'FLAG_ASSETS_NOT_PUBLISHED');
      assert.equal(sha(await publicFile('/index.html')),expectedIndexSha,'PUBLIC_INDEX_NOT_UPDATED');
      assert.equal(sha(await publicFile('/league-flags-343.js')),expectedFlagsSha,'PUBLIC_FLAGS_NOT_UPDATED');
      for(const [path,expected] of Object.entries(protectedFiles))assert.equal(sha(await publicFile(path)),expected,`UNRELATED_ASSET_CHANGED_STOP:${path}`);

      report.liveCoverageAfter=await liveLeagueCoverage();
      report.backendAfter=await backend();
      assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_LOGIC_REVISION_CHANGED_STOP');
      report.configAfterSha=sha(canonical(await api(`/scripts/${script}/settings`)));
      assert.equal(report.configAfterSha,report.configBeforeSha,'PRODUCTION_CONFIG_CHANGED_STOP');
      report.cronsAfter=await schedules();
      assert.equal(canonical(report.cronsAfter),canonical(cronsBefore),'PRODUCTION_CRON_CHANGED_STOP');
      report.ui=await uiCheck('production',report.liveCoverageAfter);
      assert.equal(await activeVersion(),candidate,'FINAL_PRODUCTION_CHANGED_STOP');
      assert(await candidateOwned(candidate),'FINAL_MODULE_BYTES_CHANGED_STOP');
      report.finalVersion=candidate;
      report.result='SUCCESS';
      report.unrelatedAssetsUnchanged=true;
      report.workerLogicUnchanged=true;
      report.apiSignalsStatisticsOddsEventFlowUnchanged=true;
      console.log(`FINAL_PRODUCTION=${candidate}`);
    }catch(error){
      try{await rollback();}catch(rollbackError){report.rollbackError=rollbackError.message;}
      throw error;
    }
  }
  report.completedAt=new Date().toISOString();save();
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Ball46 League Flags Prefix Fix\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nIcons: 143 · aliases: 167 · unresolved: 0\n\nScope: index.html + league-flags-343.js only\n`);
  console.log(report.result);
}catch(error){
  report.result='FAIL_STOPPED';report.error=error.stack||error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack||error);process.exitCode=1;
}
