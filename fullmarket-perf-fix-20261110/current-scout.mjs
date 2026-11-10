import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,`CF:${r.status}`);return j.result}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=5`);
const vv=d.deployments?.[0]?.versions;assert(vv?.length===1&&Number(vv[0].percentage)===100,'ACTIVE_BAD');
const id=vv[0].version_id,v=await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);
console.log('ACTIVE_VERSION='+id);
for(const m of v.modules||[]){
 const t=Buffer.from(m.content_base64||'','base64').toString('utf8');
 const keys=['NOMAD343_FULL_MARKET_BOOKMAKER','FULL MARKET · BOOKMAKERS','marketTable(','renderBookHtml(','inspectFixture(','data-full-market-card','fmb-panel','BULK_SNAPSHOT_ONLY'];
 const found=keys.filter(k=>t.includes(k));
 if(!found.length)continue;
 console.log('MODULE='+m.name);
 console.log('FOUND='+found.join('|'));
 for(const k of found){
   const i=t.indexOf(k);
   console.log('KEY='+k);
   console.log('CTX='+t.slice(Math.max(0,i-1800),Math.min(t.length,i+7000)).replace(/\n/g,'\\n'));
 }
}
