import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const LOGO_PATH='assets/affiliate/12bet-logo.png';
const OLD_LOGO_SHA='5ec92e197ea9f7c832c15185cf03b5ac1b9d9d0b7916d699f9296a31cdb6aced';
const NEW_LOGO=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGQAAAAYCAYAAAAMAljuAAAFD0lEQVR4nO2YTYgcRRTHf6+6e3Zn15VFg1EwDqIkjIKKoINg8KKgiJgEk0MOOXhQBI0XT96MBMGc9BIwiCBi8OOgB0ElB1GMjhINIo6KxExUIstC3CzuV3fV81DV073jZh3X7bDg/KFnemreR9V79T6qYIghhhhiiCHWBqlaQaPZ6unodtpa/r0aup225u8KZhAeAfXkPT5hsDXmPAPbQ8ANSrth0G/8QZ2xVnroOQGF6N/ybgRUFiGNZivqdtq20WwZYBxY6nbai41maxyo43flBfV3O+1pPFECXLUAZrS0++fDd71gUYEzgUcEVOESYFPQxULQV5Kj+Oj7A7DA5fNejoyWePL3+UKfE/hlbZZZHZU4pNFsSUhPI8CHwFZgEbgbuA84AKRAvAJ77qjvgb2nf/1uNp2bOyXO1fFGy2nKLxIBin4ZKXsEfs/g4UjkQIZeBqJ52hNUi2VrFiM1K/osjulI5IW0mJf0qPyUFFDjmc/HqpvXw1b9WMkg6wHTaLbuAZ4GtpfGr8Pv+Ml/4FfgDuAgs7OPShyPxpBYSCLwJtGC2PrHJsh2a/QhdbyJyMuBSONlG09KKsKIMqqGEZSRBEZAcSWKiOU7N63ObpUJToC38akqDWMRMAa8BrTDeLnoWmACOIpPMw7YMgujdXVZCnEEkqGH1fCGKLXYspTC7UbkeQl6HIw42Jp4BQsRMuLQg045FubQs3UMCmoM/PynsjiOfgW4FBCRlwzcAIpFTqjqk4FfKSJ13VGVQyLgGH7xD4QxAyTdTnsKmLoQY6PZmgGuCD/TCdA0OM2AWOGHWsbHOb3CbwqHMi8/wq8pN7oxIKnyXg0+G2DeZ/OXFM6H9IRFz9Xg+GBL/2+oyiGL3U57R6PZagI7KaJEARrN1lP4lARF+6j4CLoaWMBHWYwvoGVMpMKLMbIthTSDawWcAXGwkDjaGdQAAZFQta9Phb0GmXSQgUooVDZGEivyfuTc0aDTAZr1Mp1g0Dh0bSafr1QUJVU5JD9vTPaNzzSarUeAQwPKeRdYUmOMuAxvHERhD8LmJCT5JbAJJA5OvQWf7IR7ociFzjCZqDwO+YFmuYtVHQKvfwvcCFZ8VAbpvp7EYNV3YJWePyorTqHL6t9FMXA/vTrMFPAOy0o0Bm+xb4Ajc/X6lcniggVJgh2dCM845RoHiwo3x7Ajg6UEtu2CXVFIPaXe9lyGPhfDpRlYUzjEGjTB8BHWO6M0Dym+ytOrFpU5JKB/JXnIR+H5oNtpP7GagDGQVEQJ7aqDmZrjcC56DrYkIjuc/18xbEodZ5OwmwWoOX4S30ysPK3gBvFRkDtC80H04jmlaodAEQ25M/IuRYGbGs3WforuJ0d+YDtDp/2pCA4VdYoF7soMGb6bSkW51XlDepkOF3hFUecQ64THloRbcj35RAy4CCIcJwWOh7NKnqociA2d80W7JqnaIVHpAV8066Xft4XnQvhxFu4cE5mI1NvJILtRdufCcxhkDMDByQROW7CJSN1fhMk+lH39EwNAIBN9BeU43iF52ppAiMJdzPga1r4mVFbUw/cM8DmQBV3T+NowGcaElYukDfQnJyDLlC/8+UJVEKe9zkvzz8jAvApHakobIFV9ENif+esTF65SehCf/myiGqvwdSHKJykVXkV1J4CBE+tjlv8hfCGp/ha7KmzY6/cyzyB0wQkmPx9ocaoeiF/66JbXk7//P8QQQwwxxBAbDX8BL836BWGK6F4AAAAASUVORK5CYII=','base64');
const NEW_LOGO_SHA='da95a4d89533a4b1240e7b4fcf8a67f088c02d0fc4215c63fc774faea35f66d8';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const report={startedAt:new Date().toISOString(),scope:'12BET logo asset swap only; preserve exact path, JS, CSS, affiliate URL, worker, settings, crons, and every unrelated asset.'};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));

