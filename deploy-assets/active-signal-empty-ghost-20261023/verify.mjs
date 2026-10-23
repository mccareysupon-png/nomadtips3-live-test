import assert from'node:assert/strict';
import{mkdir,writeFile}from'node:fs/promises';
import{NEW_TAG,JS_PATH,sha}from'./patch.mjs';
const activeId='50f65def-f4a1-4172-8dd4-ac3c7bb82209',deployment='3505f1e1-294c-4185-8ab5-3601870e09e2';
const htmlSHA='8b1eb262c971a9fc595ddf059ea3ee540724d62e72950bcb7b5a4fae323d5814',jsSHA='2c7d96adcf18afffa874237a776999d67e141d0fc1e30cb37ffd90691c7993d5';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;assert(account&&token);
const cf=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
const x=await cf.json();assert(cf.ok&&x.success);const v=x.result.deployments[0];assert.equal(v.id,deployment);assert.deepEqual(v.versions,[{version_id:activeId,percentage:100}]);
const checks=[];
for(const host of ['https://ball46.com','https://www.ball46.com']){
 for(const [path,hash]of [['/',htmlSHA],['/index.html',htmlSHA],[JS_PATH,jsSHA]]){
  const u=new URL(path,host);u.searchParams.set('ghostIndependentVerify',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(45000)}),buf=Buffer.from(await r.arrayBuffer());
  assert.equal(r.status,200);assert.equal(sha(buf),hash,'LIVE_SOURCE_DRIFT_'+host+path);
  if(path==='/')assert(buf.toString().includes(NEW_TAG),'SCRIPT_TAG_REVERTED');
  if(path===JS_PATH){assert.equal(r.headers.get('x-ball46-empty-ghost'),'fixed-20261023');assert(buf.toString().includes("if(signal){signal.replaceChildren();signal.classList.remove('locked');signal.title=''}"),'GHOST_CLEAR_NOT_FIXED');assert(buf.toString().includes("node.textContent.trim().toLowerCase()==='no active signal'"),'ORPHAN_PURGE_LOST');}
  checks.push({host,path,status:200,sha:hash});
 }
 for(const path of ['/favicon-192.png','/api/engine/health','/api/full-market/health']){
  const u=new URL(path,host);u.searchParams.set('ghostIndependentVerify',Date.now());const r=await fetch(u,{signal:AbortSignal.timeout(45000)});assert.equal(r.status,200);
  if(path.endsWith('/health'))assert.equal((await r.json()).ok,true);
  checks.push({host,path,status:200});
 }
}
const result={at:new Date().toISOString(),worker:'ball46-production',activeVersion:activeId,deployment,ok:true,checks};
await mkdir('audit',{recursive:true});await writeFile('audit/independent-postdeploy.json',JSON.stringify(result,null,2));
console.log('B46_GHOST_POST_AUDIT='+JSON.stringify({ok:true,active:activeId,deployment,checks:checks.length}));
