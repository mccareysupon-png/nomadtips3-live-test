import assert from 'node:assert/strict';
const SCRIPT='nomadtips3-live-web-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR '+r.status);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const active=d.deployments?.[0]?.versions?.[0]?.version_id;console.log('ACTIVE='+active);
const v=await api('/workers/'+SCRIPT+'/versions/'+active+'?include=modules');
console.log('MODULES='+v.modules.length);
for(const m of v.modules){
 const s=Buffer.from(m.content_base64||'', 'base64').toString('utf8');
 if(/REAL WIN RATE|LIVE FOOTBALL INTELLIGENCE|ball46-promo|ball46-top-promo|ball46-top-banner\.webp|ball46\.com/i.test(s)){
  console.log('\nMODULE='+m.name+' LEN='+s.length);
  for(const key of ['REAL WIN RATE','LIVE FOOTBALL INTELLIGENCE','ball46-promo','ball46-top-promo','ball46-top-banner.webp','ball46.com']){
   let p=0,n=0;while((p=s.indexOf(key,p))>=0&&n<20){console.log('@@ '+key+' @'+p+' '+JSON.stringify(s.slice(Math.max(0,p-500),Math.min(s.length,p+1600))));p+=key.length;n++}
  }
 }
}
