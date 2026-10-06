import assert from 'node:assert/strict';
import { activeVersion,getVersion,api,script,publicFile,sha } from './production.mjs';
const TARGET='2d653863-c4cb-4417-a9e1-924589a767d1';
const before=await activeVersion();console.log('BEFORE='+before);
assert.notEqual(before,TARGET,'TARGET_ALREADY_ACTIVE');
const target=await getVersion(TARGET);assert(target?.main_module,'TARGET_VERSION_MISSING');
console.log('TARGET_MAIN='+target.main_module);console.log('TARGET_MODULES='+target.modules.length);
await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:TARGET,percentage:100}],annotations:{'workers/message':'Restore last confirmed Ball46 Production after failed parallel dashboard deploy'}})});
assert.equal(await activeVersion(),TARGET,'RESTORE_NOT_ACTIVE');
try{
 let idx=null,dash=null,ok=false,last='';
 for(let i=0;i<45;i++){
   assert.equal(await activeVersion(),TARGET,'TARGET_MOVED_DURING_VERIFY');
   try{
     idx=await publicFile('/index.html','html');dash=await publicFile('/dashboard-v2-stage3.js','javascript');
     const it=idx.toString('utf8'),dt=dash.toString('utf8');
     last=JSON.stringify({attempt:i+1,indexBytes:idx.length,indexSha:sha(idx),dashSha:sha(dash),indexFallback:it.includes('data-featured-signal>No active signal</div>'),dashFallback:dt.includes("return'No active signal'")||dt.includes('return"No active signal"')});
     console.log('VERIFY='+last);
     if(idx.length>100000&&!it.includes('data-featured-signal>No active signal</div>')&&!dt.includes("return'No active signal'")&&!dt.includes('return"No active signal"')){ok=true;break}
   }catch(e){last=String(e)}
   await new Promise(r=>setTimeout(r,1500));
 }
 assert(ok,'RESTORED_ASSETS_NOT_PROPAGATED:'+last);
 const [board,signals,stats]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics'].map(async p=>JSON.parse(await publicFile(p,'json'))));
 assert(board?.ok===true&&Array.isArray(board.fixtures),'BOARD_UNHEALTHY');assert(Array.isArray(signals?.signals),'SIGNALS_UNHEALTHY');assert(stats?.ok===true&&Array.isArray(stats.rows),'STATS_UNHEALTHY');
 console.log('API_COUNTS='+JSON.stringify({fixtures:board.fixtures.length,signals:signals.signals.length,settled:stats.rows.length}));
 console.log('FINAL_PRODUCTION='+TARGET);console.log('BALL46_LAST_GOOD_RESTORE_SUCCESS');
}catch(e){
 await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:before,percentage:100}],annotations:{'workers/message':'Rollback failed Ball46 safe-version restore verification'}})});
 assert.equal(await activeVersion(),before,'ROLLBACK_AFTER_RESTORE_VERIFY_FAIL');
 throw e;
}
