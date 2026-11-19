import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status);return j.result}
for(const name of ['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-member-production']){
 try{
 const dep=(await api('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const v=await api('/workers/'+name+'/versions/'+dep+'?include=modules');
 const settings=await api('/scripts/'+name+'/settings');
 console.log('WORKER_META '+JSON.stringify({name,dep,main:v.main_module,serviceBindings:(v.bindings||[]).filter(b=>b.type==='service').map(b=>({name:b.name,service:b.service})),moduleCount:v.modules.length,hasCron:(await api('/scripts/'+name+'/schedules')).length>0}));
 const found=[];
 for(const m of v.modules){if(!/\.(?:m?js|html|txt)$/.test(m.name))continue;const src=Buffer.from(m.content_base64,'base64').toString();
 const hosts=[...new Set([...src.matchAll(/https?:\/\/(?:[a-zA-Z0-9._-]+)(?=[:/\s"'\\x60]|$)/g)].map(x=>x[0]))].filter(x=>/engine|worker|nomad|ball46/i.test(x));
 const paths=[...new Set([...src.matchAll(/["'](\/[a-zA-Z0-9._/-]*(?:settings|scan|config|rules)[a-zA-Z0-9._/-]*)["']/g)].map(x=>x[1]))].filter(x=>x.length<120);
 if(hosts.length||paths.length)found.push({module:m.name,hosts,paths});
 }
 console.log('ROUTE_AND_HOST_REFERENCES '+JSON.stringify({name,found:found.slice(0,80)}));
 }catch(e){console.log('WORKER_AUDIT_ERROR '+JSON.stringify({name,error:String(e)}))}
}
