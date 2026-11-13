// Re-verify the already-staged candidate after its initial source-generation
// race. Never upload or retry provider traffic and never replace its modules.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {active,version,config,modules,sha,canon} from '../statistics-member-sidebar-test-20261112/release-ops.mjs';
const D='work/statistics-summary-shadow-20261113',O=D+'/qa/combined',p=JSON.parse(await readFile(O+'/candidate.json'));
assert.equal(p.candidate,'aaef0441-9c34-44f2-a92c-6b82d076131b');assert(p.ok||p.error?.includes('PUBLIC_HTTP_503:/api/statistics/summary'),'UNRECOGNIZED_STAGE_FAILURE');
assert.deepEqual(await active(),p.before);const currentConfig=await config();
if(canon(currentConfig)!==canon(p.baseConfig)){
 const changed=(a,b)=>[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter(k=>canon(a?.[k])!==canon(b?.[k])).map(k=>({key:k,beforeHash:sha(String(canon(a?.[k]))),afterHash:sha(String(canon(b?.[k])))}));
 const diff={top:changed(p.baseConfig,currentConfig),settings:changed(p.baseConfig.settings,currentConfig.settings),beforeBindings:p.baseConfig.settings.bindings.map(({name,type,service})=>({name,type,service})),afterBindings:currentConfig.settings.bindings.map(({name,type,service})=>({name,type,service})),serviceNames:{before:Object.keys(p.baseConfig.services),after:Object.keys(currentConfig.services)}};
 await writeFile(O+'/config-diff.json',JSON.stringify(diff,null,2));console.log('CONFIG_DIFF '+JSON.stringify(diff));throw Error('BASE_CONFIG_DRIFT_STOP');
}
assert.equal((await active(p.engine.worker)).version,p.engine.active);assert.deepEqual(await active(p.summaryService),p.serviceActive);
const v=await version(p.candidate);assert.equal(v.main_module,'b46-summary-entry-20261113.mjs');assert.deepEqual(modules(v).filter(x=>!['b46-summary-entry-20261113.mjs','summary-release-payload.txt'].includes(x.name)),p.baseModules);
for(const [name,path]of [['b46-summary-entry-20261113.mjs','website-entry.mjs'],['summary-release-payload.txt','summary-release-payload.txt']])assert.equal(sha(Buffer.from(v.modules.find(x=>x.name===name).content_base64,'base64')),sha(await readFile(D+'/'+path)),'STAGED_SOURCE_DIFF:'+name);
const r=await fetch(p.preview+'/api/statistics/summary',{signal:AbortSignal.timeout(45000)}),data=await r.json();assert(r.ok&&data.ok&&data.mode==='LIVE_SUMMARY'&&!data.stale&&data.ledgerTotal>0,'HOSTED_SUMMARY_NOT_READY');
p.initialStageError=p.error;delete p.error;p.ok=true;p.resumedAt=new Date().toISOString();p.hostedSummary={asOf:data.asOf,total:data.total,ledgerTotal:data.ledgerTotal,bytes:JSON.stringify(data).length};
await writeFile(O+'/candidate.json',JSON.stringify(p,null,2));console.log('COMBINED_RESUME '+JSON.stringify({ok:true,base:p.baseVersion,candidate:p.candidate,summary:p.hostedSummary,trafficWrites:0,engineWrites:0}));

