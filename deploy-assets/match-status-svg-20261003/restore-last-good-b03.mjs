import assert from 'node:assert/strict';
import { activeVersion,getVersion,api,script,publicFile,sha } from './production.mjs';
const TARGET='b03f4945-2057-4400-a92a-d1ab0a9682f7';
const before=await activeVersion();console.log('BEFORE='+before);
assert.notEqual(before,TARGET,'TARGET_ALREADY_ACTIVE');
const target=await getVersion(TARGET);assert(target?.main_module,'TARGET_VERSION_MISSING');
console.log('TARGET_MAIN='+target.main_module);console.log('TARGET_MODULES='+target.modules.length);
await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:TARGET,percentage:100}],annotations:{'workers/message':'Restore last confirmed Ball46 Production after unintended old-site deployment'}})});
assert.equal(await activeVersion(),TARGET,'RESTORE_NOT_ACTIVE');
try{
 const idx=await publicFile('/index.html','html'),dash=await publicFile('/dashboard-v2-stage3.js','javascript');
 const it=idx.toString('utf8'),dt=dash.toString('utf8');
 console.log('INDEX_BYTES='+idx.length);console.log('INDEX_SHA='+sha(idx));console.log('DASH_SHA='+sha(dash));
 assert(idx.length>100000,'RESTORED_INDEX_TOO_SMALL');
 assert(!/data-featured-signal>No active signal<\/div>/.test(it),'RESTORED_INDEX_FALLBACK_VISIBLE');
 assert(!dt.includes("return'No active signal'")&&!dt.includes('return"No active signal"'),'RESTORED_DASH_FALLBACK_VISIBLE');
 const [board,signals,stats]=await Promise.all(['/api/engine/board','/api/engine/signals','/api/engine/statistics'].map(async p=>JSON.parse(await publicFile(p,'json'))));
 assert(board?.ok===true&&Array.isArray(board.fixtures),'BOARD_UNHEALTHY');assert(Array.isArray(signals?.signals),'SIGNALS_UNHEALTHY');assert(stats?.ok===true&&Array.isArray(stats.rows),'STATS_UNHEALTHY');
 console.log('API_COUNTS='+JSON.stringify({fixtures:board.fixtures.length,signals:signals.signals.length,settled:stats.rows.length}));
 console.log('FINAL_PRODUCTION='+TARGET);console.log('BALL46_LAST_GOOD_RESTORE_SUCCESS');
}catch(e){
 await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:before,percentage:100}],annotations:{'workers/message':'Rollback failed Ball46 last-good restore verification'}})});
 assert.equal(await activeVersion(),before,'ROLLBACK_AFTER_RESTORE_VERIFY_FAIL');
 throw e;
}
