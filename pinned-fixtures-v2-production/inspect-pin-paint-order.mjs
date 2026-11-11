import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');const id=d.deployments?.[0]?.versions?.[0]?.version_id;
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');const m=v.modules.find(x=>x.name==='screen-refresh-5s-20261104.txt');const s=Buffer.from(m.content_base64,'base64').toString('utf8');
for(const key of ['b46PinPaint(','querySelectorAll','innerHTML=html.join','board.innerHTML','b46PinRender','function renderBoard','function render(','requestAnimationFrame','setTimeout(','MutationObserver']){
 let from=0,n=0;while((from=s.indexOf(key,from))>=0&&n<30){console.log('\n@@ '+key+' @'+from+' #'+n+'\n'+s.slice(Math.max(0,from-1400),Math.min(s.length,from+2600)));from+=key.length;n++}
}
