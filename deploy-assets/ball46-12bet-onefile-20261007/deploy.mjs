import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const PATH='assets/affiliate/12bet-logo.png';
const LOGO=readFileSync(resolve('12bet-logo.png'));
const LOGO_SHA='becc54ed6274429efd78de8c4f1d6f1acf7e3a5193adf1bf67f0af47db3bf5ad';
const AFF='https://goto.elv520.com/join/49549/id/facebook/index.html';
const NEW_Q='full-market-bookmaker-343.css?v=343-12bet-onefile-20261007a';
const PRESERVE=['assets/affiliate/easybet-logo.png','assets/affiliate/betsson-logo.png'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'12BET one-file logo only: restore one local asset and remove theme-specific 12BET CSS override. Preserve affiliate URL, EasyBet, Betsson, Engine, Statistics, EventFlow, worker/settings/crons and unrelated assets.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null;

async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback 12BET one-file logo'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(LOGO),LOGO_SHA,'LOGO_BYTES_MISMATCH');
  const current=await inspect(); base=current.restore.version;
  const settings=await api('/scripts/'+script+'/settings');
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
  const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
  const indexPath=resolve(staged.runtime,'assets','index.html');
  const js=readFileSync(jsPath,'utf8');
  const css=readFileSync(cssPath,'utf8');
  const index=readFileSync(indexPath,'utf8');
  const jsSha=sha(Buffer.from(js));
  assert(js.includes("'12bet':'"+AFF+"'"),'STOP_12BET_AFFILIATE_NOT_CURRENT');
  assert(js.includes("'12bet':'/assets/affiliate/12bet-logo.png'"),'STOP_12BET_LOGO_MAPPING_NOT_CURRENT');
  const marker='/* BALL46 12BET THEME LOGO 20261006 */';
  assert(css.includes(marker),'STOP_12BET_THEME_BLOCK_NOT_CURRENT');
  const themeRe=/\/\* BALL46 12BET THEME LOGO 20261006 \*\/[\s\S]*?html\[data-theme="dark"\] \.fmb-book-logo\[data-b46-book-logo="12bet"\]\{background-image:url\("\/assets\/affiliate\/12bet-logo-dark\.png"\)\}\s*/;
  const afterCss=css.replace(themeRe,'');
  assert(afterCss!==css,'THEME_BLOCK_NOT_REMOVED');
  writeFileSync(cssPath,afterCss);

  const re=/full-market-bookmaker-343\.css\?v=[^"'\s>]+/;
  assert(re.test(index),'CSS_QUERY_MARKER_MISSING');
  const afterIndex=index.replace(re,NEW_Q);
  writeFileSync(indexPath,afterIndex);

  const logoTarget=resolve(staged.runtime,'assets',PATH);
  mkdirSync(dirname(logoTarget),{recursive:true});
  writeFileSync(logoTarget,LOGO);

  const preserved={};
  for(const p of PRESERVE){
    try{
      const b=await publicFile('/'+p,'image');
      preserved[p]=sha(b);
      const t=resolve(staged.runtime,'assets',p);
      mkdirSync(dirname(t),{recursive:true});
      writeFileSync(t,b);
    }catch{}
  }

  const protectedHashes={...staged.hashes};
  delete protectedHashes['full-market-bookmaker-343.css'];
  delete protectedHashes['index.html'];
  report.before={version:base,jsSha,cssSha:sha(Buffer.from(css)),indexSha:sha(Buffer.from(index)),preserved};
  report.after={logoSha:LOGO_SHA,logoPath:'/'+PATH,cssSha:sha(Buffer.from(afterCss)),indexSha:sha(Buffer.from(afterIndex))};
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_DRY_RUN');
  try{
    wrangler(staged,false);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');
    let ok=false;
    for(let i=0;i<25;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const pubLogo=await publicFile('/'+PATH,'image');
        const pubJs=(await publicFile('/full-market-bookmaker-343.js','javascript')).toString('utf8');
        const pubCss=(await publicFile('/full-market-bookmaker-343.css','css')).toString('utf8');
        const pubIndex=(await publicFile('/index.html','html')).toString('utf8');
        let preserveOk=true;
        for(const [p,h] of Object.entries(preserved))preserveOk=preserveOk&&sha(await publicFile('/'+p,'image'))===h;
        if(sha(pubLogo)===LOGO_SHA && sha(Buffer.from(pubJs))===jsSha && !pubCss.includes(marker) && pubIndex.includes(NEW_Q) && pubJs.includes("'12bet':'"+AFF+"'") && preserveOk){ok=true;break}
      }catch{}
      await delay(1000);
    }
    assert(ok,'PUBLIC_VERIFY_NOT_CONVERGED');
    for(const [p,h] of Object.entries(protectedHashes))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),main=cv.modules.find(m=>m.name===cv.main_module);assert(main,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(main.content_base64,'base64').toString('utf8'))),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');
    report.result='SUCCESS';report.candidateVersion=candidate;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_12BET_ONEFILE_SUCCESS',JSON.stringify({base,candidate,logoSha:LOGO_SHA,path:'/'+PATH,jsSha,oldCssSha:report.before.cssSha,newCssSha:report.after.cssSha,affiliateUrl:AFF}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}