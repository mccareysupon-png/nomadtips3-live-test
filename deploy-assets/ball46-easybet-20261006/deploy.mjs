import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const EXPECTED_VERSION='8e9609cc-2169-4708-a72f-7d7198162030';
const EXPECTED_JS_SHA='fc4a620148d47d10b24798ade6607daa543ecd55f5c1453e92d89c365ab5ca3e';
const EXPECTED_CSS_SHA='1d7896d7d7ee81406124931fbb6fc00fa844d30cf5913cbf17adaf31c56ab9be';
const AFF='https://track.matchbook-gaming.com/o/RjE8Gt?site_id=101060';
const LOGO_PATH='assets/affiliate/easybet-logo.png';
const LOGO=Buffer.from('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','base64');
const LOGO_SHA='7f6c5de619edb23be0419c720a1e714520daf51c7c4af1150575f9bbcd53f3ec';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={startedAt:new Date().toISOString(),scope:'EasyBet only: add non-clickable logo asset and affiliate links on Easybets odds values only. Preserve CSS, Engine, Statistics, EventFlow, worker, settings, crons and unrelated assets.'};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null;

async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback EasyBet affiliate patch'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(LOGO),LOGO_SHA,'LOGO_BYTES_MISMATCH');
  const current=await inspect(); base=current.restore.version;
  report.baseVersion=base;
  assert.equal(base,EXPECTED_VERSION,'STOP_PRODUCTION_VERSION_MOVED');

  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
  const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
  const beforeJs=readFileSync(jsPath,'utf8');
  const beforeCss=readFileSync(cssPath,'utf8');
  assert.equal(sha(Buffer.from(beforeJs)),EXPECTED_JS_SHA,'STOP_FULL_MARKET_JS_MOVED');
  assert.equal(sha(Buffer.from(beforeCss)),EXPECTED_CSS_SHA,'STOP_FULL_MARKET_CSS_MOVED');
  assert(beforeJs.includes("['1xbet','1xBet'],['bwin','Bwin'],['easybets','Easybets']"),'EASYBETS_SLUG_MISSING');
  assert(!beforeJs.includes("'easybets':'"+AFF+"'"),'EASYBETS_AFF_ALREADY_PRESENT');
  assert(!beforeJs.includes("'easybets':'/assets/affiliate/easybet-logo.png'"),'EASYBETS_LOGO_ALREADY_PRESENT');

  const oldAff="  '12bet':'https://goto.elv520.com/join/49549/id/facebook/index.html'\n});";
  const newAff="  '12bet':'https://goto.elv520.com/join/49549/id/facebook/index.html',\n  'easybets':'"+AFF+"'\n});";
  assert(beforeJs.includes(oldAff),'AFFILIATE_MAP_MARKER_MISSING');
  let afterJs=beforeJs.replace(oldAff,newAff);

  const oldLogo="  '12bet':'/assets/affiliate/12bet-logo.png'\n});";
  const newLogo="  '12bet':'/assets/affiliate/12bet-logo.png',\n  'easybets':'/assets/affiliate/easybet-logo.png'\n});";
  assert(afterJs.includes(oldLogo),'BOOK_LOGO_MAP_MARKER_MISSING');
  afterJs=afterJs.replace(oldLogo,newLogo);

  assert(afterJs.includes("'easybets':'"+AFF+"'"),'AFFILIATE_PATCH_MISSING');
  assert(afterJs.includes("'easybets':'/assets/affiliate/easybet-logo.png'"),'LOGO_PATCH_MISSING');
  assert(afterJs.includes('function affiliatePriceHtml(v,slug)'),'PRICE_LINK_FUNCTION_CHANGED');
  assert(afterJs.includes('function bookLabelHtml(b)'),'BOOK_LABEL_FUNCTION_CHANGED');
  assert(beforeCss.includes('pointer-events:none'),'NON_CLICKABLE_LOGO_GUARD_MISSING');

  writeFileSync(jsPath,afterJs);
  const logoTarget=resolve(staged.runtime,'assets',LOGO_PATH);
  mkdirSync(dirname(logoTarget),{recursive:true});
  writeFileSync(logoTarget,LOGO);

  const protectedHashes={...staged.hashes};
  delete protectedHashes['full-market-bookmaker-343.js'];

  report.before={version:base,jsSha:EXPECTED_JS_SHA,cssSha:EXPECTED_CSS_SHA};
  report.after={jsSha:sha(Buffer.from(afterJs)),cssSha:EXPECTED_CSS_SHA,logoSha:LOGO_SHA,logoPath:LOGO_PATH,affiliateUrl:AFF,slug:'easybets'};
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
        const pubJs=(await publicFile('/full-market-bookmaker-343.js','javascript')).toString('utf8');
        const pubCss=await publicFile('/full-market-bookmaker-343.css','css');
        const pubLogo=await publicFile('/'+LOGO_PATH,'image');
        if(pubJs.includes("'easybets':'"+AFF+"'")&&pubJs.includes("'easybets':'/assets/affiliate/easybet-logo.png'")&&sha(pubCss)===EXPECTED_CSS_SHA&&sha(pubLogo)===LOGO_SHA){ok=true;break}
      }catch{}
      await delay(1000);
    }
    assert(ok,'PUBLIC_VERIFY_NOT_CONVERGED');

    for(const [p,h] of Object.entries(protectedHashes))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),main=cv.modules.find(m=>m.name===cv.main_module);assert(main,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(main.content_base64,'base64').toString('utf8'))),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');

    report.result='SUCCESS';report.candidateVersion=candidate;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_EASYBET_DEPLOY_SUCCESS',JSON.stringify({base,candidate,jsSha:report.after.jsSha,cssSha:EXPECTED_CSS_SHA,logoSha:LOGO_SHA,affiliateUrl:AFF,slug:'easybets'}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
