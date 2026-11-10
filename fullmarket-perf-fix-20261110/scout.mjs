import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){
 const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
 const j=await r.json();assert(r.ok&&j.success===true,`CF_ERROR:${r.status}:${JSON.stringify(j.errors||j)}`);return j.result;
}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);
const vv=d.deployments?.[0]?.versions;assert(vv?.length===1&&Number(vv[0].percentage)===100,'PRODUCTION_NOT_SINGLE_ACTIVE_VERSION');
const active=vv[0].version_id;
const v=await api(`/workers/${SCRIPT}/versions/${active}?include=modules`);
console.log('ACTIVE_VERSION='+active);
console.log('MODULE_COUNT='+(v.modules||[]).length);
for(const m of v.modules||[]){
 const t=Buffer.from(m.content_base64||'','base64').toString('utf8');
 if(!t.includes('FULL MARKET · BOOKMAKERS')&&!t.includes('NOMAD343_FULL_MARKET_BOOKMAKER'))continue;
 console.log('TARGET_MODULE='+m.name);
 console.log('TARGET_LEN='+t.length);
 for(const key of ['function extractBooks','function inspectFixture','function update(expanded,fixture)','function hydrate(expanded,fixture)','function chooseBook(button)','function start()']){
  const i=t.indexOf(key);if(i>=0)console.log('\n@@'+key+'@@\n'+t.slice(Math.max(0,i-2200),Math.min(t.length,i+9000)));
 }
}
