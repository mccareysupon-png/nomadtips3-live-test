import assert from 'node:assert/strict';
const SCRIPT='ball46-production',GOOD='a9025e59-1028-4502-bcc0-6cb062a87ac4';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const v=await api('/workers/'+SCRIPT+'/versions/'+GOOD+'?include=modules');
const m=v.modules.find(x=>x.name==='index.js');assert(m);const s=Buffer.from(m.content_base64,'base64').toString('utf8');
for(const key of ['function __b46InjectFooter','async function __b46InjectFooter','__b46InjectFooter =','const __b46InjectFooter']){
 const i=s.indexOf(key);console.log('KEY='+key+' POS='+i);if(i>=0)console.log(s.slice(Math.max(0,i-2500),Math.min(s.length,i+7000)));
}
