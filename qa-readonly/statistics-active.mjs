// Approved read-only Active Production identity check. No provider calls or writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const A='62cb0db544160e6591342abd6b4f35cc',base='https://api.cloudflare.com/client/v4',sha=s=>createHash('sha256').update(s).digest('hex');
async function get(path){assert(/^\/accounts\/[a-f0-9]+\/workers\/(scripts\/[^/]+\/(deployments|settings|schedules)|workers\/[^/]+\/versions\/[a-f0-9-]+)(\?.*)?$/.test(path));const r=await fetch(base+path,{method:'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(45000)});const j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED:'+r.status+':'+JSON.stringify(j.errors?.map(e=>e.code)));return j.result;}
const out={readOnly:true,at:new Date().toISOString(),productionWrites:0,providerRequests:0,workers:{}};
for(const w of ['ball46-production','nomadtips3-engine-343']){
 const p='/accounts/'+A+'/workers/scripts/'+w,d=(await get(p+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100,'SPLIT_TRAFFIC');
 const version=d.versions[0].version_id,v=await get('/accounts/'+A+'/workers/workers/'+w+'/versions/'+version+'?include=modules'),settings=await get(p+'/settings'),cron=await get(p+'/schedules');
 const modules=v.modules.map(m=>{const b=Buffer.from(m.content_base64,'base64');return{name:m.name,bytes:b.length,sha:sha(b),normalizedSha:sha(b.toString().replace(/\r\n/g,'\n'))};});
 out.workers[w]={version,deployment:d.id,main:v.main_module,assets:v.assets,modules,activeBindings:(v.bindings||[]).map(b=>({name:b.name,type:b.type,service:b.service,class_name:b.class_name})),bindings:(settings.bindings||[]).map(b=>({name:b.name,type:b.type,service:b.service,class_name:b.class_name})),configurationSha:sha(JSON.stringify(settings)),cron};
 const after=(await get(p+'/deployments?per_page=1')).deployments[0];assert(after.versions.length===1&&after.versions[0].version_id===version,'CONCURRENT_DEPLOY');
}
assert.equal(out.workers['ball46-production'].version,'488bb408-fec7-4620-aa63-5e1078904d33','WEBSITE_NOT_BASELINE');
assert.equal(out.workers['nomadtips3-engine-343'].version,'02e09215-02b1-47fb-b1cf-9423f50c7ce9','ENGINE_ROLLBACK_NOT_CONFIRMED');
out.publicChecks=[];
for(const path of ['/','/api/engine/health','/api/hub/snapshot']){const r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'RESTORED_PUBLIC_HTTP:'+path);let data;if(path.startsWith('/api/')){data=await r.json();assert(data.ok===true,'RESTORED_API_NOT_OK:'+path)}else await r.arrayBuffer();if(path==='/api/hub/snapshot')assert(data.cacheOnly===true&&data.externalRequestsAdded===0&&!data.stale,'RESTORED_HUB_HEALTH');out.publicChecks.push({path,status:r.status,ok:data?.ok,cacheOnly:data?.cacheOnly,stale:data?.stale});}
assert.equal(out.workers['ball46-production'].activeBindings.length,7,'ACTIVE_WEBSITE_BINDING_COUNT');assert(!out.workers['ball46-production'].activeBindings.some(b=>b.name==='STATISTICS_SUMMARY'),'SUMMARY_BINDING_IN_ACTIVE_WEBSITE');console.log('ACTIVE_BINDINGS_CONFIRMED',JSON.stringify(Object.fromEntries(Object.entries(out.workers).map(([w,v])=>[w,v.activeBindings.map(b=>b.name)]))));console.log('ROLLBACK_CONFIRMED',JSON.stringify({website:out.workers['ball46-production'].version,engine:out.workers['nomadtips3-engine-343'].version,publicChecks:out.publicChecks}));
await mkdir('qa-readonly/result',{recursive:true});await writeFile('qa-readonly/result/active.json',JSON.stringify(out,null,2));console.log('ACTIVE_PRODUCTION_READONLY',JSON.stringify(out));
