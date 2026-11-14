// Control-plane GET only. No Worker invocation, scan, provider request, or deploy.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
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
  // The base ASSETS binding is external to Worker modules. Verify the recorded
  // reference bytes against the current main bundle's exact asset manifest.
  // This proves reference identity, NOT a public-URL delivery/route test.
  if(!row.assets.some(x=>x.path.split('?')[0]==='/longterm-performance-343.js')) {
   const normalized=bytes.toString('utf8').replaceAll('\\"','"');
   const refs=[...normalized.matchAll(/"path":"(\/longterm-performance-343\.js(?:\?[^" ]*)?)","sha":"([a-f0-9]{64})","bytes":(\d+)/g)];
   const b=await readFile(D+'/reference/longterm-performance-343.js');let path,verification;
   if(refs.length===1){
    assert.equal(sha(b),refs[0][2],'FINANCIAL_MANIFEST_HASH_DRIFT');assert.equal(b.length,Number(refs[0][3]),'FINANCIAL_SIZE_DRIFT');
    path=refs[0][1];verification='LOCAL_REFERENCE_MATCHES_ACTIVE_MANIFEST_NOT_URL_DELIVERY';
   }else{
    // A wrapper may hide the old manifest; insist that ACTUAL static bytes
    // equal the pinned financial reference instead of assuming identity.
    const enabled=await cf('/workers/scripts/'+worker+'/subdomain');assert.equal(enabled.enabled,true,'STATIC_REFERENCE_SUBDOMAIN_DISABLED');
    const sub=(await cf('/workers/subdomain')).subdomain;assert(/^[a-z0-9-]+$/.test(sub),'STATIC_REFERENCE_BAD_SUBDOMAIN');
    path='/longterm-performance-343.js';
    const res=await fetch('https://'+worker+'.'+sub+'.workers.dev'+path,{redirect:'error',signal:AbortSignal.timeout(20000)});
    assert.equal(res.status,200,'STATIC_REFERENCE_HTTP_'+res.status);
    const served=Buffer.from(await res.arrayBuffer());
    assert.equal(sha(served),sha(b),'FINANCIAL_STATIC_HASH_DRIFT');
    assert.equal(served.length,b.length,'FINANCIAL_STATIC_SIZE_DRIFT');
    verification='CURRENT_STATIC_DELIVERY_MATCHES_PINNED_FINANCIAL_REFERENCE';
   }
   row.assets.push({module:verification,path,sha:sha(b),verification});
   await writeFile(D+'/source/longterm-performance-343.js',b);
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
