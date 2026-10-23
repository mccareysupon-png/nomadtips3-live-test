import assert from 'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{sha,NEW_HOME,NEW_AWAY,OLD_HOME,OLD_AWAY}from'./patch.mjs';
const activeId='e0835238-ea2d-47e4-ad21-1fd1cf0884ff',deployment='06ef93ee-d34f-4143-bdb8-aafce93a5dc8',htmlSha='359b3e59929b9d18bdf5f90c39f30c939d9656dbd2e9935802de17fd6c3811ae';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;assert(token&&account);
const cf=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token}});
const data=await cf.json();assert(cf.ok&&data.success);const live=data.result.deployments[0];
assert.equal(live.id,deployment);assert.deepEqual(live.versions,[{version_id:activeId,percentage:100}]);
const checks=[];
for(const host of ['https://ball46.com','https://www.ball46.com']){
 for(const path of ['/','/index.html']){const u=new URL(path,host);u.searchParams.set('independentLabelsAudit',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),body=Buffer.from(await r.arrayBuffer());
  assert.equal(r.status,200);assert.equal(sha(body),htmlSha,'HTML_BYTES_CHANGED');const html=body.toString();
  assert.equal(html.split(NEW_HOME).length,2);assert.equal(html.split(NEW_AWAY).length,2);
  assert.equal(html.includes(OLD_HOME),false);assert.equal(html.includes(OLD_AWAY),false);
  assert.equal(r.headers.get('x-ball46-comparison-labels'),'home-away-only-20261023');
  assert(html.includes('atomic-v11-20261023'),'PRIOR_SIGNAL_UI_LOST');
  checks.push({host,path,http:r.status,sha:htmlSha});
 }
 for(const path of ['/favicon-192.png','/api/engine/health','/api/full-market/health']){const u=new URL(path,host);u.searchParams.set('independentLabelsAudit',Date.now());const r=await fetch(u,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);
  if(path.endsWith('/health'))assert.equal((await r.json()).ok,true);
  checks.push({host,path,http:200});
 }
}
const report={at:new Date().toISOString(),worker:'ball46-production',activeVersion:activeId,deployment,ok:true,checks};
await mkdir('audit',{recursive:true});await writeFile('audit/independent-postdeploy.json',JSON.stringify(report,null,2));
console.log('B46_COMPARE_POST_AUDIT='+JSON.stringify({ok:true,version:activeId,deployment,checks:checks.length}));
