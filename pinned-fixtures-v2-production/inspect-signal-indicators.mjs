import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result}
const dep=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const id=dep.deployments?.[0]?.versions?.[0]?.version_id;
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
const terms=['new-signal','new signal','signal-alert','signal-warning','has-signal','signal-dot','signal-badge','signal-indicator','signal-notice','signal-pulse','signal-glow','notification','notify','badge'];
for(const m of v.modules){let t='';try{t=Buffer.from(m.content_base64,'base64').toString('utf8')}catch{};for(const term of terms){let i=0,n=0;while((i=t.toLowerCase().indexOf(term.toLowerCase(),i))>=0&&n<12){console.log('HIT='+JSON.stringify({module:m.name,term,n,context:t.slice(Math.max(0,i-700),Math.min(t.length,i+1800))}));i+=term.length;n++}}}