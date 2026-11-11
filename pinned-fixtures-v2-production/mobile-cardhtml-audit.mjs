import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const id=d.deployments?.[0]?.versions?.[0]?.version_id;
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
const m=v.modules.find(x=>x.name==='assets/index.html');const html=Buffer.from(m.content_base64,'base64').toString('utf8');
const i=html.indexOf('function cardHtml(f)');
assert(i>=0);
console.log('ACTIVE='+id);
console.log('CARDHTML='+JSON.stringify(html.slice(i,i+5200)));
