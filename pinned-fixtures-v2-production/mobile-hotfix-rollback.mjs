import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=JSON.parse(fs.readFileSync('pinned-fixtures-v2-production/mobile-hotfix-state.json','utf8'));
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
async function active(){const d=await api('/scripts/'+s.script+'/deployments?per_page=5');return d.deployments?.[0]?.versions?.[0]?.version_id}
async function activate(id,msg){return api('/scripts/'+s.script+'/deployments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':msg}})})}
if(await active()===s.candidate)await activate(s.base,'Rollback mobile Favorite hotfix after browser QA failure');
console.log('ROLLBACK_ACTIVE='+(await active()));
assert.equal(await active(),s.base,'ROLLBACK_FAILED');
