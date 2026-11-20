import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(20000)});const j=await r.json();return {status:r.status,result:j.result,errors:j.errors?.map(x=>x.code)}}
const hub='nomadtips3-5usd-hub-343',ids=['f434025a-e092-4bf0-844f-6f1e01ad7173','fca90efa-30bf-42fa-a2d3-8b14c1100457','7dbb76df-d2bd-46e3-a729-a9cdfb207215'];
for(const id of ids){const r=await cf('/workers/'+hub+'/versions/'+id+'?include=modules');const v=r.result;if(!v){console.log('BINDING_INSPECT',JSON.stringify({id,status:r.status,errors:r.errors}));continue}
const shape=x=>Array.isArray(x)?x.map(b=>({name:b.name,type:b.type,fields:Object.keys(b),service:b.type==='service'?b.service:undefined})):x&&typeof x==='object'?Object.entries(x).map(([name,b])=>({name,type:b?.type,fields:Object.keys(b??{})})):null;
console.log('BINDING_INSPECT',JSON.stringify({id,status:r.status,actualId:v.id,keys:Object.keys(v),bindings:shape(v.bindings),env:shape(v.env),resources:shape(v.resources?.bindings),modules:v.modules?.map(m=>m.name)}))}
for(const n of ['ball46-production','nomadtips3-engine-343','nomadtips3-full-market-343-ball46',hub]){const d=await cf('/scripts/'+n+'/deployments?per_page=1');console.log('ACTIVE_CHECK',JSON.stringify({name:n,active:d.result?.deployments?.[0]?.versions}))}
