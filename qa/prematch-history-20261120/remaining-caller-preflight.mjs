import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});const j=await r.json();assert(r.ok&&j.success);return j.result}
const names=['nomadtips3-full-market-343-ball46','nomadtips3-341-5usd-staged','nomadtips3-live-engine-5usd-shadow'];
for(const n of names){
 const id=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const v=await cf('/workers/'+n+'/versions/'+id+'?include=modules');
 const m=v.modules.find(m=>m.name===v.main_module);const src=Buffer.from(m.content_base64,'base64').toString();
 const lines=src.split('\n');const selections=[];
 const re=n===names[0]?/async (?:health|prewarm|scheduled|fetch)\(|pathname.*(?:health|prewarm)|(?:path|pathname).*\/health|providerRequest\(/:n===names[1]?/function permission\(|NOMAD341_LIVE_PROVIDER_ENABLED|pathname.*(?:\/health|\/status)|async scheduled\(/:/FIVEUSD_NATIVE_MODE|async alarm\(|pathname.*(?:\/health|\/fiveusd-native)/;
 for(let i=0;i<lines.length;i++)if(re.test(lines[i]))selections.push({line:i+1,code:lines.slice(Math.max(0,i-1),i+11).join('\n').slice(0,1600).replace(/(?:authorization|api[_-]?key|token|password|secret)\s*:\s*[^,\n]+/gi,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{90,}/g,'[REDACTED]')});
 const flags=v.bindings.filter(b=>/^(?:NOMAD341_LIVE_PROVIDER_ENABLED|FIVEUSD_NATIVE_MODE|FIVEUSD_SHADOW_LEGACY_DISABLED|ENGINE_CYCLE_MODE)$/.test(b.name)&&b.type==='plain_text').map(b=>({name:b.name,value:/^[a-zA-Z0-9_-]{1,30}$/.test(b.text)?b.text:'other'}));
 console.log('NEXT_CALLER_PREFLIGHT',JSON.stringify({name:n,id,flags,selections:selections.slice(0,18)}))
}
