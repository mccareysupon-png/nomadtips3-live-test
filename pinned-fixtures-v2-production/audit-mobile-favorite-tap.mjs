import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const id=d.deployments?.[0]?.versions?.[0]?.version_id;console.log('ACTIVE='+id);
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
for(const name of ['screen-refresh-5s-20261104.txt','assets/index.html']){
 const m=v.modules.find(x=>x.name===name);if(!m)continue;const s=Buffer.from(m.content_base64,'base64').toString('utf8');
 for(const key of ['b46-pin-v2-star','pointer-events','touch-action','@media(max-width:760px)','@media (max-width:760px)','B46_PIN_V2_MOBILE_TAP_GREEN_20261112','b46PinToggle(id,s)','addEventListener(\'click\'']){
  let from=0,n=0;while((from=s.indexOf(key,from))>=0&&n<20){console.log('\n@@ '+name+' :: '+key+' @'+from+'\n'+s.slice(Math.max(0,from-1200),Math.min(s.length,from+2600)));from+=key.length;n++}
 }
}
