import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile,directOrigin} from './production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from './rail.mjs';

const TARGET='dashboard-v2-stage3.js'; // confirmed production single-asset target
const candidateBytes=readFileSync(TARGET);
assert(candidateBytes.length>0,'CANDIDATE_EMPTY');
assert(candidateBytes.includes(Buffer.from('preserveMissingFixtures')),'PATCH_MARKER_MISSING');
mkdirSync('audit',{recursive:true});
let current=null,candidate=null;
async function rollback(){
  if(!current)return;
  const a=await activeVersion();
  if(a===current.restore.version)return;
  if(candidate&&a!==candidate)throw new Error('ROLLBACK_SKIPPED_FOREIGN_ACTIVE:'+a);
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}],annotations:{'workers/message':'Rollback dashboard preserve-partial '+(process.env.GITHUB_RUN_ID||'manual')}})});
  assert.equal(await activeVersion(),current.restore.version,'ROLLBACK_NOT_CONFIRMED');
}
try{
  current=await inspect();
  const base=current.restore.version;
  const settings=await api(`/scripts/${script}/settings`);
  const crons=await schedules();
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert(staged.hashes[TARGET],'TARGET_NOT_IN_CURRENT_RAIL');
  const before=await publicFile('/'+TARGET,undefined,directOrigin);
  assert.equal(sha(before),staged.hashes[TARGET],'TARGET_BASE_MOVED');
  writeFileSync('audit/before.js',before);
  const protectedAssets={...staged.hashes}; delete protectedAssets[TARGET];
  writeFileSync(resolve(staged.runtime,'assets',TARGET),candidateBytes);
  writeFileSync('audit/after.js',candidateBytes);
  wrangler(staged,true);
  assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');
  await verifyRailBase(staged);
  try{
    wrangler(staged);
    for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await new Promise(r=>setTimeout(r,1200))}
    assert(candidate,'NO_NEW_VERSION');
    let ok=false;
    for(let i=0;i<120;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        const b=await publicFile('/'+TARGET,undefined,directOrigin);
        if(sha(b)===sha(candidateBytes)&&b.includes(Buffer.from('preserveMissingFixtures'))){ok=true;break}
      }catch{}
      await new Promise(r=>setTimeout(r,1250));
    }
    assert(ok,'TARGET_NOT_LIVE');
    const diff={};
    for(const [p,h] of Object.entries(protectedAssets)){
      const got=sha(await publicFile('/'+p,undefined,directOrigin));
      if(got!==h)diff[p]={expected:h,got};
    }
    assert.equal(Object.keys(diff).length,0,'UNRELATED_ASSETS_CHANGED:'+JSON.stringify(diff));
    const board=JSON.parse(await publicFile('/api/engine/board','json'));
    assert(board?.ok===true&&Array.isArray(board.fixtures),'BOARD_API_BAD');
    writeFileSync('audit/result.json',JSON.stringify({baseVersion:base,finalVersion:candidate,target:TARGET,targetSha:sha(candidateBytes),fixtures:board.fixtures.length,unrelatedAssetsChanged:0},null,2));
    console.log('BALL46_DASHBOARD_PARTIAL_PRESERVE_SUCCESS');
  }catch(e){await rollback();throw e}
}catch(e){console.error(e.stack);process.exitCode=1}
