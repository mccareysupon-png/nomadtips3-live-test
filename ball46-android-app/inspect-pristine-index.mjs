import assert from 'node:assert/strict';
const SCRIPT='ball46-production',GOOD='a9025e59-1028-4502-bcc0-6cb062a87ac4';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const v=await api('/workers/'+SCRIPT+'/versions/'+GOOD+'?include=modules');
const m=v.modules.find(x=>x.name==='index.js');assert(m);const s=Buffer.from(m.content_base64,'base64').toString('utf8');
let from=0,n=0;while((from=s.indexOf('__b46V13PristineIndex',from))>=0&&n<50){console.log('\n@@ USE '+n+' @'+from+'\n'+s.slice(Math.max(0,from-1800),Math.min(s.length,from+5200)));from+='__b46V13PristineIndex'.length;n++}
