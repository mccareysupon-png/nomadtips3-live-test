import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){
 const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result;
}
const dep=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const av=dep.deployments?.[0]?.versions;assert(av?.length===1&&Number(av[0].percentage)===100,'ACTIVE_NOT_SINGLE');
const id=av[0].version_id;
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
console.log('ACTIVE='+id);
for(const name of ['screen-refresh-5s-20261104.txt','index.js']){
 const m=v.modules.find(x=>x.name===name);if(!m)continue;
 const t=Buffer.from(m.content_base64,'base64').toString('utf8');
 const terms=['signalCount','signal-count','signal-badge','signalBadge','data-signal','signal-pill','signalsMap','loadSignals','signalRows','signal'];
 for(const term of terms){
   let from=0,n=0;
   while((from=t.indexOf(term,from))>=0&&n<20){
     console.log('CTX='+JSON.stringify({name,term,n,context:t.slice(Math.max(0,from-650),Math.min(t.length,from+1800))}));
     from+=term.length;n++;
   }
 }
}
