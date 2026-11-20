import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(25000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const hub='nomadtips3-5usd-hub-343',active=(await cf('/scripts/'+hub+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await cf('/workers/'+hub+'/versions/'+active+'?include=modules');
for(const m of v.modules.filter(m=>m.content_base64)){
 const s=Buffer.from(m.content_base64,'base64').toString();
 if(!['index-viewer-safe.js','speed-policy.mjs'].includes(m.name))continue;
 let lines=s.split('\n');
 let sections=m.name==='index-viewer-safe.js'?[[170,240],[545,730],[760,850],[850,940]]:[[1,110]];
 for(const [a,b] of sections){let content=lines.slice(a-1,b).join('\n').replace(/(?:api[_-]?key|secret|token|authorization|bearer|password)\s*[:=]\s*["'][^"']+["']/gi,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{90,}/g,'[REDACTED]');console.log('SOURCE_PART '+JSON.stringify({module:m.name,from:a,to:b,content}));}
}
console.log('ACTIVE_HUB',active);
