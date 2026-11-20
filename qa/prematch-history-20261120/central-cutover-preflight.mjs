import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(25000)});const j=await r.json();assert(r.ok&&j.success,'CF '+r.status+' '+p);return j.result}
const names=['nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46'];
for(const n of names){
 const ver=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
 const v=await cf('/workers/'+n+'/versions/'+ver+'?include=modules');
 const b=v.resources?.bindings??v.bindings??[];
 const settings=await cf('/scripts/'+n+'/settings').catch(()=>({}));
 // Do not log any credential values or literal source lines with secrets.
 console.log('CUTOVER_CONFIG '+JSON.stringify({name:n,version:ver,main:v.main_module,versionKeys:Object.keys(v),resourceKeys:Object.keys(v.resources??{}),settingsKeys:Object.keys(settings),compatibility:v.runtime??{compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags},modules:v.modules?.map(m=>({name:m.name,type:m.content_type,keys:Object.keys(m).filter(k=>k!=='content_base64')})),bindings:b.map(x=>({name:x.name,type:x.type,service:x.type==='service'?x.service:undefined})),settingsBindings:settings.bindings?.map(x=>({name:x.name,type:x.type})),limits:settings.limits,usage_model:settings.usage_model}));
 for(const m of v.modules??[]){if(!m.content_base64||!m.name.endsWith('.js'))continue;const src=Buffer.from(m.content_base64,'base64').toString();
 if(n.includes('full-market')){const names=src.match(/(?:var|const|let) BOOKMAKERS\s*=\s*\[[\s\S]{0,1000}?\]/)?.[0];console.log('BOOKMAKERS '+JSON.stringify(names?.match(/["'][a-zA-Z0-9_-]+["']/g)??[]))}
 const fn=n.includes('engine')?'fetchVerifiedCornerOnly':n.includes('full-market')?'providerRequest':'fetchJson';
 const i=src.indexOf('async function '+fn+'(');
 if(i>=0){const exact=src.slice(i,src.indexOf('\n}',i)+2).replace(/(?:authorization|api[_-]?key|secret|token|password)\s*:\s*[^,\n]+/gi,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{90,}/g,'[REDACTED]');console.log('TRANSPORT_SOURCE '+JSON.stringify({name:n,fn,code:exact.slice(0,4500)}))}
 }
}
