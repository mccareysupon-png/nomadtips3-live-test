import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
for(const [name,mods] of [['ball46-form-history-v1',['history-store.mjs']],['ball46-production',['b46-last5-browser.mjs']],['nomadtips3-5usd-hub-343',['speed-policy.mjs']]]){
const a=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await cf('/workers/'+name+'/versions/'+a+'?include=modules');
for(const m of v.modules.filter(m=>mods.includes(m.name))){const s=Buffer.from(m.content_base64,'base64').toString();
const safe=s.replace(/(?:fb_live_|fb_test_)[A-Za-z0-9_-]+/g,'[REDACTED]').replace(/(authorization\s*:\s*)[^,\n]+/gi,'$1[REDACTED]').replace(/[A-Za-z0-9+/_-]{100,}/g,'[REDACTED]');
console.log('FORM_SOURCE '+JSON.stringify({name,module:m.name,source:safe.slice(0,28000)}))}
}
