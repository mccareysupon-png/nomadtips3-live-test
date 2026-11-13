// Control-plane GET only. No Worker invocation, scan, provider request, or deploy.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const D='work/statistics-summary-shadow-20261113', A='62cb0db544160e6591342abd6b4f35cc';
const expectedEngine='30aef0bb9c4be48a40c4bf38bf113b40ca1fd2d384187eefc275829c43e8ba56';
await mkdir(D+'/source',{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function cf(path) {
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}});
 assert(r.ok,'CONTROL_READ_HTTP_'+r.status); const j=await r.json();assert(j.success,'CONTROL_READ_FAILED');return j.result;
}
const report={at:new Date().toISOString(),productionWrites:0,runtimeRequests:0,providerRequests:0,workers:[]};
for(const worker of ['nomadtips3-engine-343','ball46-production']) {
 const d=(await cf('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];
 assert(d.versions.length===1&&d.versions[0].percentage===100,'SPLIT_TRAFFIC_STOP');
 const active=d.versions[0].version_id,v=await cf('/workers/workers/'+worker+'/versions/'+active+'?include=modules');
 const main=v.modules.find(m=>m.name===v.main_module),bytes=Buffer.from(main.content_base64,'base64');
 const row={worker,active,deployment:d.id,sha:sha(bytes),assets:[]};
 if(worker==='nomadtips3-engine-343') {
  assert.equal(row.sha,expectedEngine,'ENGINE_SOURCE_DRIFT_STOP');await writeFile(D+'/source/engine.js',bytes);
 } else {
  for(const m of v.modules) {
   if(m.content_type!=='text/plain')continue;
   let j;try{j=JSON.parse(Buffer.from(m.content_base64,'base64'))}catch{continue}
   for(const asset of j.assets||[]) if(asset.path?.split('?')[0]==='/longterm-performance-343.js'||asset.path==='/singlepage-workspace-343.js') {
    const b=Buffer.from(asset.base64,'base64');row.assets.push({module:m.name,path:asset.path,sha:sha(b)});
    await writeFile(D+'/source/'+asset.path.split('?')[0].slice(1),b);
   }
  }
  if(!row.assets.some(x=>x.path.split('?')[0]==='/longterm-performance-343.js')) {
   console.log('ASSET_DISCOVERY '+JSON.stringify({worker,active,sha:row.sha,modules:v.modules.map(x=>({name:x.name,type:x.content_type})),references:bytes.toString('utf8').match(/.{0,90}longterm-performance.{0,180}/g)?.slice(0,8)}));
  }
  for(const path of ['/longterm-performance-343.js','/singlepage-workspace-343.js'])assert.equal(row.assets.filter(x=>x.path.split('?')[0]===path).length,1,'ASSET_MAPPING_STOP_'+path);
 }
 const after=(await cf('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];
 assert.equal(after.id,d.id,'ACTIVE_CHANGED_DURING_CAPTURE');report.workers.push(row);
}
await writeFile(D+'/source/active.json',JSON.stringify(report,null,2));console.log('FRESH_SOURCE '+JSON.stringify(report));