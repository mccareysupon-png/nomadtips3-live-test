import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();assert(r.ok&&j.success);return j.result}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=2`),id=d.deployments[0].versions[0].version_id,v=await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);
console.log('ACTIVE='+id);
for(const m of v.modules||[]){
 const t=Buffer.from(m.content_base64||'','base64').toString('utf8');
 for(const key of ['const BOOKS=[','function marketTable(','function render','fmb-market','content-visibility: auto','renderWorkspaceScorebar','getBoundingClientRect','scrollWidth','MutationObserver(schedule).observe(board','full-market-bookmaker-343.js']){
  const i=t.indexOf(key); if(i<0)continue;
  console.log('\n### '+m.name+' :: '+key+' ###');
  console.log(t.slice(Math.max(0,i-2500),Math.min(t.length,i+key.length+7500)));
 }
}
try{
 const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?audit='+Date.now(),{headers:{'cache-control':'no-cache'}});
 const t=await r.text();
 console.log('\nPUBLIC_FULLMARKET status='+r.status+' len='+t.length);
 for(const key of ['const BOOKS=[','function marketTable(','function render','function build','setInterval','MutationObserver','requestAnimationFrame','innerHTML','replaceChildren']){
  const i=t.indexOf(key);if(i>=0){console.log('\nPUBLIC '+key);console.log(t.slice(Math.max(0,i-1800),Math.min(t.length,i+key.length+5000)))}
 }
}catch(e){console.log('PUBLIC_ERR='+e.message)}
