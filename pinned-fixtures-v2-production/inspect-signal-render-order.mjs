import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const id=d.deployments?.[0]?.versions?.[0]?.version_id;console.log('ACTIVE='+id);
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
for(const name of ['screen-refresh-5s-20261104.txt','assets/index.html']){
 const m=v.modules.find(x=>x.name===name); if(!m)continue;
 const s=Buffer.from(m.content_base64,'base64').toString('utf8');
 for(const key of ['function b46PinSignalBadge','function b46PinPaint','function render','data-inline-signal-count','league-head','pinned.map(rowHtml)','b46-league-market-signal-count']){
   let from=0,n=0;
   while((from=s.indexOf(key,from))>=0 && n<12){
     console.log('\n### '+name+' :: '+key+' @'+from+' #'+n);
     console.log(s.slice(Math.max(0,from-900),Math.min(s.length,from+1800)));
     from+=key.length;n++;
   }
 }
}
