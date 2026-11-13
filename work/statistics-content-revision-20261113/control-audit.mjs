// Control-plane GET only. Stores names/types and hashes, never secret values.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const D='work/statistics-content-revision-20261113',A='62cb0db544160e6591342abd6b4f35cc';
const hash=x=>createHash('sha256').update(x).digest('hex');
const before=JSON.parse(await readFile('work/statistics-summary-shadow-20261113/source/active.json'));
async function get(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});assert(r.ok,'CONTROL_READ_'+r.status);const j=await r.json();assert(j.success,'CONTROL_FAILED');return j.result}
const workers=[];
for(const source of before.workers){const W=source.worker,d=(await get('/workers/scripts/'+W+'/deployments?per_page=1')).deployments[0];assert.equal(d.id,source.deployment,'PRODUCTION_DRIFT');const version=await get('/workers/workers/'+W+'/versions/'+source.active+'?include=modules');
 const settings=await get('/workers/scripts/'+W+'/settings'),schedules=await get('/workers/scripts/'+W+'/schedules');
 const modules=version.modules.map(m=>({name:m.name,type:m.content_type,sha:hash(Buffer.from(m.content_base64,'base64'))}));
 workers.push({worker:W,active:source.active,deployment:d.id,modules,bindings:(settings.bindings||[]).map(b=>({name:b.name,type:b.type})),compatibilityDate:settings.compatibility_date,schedules:schedules.schedules??schedules,configurationSha:hash(JSON.stringify(settings))});
}
await writeFile(D+'/qa/control-audit.json',JSON.stringify({ok:true,workers,productionWrites:0,at:new Date().toISOString()},null,2));console.log('CONTROL_AUDIT '+JSON.stringify(workers.map(x=>({worker:x.worker,active:x.active,modules:x.modules.length,bindings:x.bindings.length}))));
