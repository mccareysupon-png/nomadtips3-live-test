import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{NEW_TAG,NEW_SCORE,OLD_SCORE,JS_PATH,sha}from'./patch.mjs';
const version='9f0b9a92-6a1f-402e-9ff6-a428ae591080',deployment='22c67793-5a82-4d83-a28a-dbe45d2f0170';
const htmlSHA='f1139e0c771e85d00f4f36215244dbab60d64de65708ba7df22df6c496ee8e69',jsSHA='4569735d62cf661cdc0b4fe3cec9c075a21b1834be484202324a96cea627ba1a';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(account&&token);
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
const j=await r.json();assert(r.ok&&j.success);const live=j.result.deployments[0];assert.equal(live.id,deployment);assert.deepEqual(live.versions,[{version_id:version,percentage:100}]);
const checks=[];
for(const host of ['https://ball46.com','https://www.ball46.com']){
 for(const [path,hash]of [['/',htmlSHA],['/index.html',htmlSHA],[JS_PATH,jsSHA]]){
  const u=new URL(path,host);u.searchParams.set('scoreIndependent',Date.now());const resp=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(46000)}),buf=Buffer.from(await resp.arrayBuffer());
  assert.equal(resp.status,200);assert.equal(sha(buf),hash,'LIVE_BYTES_CHANGED_'+host+path);
  if(path==='/')assert(buf.toString().includes(NEW_TAG),'SCORE_JS_VERSIONED_TAG_MISSING');
  if(path===JS_PATH){assert.equal(resp.headers.get('x-ball46-score-dash'),'short-hyphen-20261023');assert(buf.toString().includes(NEW_SCORE));assert(!buf.toString().includes(OLD_SCORE));}
  checks.push({host,path,status:200,sha:hash});
 }
 for(const path of ['/favicon-192.png','/api/engine/health','/api/full-market/health']){
  const u=new URL(path,host);u.searchParams.set('scoreIndependent',Date.now());const resp=await fetch(u,{signal:AbortSignal.timeout(45000)});assert.equal(resp.status,200);if(path.endsWith('/health'))assert.equal((await resp.json()).ok,true);checks.push({host,path,status:200});
 }
}
const out={time:new Date().toISOString(),version,deployment,ok:true,checks};await mkdir('audit',{recursive:true});await writeFile('audit/independent.json',JSON.stringify(out,null,2));
console.log('B46_SCORE_POST_AUDIT='+JSON.stringify({ok:true,version,deployment,checks:checks.length}));
