import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const PATH='assets/affiliate/betsson-logo.png';
const LOGO=Buffer.from('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','base64');
const LOGO_SHA='0af66ec1107ead3abecb4e57ba93a8d723b8a2ac5d81b975912c7239f28b1abf';
const EXPECTED_OLD_SHA='000415b04f23d56273508da3302fc64a5f07aabc46356e40e588c7aefd09d153';
const PRESERVE=['assets/affiliate/easybet-logo.png','assets/affiliate/12bet-logo.png','assets/affiliate/12bet-logo-dark.png'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));

mkdirSync('audit',{recursive:true});
const report={startedAt:new Date().toISOString(),scope:'Betsson logo asset only: replace current bottom-clipped local PNG with corrected transparent PNG. Keep current slot size, JS/CSS, affiliate URL, EasyBet, Engine, Statistics, EventFlow, worker/settings/crons unchanged.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
let base=null,candidate=null;

async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback Betsson bottom logo fix'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(LOGO),LOGO_SHA,'LOGO_BYTES_MISMATCH');
  const current=await inspect(); base=current.restore.version;
  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const liveOld=await publicFile('/'+PATH,'image');
  assert.equal(sha(liveOld),EXPECTED_OLD_SHA,'STOP_BETSSON_LOGO_NOT_EXPECTED_CURRENT');

  const js=await publicFile('/full-market-bookmaker-343.js','javascript');
  const css=await publicFile('/full-market-bookmaker-343.css','css');
  const jsSha=sha(js), cssSha=sha(css);
  const jsText=js.toString('utf8');
  assert(jsText.includes("'betsson':'/assets/affiliate/betsson-logo.png'"),'STOP_BETSSON_LOCAL_MAPPING_MISSING');

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

  const target=resolve(staged.runtime,'assets',PATH);
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,LOGO);

  const protectedHashes={...staged.hashes};
  report.before={version:base,logoSha:EXPECTED_OLD_SHA,jsSha,cssSha,preserved};
  report.after={logoSha:LOGO_SHA,path:PATH,size:'200x40',note:'full lower strokes + transparent bottom margin'};
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
        const pubJs=await publicFile('/full-market-bookmaker-343.js','javascript');
        const pubCss=await publicFile('/full-market-bookmaker-343.css','css');
        let preserveOk=true;
        for(const [p,h] of Object.entries(preserved))preserveOk=preserveOk&&sha(await publicFile('/'+p,'image'))===h;
        if(sha(pubLogo)===LOGO_SHA&&sha(pubJs)===jsSha&&sha(pubCss)===cssSha&&preserveOk){ok=true;break}
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
    console.log('BALL46_BETSSON_BOTTOMFIX_SUCCESS',JSON.stringify({base,candidate,oldLogoSha:EXPECTED_OLD_SHA,newLogoSha:LOGO_SHA,path:PATH,jsSha,cssSha}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
