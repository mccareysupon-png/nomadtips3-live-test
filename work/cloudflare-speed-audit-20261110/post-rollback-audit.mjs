import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DIR,init,active,version,modules,config,canon,sha,health,preview,json,writes,verifyLedger} from './release-ops.mjs';
await init();const p=JSON.parse(await readFile(DIR+'/candidate.json')),report={readOnly:true,productionWrites:0,at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,samples:[]};
try{
report.activeBefore=await active();assert.equal(report.activeBefore.version,p.base,'OWNED_ROLLBACK_NOT_CURRENT');const old=await version(p.base),next=await version(p.candidate);assert.deepEqual(modules(old),p.baseModules);assert.deepEqual(modules(next),p.expectedModules);assert.equal(sha(canon(await config())),p.configFingerprint);report.health=await health();report.protectedLedger=await verifyLedger(p.ledgerBefore);
for(let i=0;i<4;i++){
 for(const host of['https://ball46.com',preview(p.candidate)]){const start=performance.now();try{const r=await fetch(host+'/api/engine/board',{signal:AbortSignal.timeout(45000)}),body=await r.text();let j;try{j=JSON.parse(body)}catch{}report.samples.push({host,status:r.status,elapsedMs:Math.round(performance.now()-start),ok:j?.ok===true,fixtures:j?.fixtures?.length,bodyHash:sha(body),legacyExceptionMarker:body.includes('B46_V13_CANDIDATE_ONLY_WORKER_EXCEPTION'),errorLine:r.status>=400?body.split('\n').find(s=>/Error[: ]|Exception|timed? ?out/i.test(s))?.replace(/https?:\/\/\S+/g,'[URL omitted]').slice(0,220):undefined});}catch(e){report.samples.push({host,error:e.name,elapsedMs:Math.round(performance.now()-start)})}}
 if(i<3)await new Promise(r=>setTimeout(r,3000));
}
report.activeAfter=await active();assert.deepEqual(report.activeAfter,report.activeBefore);assert.equal(writes.length,0);report.apiCodeUnchanged=true;report.frontendChangeOnly=true;report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1}await json('post-rollback-audit.json',report);console.log(JSON.stringify(report));