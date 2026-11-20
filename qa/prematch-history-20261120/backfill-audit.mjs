import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const hub='nomadtips3-5usd-hub-343';const active=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;const v=await cf('/workers/'+hub+'/versions/'+active+'?include=modules');
for(const m of v.modules.filter(m=>m.content_base64)){
 const src=Buffer.from(m.content_base64,'base64').toString('utf8');
 const routes=[...new Set([...src.matchAll(/(?:pathname|path)\s*(?:===|==|\.startsWith\()\s*["'](\/[^"']{1,100})["']/g)].map(x=>x[1]))];
 const lists=[...new Set([...src.matchAll(/["'](\/(?:_internal|__bulk|history|backfill|rich|snapshot|control|fixtures|leagues|teams|health)[a-zA-Z0-9/_-]*)["']/g)].map(x=>x[1]))];
 const markers=['/leagues/','/teams/','backfill','history','async before(','async observe(','async actorControl','async fetch(request','async fetch(req','export default'];
 console.log('HUB_ROUTES',JSON.stringify({active,module:m.name,routes,lists,markers:Object.fromEntries(markers.map(k=>[k,src.includes(k)]))}));
 for(const k of ['async actorControl','async before(','async observe(','async fetch(request','var index_v2_default','export default']){let i=src.indexOf(k);if(i>=0){let c=src.slice(i,i+2400).replace(/(?:api[_-]?key|secret|token|authorization|bearer|password)\s*[:=]\s*["'][^"']+["']/gi,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{90,}/g,'[REDACTED]');console.log('HUB_CONTROL',JSON.stringify({module:m.name,k,c}))}}
}
const r=await fetch('https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot',{signal:AbortSignal.timeout(25000)});assert(r.ok);const j=await r.json();assert(j.cacheOnly===true&&Number(j.externalRequestsAdded)===0&&Array.isArray(j.fixtures));
const now=Date.now();const u=j.fixtures.filter(f=>f.boardState==='scheduled'&&f.kickoffAt>now&&f.league?.id);console.log('PLAN_SCOPE',JSON.stringify({sourceRows:j.fixtures.length,finished:j.fixtures.filter(f=>f.boardState==='finished').length,upcoming:u.length,leagues:new Set(u.map(f=>f.league.id)).size,teams:new Set(u.flatMap(f=>[f.home?.id,f.away?.id])).size,cacheOnly:true}));
const health=await fetch('https://ball46-prematch-history-real-test-20261120.mccarey-supon.workers.dev/health',{signal:AbortSignal.timeout(15000)});console.log('HISTORY_HEALTH',health.status,await health.text());
