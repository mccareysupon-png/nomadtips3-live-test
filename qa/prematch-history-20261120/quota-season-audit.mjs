import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const hub='nomadtips3-5usd-hub-343',active=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await cf('/workers/'+hub+'/versions/'+active+'?include=modules');
for(const m of v.modules.filter(m=>m.content_base64)){
 const src=Buffer.from(m.content_base64,'base64').toString();
 const lines=src.split('\n'); const indexes=lines.map((l,i)=>/function (providerJson|fetchJson|hubHealth|refreshRich)|async (refreshLive|refreshToday|before|observe)|season|providerJson\(|\.before\(|\.observe\(|rateLimit|quotaGate|fetchPages\(|EXTERNAL_REQUEST|fetch\((url|u\.|target)/i.test(l)?i:-1).filter(i=>i>=0);
 const excerpts=indexes.slice(0,100).map(i=>({line:i+1,code:lines.slice(Math.max(0,i-1),i+2).join('\n').slice(0,850).replace(/(?:api[_-]?key|secret|token|authorization|bearer|password)\s*[:=]\s*["'][^"']+["']/gi,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{90,}/g,'[REDACTED]')}));
 console.log('SOURCE_AUDIT',JSON.stringify({active,module:m.name,excerpts}));
}
const r=await fetch('https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot',{signal:AbortSignal.timeout(20000)});const j=await r.json();assert(r.ok&&j.cacheOnly===true&&j.externalRequestsAdded===0);
const u=j.fixtures.filter(f=>f.boardState==='scheduled'),ls=new Map();for(const f of u){const id=String(f.league?.id);if(!ls.has(id))ls.set(id,{id,fields:Object.keys(f.league??{}),season:f.league?.season??f.season??null})}
console.log('SCOPE_AUDIT',JSON.stringify({rootKeys:Object.keys(j),sampleFields:Object.keys(u[0]??{}),leagues:ls.size,withSeason:[...ls.values()].filter(x=>x.season!==null).length,sample:[...ls.values()].slice(0,3),cacheOnly:true}));
