import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { inspect, activeVersion, api, script, sha, canonical, backend, literals } from '../daily-performance-20261005/production.mjs';
import { schedules, stageCurrentRail, verifyRailBase } from '../daily-performance-20261005/rail.mjs';

const RUN=process.env.GITHUB_RUN_ID||'local';
const ORIGIN='https://www.ball46.com';
const auditDir='audit';
mkdirSync(auditDir,{recursive:true});
const report={run:RUN,startedAt:new Date().toISOString(),mode:'READ_ONLY',scope:'Recheck Ball46 current Production before replacing vintage team kit CSS with 24 PNG assets. No deploy, no Worker patch, no asset mutation.'};
const save=()=>writeFileSync(resolve(auditDir,'report.json'),JSON.stringify(report,null,2));
const versionOf=s=>String(s||'').match(/const VERSION=['"]([^'"]+)['"]/)?.[1]||null;
const has=(s,x)=>String(s||'').includes(x);

try{
  const current=await inspect();
  const base=current.restore.version;
  report.baseVersion=base;
  report.backendBefore=current.restore.backend;
  report.workerSha=sha(Buffer.from(current.source));

  const settings=await api(`/scripts/${script}/settings`);
  const settingsSha=sha(canonical(settings));
  const crons=await schedules();
  report.settingsSha=settingsSha;
  report.crons=crons;

  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  report.assetCount=Object.keys(staged.hashes||{}).length;
  report.assetNames=Object.keys(staged.hashes||{}).sort();

  const assetsDir=resolve(staged.runtime,'assets');
  const readAsset=name=>{
    const p=resolve(assetsDir,name);
    return existsSync(p)?readFileSync(p,'utf8'):null;
  };
  const index=readAsset('index.html')||'';
  const kits=readAsset('team-kits-343.js');
  const dash=readAsset('dashboard-v2-stage3.js');

  const lit=literals(current.source);
  const stage3Literal=lit.get('__B46_MULTI_SIGNAL_STAGE3_JS__')?.value||'';
  const renderer=dash||stage3Literal||'';

  report.assets={
    indexSha:staged.hashes?.['index.html']||null,
    kitsExists:Boolean(kits),
    kitsSha:staged.hashes?.['team-kits-343.js']||null,
    dashboardExists:Boolean(dash),
    dashboardSha:staged.hashes?.['dashboard-v2-stage3.js']||null
  };
  report.index={
    teamKitsLoader:has(index,'team-kits-343.js'),
    loaderMatches:[...index.matchAll(/<script[^>]+team-kits-343\.js[^>]*>/g)].map(m=>m[0]),
    dashboardRefs:[...index.matchAll(/dashboard-v2-stage3\.js[^"'<> ]*/g)].map(m=>m[0]).slice(0,10)
  };
  report.kits=kits?{
    version:versionOf(kits),
    matchRow:has(kits,'article.match-row'),
    homeSelector:has(kits,'b46-home'),
    awaySelector:has(kits,'b46-away'),
    firstChildInsert:/insertBefore\([^,]+,[^)]+firstChild\)|\.prepend\(/.test(kits),
    imageBased:/createElement\(['"]img['"]\)|new Image\(|\.src\s*=/.test(kits),
    cssKitBased:has(kits,'clip-path')||has(kits,'linear-gradient'),
    kitClassMatches:[...kits.matchAll(/(?:team-kit-icon|b46-team-kit-icon)/g)].length
  }:null;
  report.renderer={
    source:dash?'asset:dashboard-v2-stage3.js':stage3Literal?'worker-literal:__B46_MULTI_SIGNAL_STAGE3_JS__':'not-found',
    version:versionOf(renderer),
    matchRow:has(renderer,'match-row'),
    homeClass:has(renderer,'b46-home'),
    awayClass:has(renderer,'b46-away'),
    teamsCell:has(renderer,'teams-cell')
  };

  const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      const errors=[],failed=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||'failed'}));
      await page.goto(`${ORIGIN}/?vintageKitsReadOnlyAudit=${RUN}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForTimeout(8000);
      const dom=await page.evaluate(()=>{
        const rows=[...document.querySelectorAll('article.match-row')];
        const homes=[...document.querySelectorAll('article.match-row b.b46-home')];
        const aways=[...document.querySelectorAll('article.match-row b.b46-away')];
        const cells=[...document.querySelectorAll('article.match-row .teams-cell')];
        const kitNodes=[...document.querySelectorAll('article.match-row .team-kit-icon, article.match-row .b46-team-kit-icon')];
        return {
          rows:rows.length,homes:homes.length,aways:aways.length,cells:cells.length,kitNodes:kitNodes.length,
          sample:rows.slice(0,8).map(row=>{
            const cell=row.querySelector('.teams-cell');
            const h=row.querySelector('b.b46-home'),a=row.querySelector('b.b46-away');
            const cs=cell?getComputedStyle(cell):null;
            return {
              matchId:row.dataset.matchId||null,
              home:(h?.textContent||'').trim(),
              away:(a?.textContent||'').trim(),
              homeTag:h?.tagName||null,awayTag:a?.tagName||null,
              homeFirst:h?.firstElementChild?{tag:h.firstElementChild.tagName,cls:h.firstElementChild.className}:null,
              awayFirst:a?.firstElementChild?{tag:a.firstElementChild.tagName,cls:a.firstElementChild.className}:null,
              gridTemplateColumns:cs?.gridTemplateColumns||null,
              cellDisplay:cs?.display||null
            };
          })
        };
      });
      report[vp.name]={...dom,pageErrors:errors,requestFailures:failed.slice(0,20)};
      await page.screenshot({path:resolve(auditDir,`${vp.name}.png`),fullPage:true});
      await page.close();
    }
  }finally{await browser.close()}

  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_DURING_READ_ONLY_AUDIT');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_MOVED_DURING_READ_ONLY_AUDIT');
  assert.equal(canonical(await backend()),canonical(report.backendBefore),'BACKEND_MOVED_DURING_READ_ONLY_AUDIT');
  report.result='SUCCESS_READ_ONLY';
  report.completedAt=new Date().toISOString();
  save();
  console.log(JSON.stringify(report,null,2));
}catch(e){
  report.result='FAILED_READ_ONLY';
  report.error=e?.stack||String(e);
  report.completedAt=new Date().toISOString();
  save();
  throw e;
}
