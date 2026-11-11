import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const dep=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const id=dep.deployments?.[0]?.versions?.[0]?.version_id;
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
const m=v.modules.find(x=>x.name==='index.js');const t=Buffer.from(m.content_base64,'base64').toString('utf8');
for(const term of ['b46-league-market-signal-count','b46-league-market-js-20261023']){const i=t.indexOf(term);console.log('TERM='+term+' '+JSON.stringify(t.slice(Math.max(0,i-5000),Math.min(t.length,i+6500))))}