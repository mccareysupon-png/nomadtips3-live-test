import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production', target='ad5a7a11-0218-4072-8baf-8f060cae64ce';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
async function active(){const d=await api(`/scripts/${script}/deployments`);return d.deployments[0].versions[0].version_id}
const before=await active();
assert(['e05bab62-6251-4971-aed2-c064676e9864',target].includes(before),'FOREIGN_ACTIVE');
await api(`/workers/${script}/versions/${target}?include=modules`);
if(before!==target)await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:target,percentage:100}]})});
for(let i=0;i<20&&await active()!==target;i++)await new Promise(r=>setTimeout(r,1500));
assert.equal(await active(),target);
console.log('BALL46_STATSV2_FIXED_ACTIVE',JSON.stringify({before,active:target}));
