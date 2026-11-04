import assert from 'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';
const root='production-audit/',publish=JSON.parse(await readFile(root+'owner-v2-published.json','utf8')),fresh=JSON.parse(await readFile(root+'preflight.json','utf8')),A='62cb0db544160e6591342abd6b4f35cc',API='https://api.cloudflare.com/client/v4/accounts/'+A,ADMIN='ball46-owner-control-v2',HOST=ADMIN+'.mccarey-supon.workers.dev',HUB='nomadtips3-5usd-hub-343';
const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,readOnly:true,productionWrites:0,ok:false,anonymous:[]};
try{
 assert(publish.ok&&fresh.ok);for(const[w,id]of Object.entries(publish.before))assert.equal(fresh.workers[w].version,id,'PRODUCTION_CHANGED_SINCE_OWNER_RELEASE');report.versions=publish.before;
 const r=await fetch(API+'/workers/scripts/'+ADMIN+'/deployments?per_page=1',{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)}),j=await r.json();assert(r.ok&&j.success);assert.equal(j.result.deployments[0].versions[0].version_id,publish.candidate);report.adminVersion=publish.candidate;
 for(const item of[{path:'/',method:'GET'},{path:'/api/settings',method:'GET'},{path:'/api/settings',method:'GET',forged:true},{path:'/api/settings',method:'PUT'}]){
  const res=await fetch('https://'+HOST+item.path,{method:item.method,redirect:'manual',headers:{...(item.forged?{'cf-access-jwt-assertion':'not.a.valid-token'}:{}),...(item.method==='PUT'?{'content-type':'application/json',origin:'https://'+HOST}:{})},body:item.method==='PUT'?JSON.stringify({seconds:15,expectedRevision:'unauthenticated-test'}):undefined,signal:AbortSignal.timeout(15000)});
  assert.equal(res.status,302,'ANONYMOUS_OWNER_ENDPOINT_NOT_BLOCKED');assert(res.headers.get('location')?.startsWith('https://rapid-glade-f6b9.cloudflareaccess.com/'));report.anonymous.push({...item,status:res.status,blocked:true});
 }
 const h=await fetch('https://'+HUB+'.mccarey-supon.workers.dev/health',{signal:AbortSignal.timeout(20000)}),health=await h.json();assert.equal(h.status,200);assert(health.ok&&!health.stale);assert.deepEqual(health.control,publish.controlBefore);report.controlAfterOwnerConfirmation=health.control;report.effectiveSeconds=health.refreshMs/1000;
 report.ok=true;
}catch(e){report.error=e.message;process.exitCode=1;}
await writeFile(root+'owner-v2-final-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
