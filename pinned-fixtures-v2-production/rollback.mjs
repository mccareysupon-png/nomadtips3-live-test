import assert from 'node:assert/strict';
import fs from 'node:fs';
const statePath='pinned-fixtures-v2-production/release-state.json';
if(!fs.existsSync(statePath)){console.log('NO_RELEASE_STATE_NO_ROLLBACK');process.exit(0)}
const s=JSON.parse(fs.readFileSync(statePath,'utf8'));
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result}
async function active(){const d=await api('/scripts/'+s.script+'/deployments?per_page=5');const v=d.deployments?.[0]?.versions;assert(v?.length===1&&Number(v[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');return v[0].version_id}
async function activate(id,msg){return api('/scripts/'+s.script+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
const now=await active();
if(now!==s.candidate){console.log('ROLLBACK_SKIPPED_ACTIVE='+now);process.exit(0)}
await activate(s.base,'Rollback Pinned Fixtures V2 after browser QA failure');
for(let i=0;i<25;i++){if(await active()===s.base)break;await delay(1000)}
assert.equal(await active(),s.base,'ROLLBACK_FAILED');
console.log('ROLLBACK_ACTIVE='+s.base);
