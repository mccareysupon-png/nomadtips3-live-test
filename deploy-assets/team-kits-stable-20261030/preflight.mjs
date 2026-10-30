import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const API='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc',W='ball46-production';
async function cf(path){const r=await fetch(API+path,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}}),j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
await mkdir('audit',{recursive:true});
const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);
const base=d.versions[0].version_id,v=await cf('/workers/workers/'+W+'/versions/'+base+'?include=modules');
const settings=await cf('/workers/scripts/'+W+'/settings'),schedules=await cf('/workers/scripts/'+W+'/schedules'),domains=(await cf('/workers/domains')).filter(x=>x.service===W);
const health=[];for(const path of ['/api/engine/health','/api/full-market/health','/api/engine/board','/api/engine/signals','/api/engine/statistics?paged=1','/api/prediction-vote/health']){const r=await fetch('https://ball46.com'+path),j=await r.json();assert(r.status===200&&j.ok===true,'BACKEND_NOT_OK:'+path);if(path.endsWith('/board'))assert(j.stale===false);health.push({path,status:r.status,ok:j.ok});}
const source=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
const summary={base,deployment:d.id,main:v.main_module,modules:v.modules.map(m=>({name:m.name,type:m.content_type,sha:createHash('sha256').update(Buffer.from(m.content_base64,'base64')).digest('hex')})),settings,schedules,domains,health,wrapperSupported:source.includes('export default{...__statsVisualPrevious'),sourceTail:source.slice(-1600),at:new Date().toISOString()};
await writeFile('audit/preflight.json',JSON.stringify(summary,null,2));console.log('PREFLIGHT_PASS='+JSON.stringify({base,main:v.main_module,modules:summary.modules.length,wrapperSupported:summary.wrapperSupported}));

