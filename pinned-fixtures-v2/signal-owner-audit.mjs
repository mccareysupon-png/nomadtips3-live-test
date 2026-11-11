import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const id=d.deployments?.[0]?.versions?.[0]?.version_id;assert(id);
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
console.log('ACTIVE='+id);
const needles=['b46-league-market-signal-count','function apply','MutationObserver','data-b46-market-compact'];
for(const m of v.modules){
  let t='';try{t=Buffer.from(m.content_base64,'base64').toString('utf8')}catch{}
  for(const needle of needles){
    let p=0,n=0;
    while((p=t.indexOf(needle,p))>=0&&n<12){
      console.log('HIT='+JSON.stringify({module:m.name,needle,n,context:t.slice(Math.max(0,p-900),Math.min(t.length,p+1800)).replace(/\s+/g,' ')}));
      p+=needle.length;n++;
    }
  }
}
