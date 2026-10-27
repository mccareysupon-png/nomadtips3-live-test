import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const account='62cb0db544160e6591342abd6b4f35cc',worker='ball46-production',sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,account);
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}});const j=await r.json();assert(r.ok&&j.success,'CF_READ_FAILED_'+r.status);return j.result;}
await mkdir('audit-last',{recursive:true});
const report={at:new Date().toISOString(),productionWrites:0};
try{
 report.deployment=(await cf('/workers/scripts/'+worker+'/deployments?per_page=1')).deployments[0];
 const id=report.deployment.versions[0].version_id;
 const v=await cf('/workers/workers/'+worker+'/versions/'+id+'?include=modules');
 report.modules=v.modules.map(m=>({name:m.name,type:m.content_type,sha:sha(Buffer.from(m.content_base64,'base64'))}));
 report.settings=await cf('/workers/scripts/'+worker+'/settings');
 report.schedules=await cf('/workers/scripts/'+worker+'/schedules');
 report.domains=(await cf('/workers/domains')).filter(x=>x.service===worker);
 report.health=[];
 for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1','/api/prediction-vote/health']){const r=await fetch('https://ball46.com'+path),j=await r.json();report.health.push({path,status:r.status,ok:j.ok,stale:j.stale});assert(r.ok&&j.ok===true&&j.stale!==true,'UNHEALTHY:'+path);}
 const r=await fetch('https://ball46.com/');report.htmlSha=sha(Buffer.from(await r.arrayBuffer()));report.ok=true;
}catch(e){report.ok=false;report.error=e.message;process.exitCode=1;}
await writeFile('audit-last/preflight.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