let base=null,candidate=null;
async function rollback(){
  if(!base)return;
  const active=await activeVersion();
  if(active===base)return;
  if(candidate&&active!==candidate)throw new Error('ROLLBACK_STOP_FOREIGN_ACTIVE:'+active);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback 12BET light-mode logo asset swap'}})});
  assert.equal(await activeVersion(),base,'ROLLBACK_NOT_CONFIRMED');
}

try{
  assert.equal(sha(NEW_LOGO),NEW_LOGO_SHA,'NEW_LOGO_BYTES_MISMATCH');
  const current=await inspect();
  base=current.restore.version;
  report.baseVersion=base;

  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_STAGE');

  const before=await publicFile('/'+LOGO_PATH,'image');
  assert.equal(sha(before),OLD_LOGO_SHA,'STOP_12BET_LOGO_NOT_EXPECTED_CURRENT_ASSET');
  const logoFile=resolve(staged.runtime,'assets',LOGO_PATH);
  mkdirSync(dirname(logoFile),{recursive:true});

  const jsPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.js');
  const cssPath=resolve(staged.runtime,'assets','full-market-bookmaker-343.css');
  const jsShaBefore=sha(readFileSync(jsPath));
  const cssShaBefore=sha(readFileSync(cssPath));

  writeFileSync(logoFile,NEW_LOGO);

  const protectedHashes={...staged.hashes};
  delete protectedHashes[LOGO_PATH];

  report.before={version:base,logoSha:OLD_LOGO_SHA,jsSha:jsShaBefore,cssSha:cssShaBefore};
  report.after={logoSha:NEW_LOGO_SHA,logoBytes:NEW_LOGO.length,logoPath:LOGO_PATH};
  save();

  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'STOP_PRODUCTION_MOVED_AFTER_DRY_RUN');

  try{
    wrangler(staged,false);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
    assert(candidate,'NO_NEW_PRODUCTION_VERSION');

    let converged=false;
    for(let i=0;i<25;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const pubLogo=await publicFile('/'+LOGO_PATH,'image');
        const pubJs=await publicFile('/full-market-bookmaker-343.js','javascript');
        const pubCss=await publicFile('/full-market-bookmaker-343.css','css');
        if(sha(pubLogo)===NEW_LOGO_SHA && sha(pubJs)===jsShaBefore && sha(pubCss)===cssShaBefore){converged=true;break}
      }catch{}
      await delay(1000);
    }
    assert(converged,'PUBLIC_VERIFY_NOT_CONVERGED');

    for(const [p,h] of Object.entries(protectedHashes))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);
    const cv=await getVersion(candidate),main=cv.modules.find(m=>m.name===cv.main_module);assert(main,'FINAL_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(main.content_base64,'base64').toString('utf8'))),workerSha,'WORKER_SOURCE_CHANGED');
    assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');

    report.result='SUCCESS';report.candidateVersion=candidate;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_12BET_LOGO_LIGHT_SAFE_SUCCESS',JSON.stringify({base,candidate,oldLogoSha:OLD_LOGO_SHA,newLogoSha:NEW_LOGO_SHA,path:LOGO_PATH}));
  }catch(e){report.error=e.message;save();try{await rollback()}catch(rb){report.rollbackError=rb.message;save()}throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
