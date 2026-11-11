import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR:'+r.status+':'+JSON.stringify(j.errors||j));return j.result}
const dep=await api('/scripts/'+SCRIPT+'/deployments?per_page=5');
const id=dep.deployments?.[0]?.versions?.[0]?.version_id;assert(id,'NO_ACTIVE');
const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
const m=v.modules.find(x=>x.name==='screen-refresh-5s-20261104.txt');assert(m,'DASH_MODULE_MISSING');
const t=Buffer.from(m.content_base64,'base64').toString('utf8');
function chunk(name){const i=t.indexOf('function '+name+'(');if(i<0)return null;const n=t.indexOf('\nfunction ',i+10);return t.slice(i,n<0?Math.min(t.length,i+9000):n)}
for(const name of ['visibleSignalsFor','rowHtml','renderBoard','syncStableMatchRow','inlineSignalsHtml','inlineSignalHtml'])console.log('FUNCTION='+name+' '+JSON.stringify(chunk(name)));