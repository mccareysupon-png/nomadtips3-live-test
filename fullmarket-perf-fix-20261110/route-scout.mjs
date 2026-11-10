import assert from 'node:assert/strict';
const SCRIPT='ball46-production',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`}});const j=await r.json();assert(r.ok&&j.success);return j.result}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=2`),id=d.deployments[0].versions[0].version_id,v=await api(`/workers/${SCRIPT}/versions/${id}?include=modules`);
console.log('ACTIVE='+id);
const m=v.modules.find(x=>x.name===v.main_module)||v.modules.find(x=>x.name==='index.js');assert(m,'MAIN_MISSING');
const t=Buffer.from(m.content_base64,'base64').toString('utf8');
for(const key of ['export default','async fetch(','fetch(request','env.ASSETS','ASSETS.fetch','new URL(request.url)','pathname','full-market-bookmaker-343.js','PAGES','STATIC']){
 const all=[];let p=0;
 while(true){const i=t.indexOf(key,p);if(i<0)break;all.push(i);p=i+key.length;if(all.length>=10)break}
 console.log('KEY='+key+' COUNT='+all.length);
 for(const i of all)console.log('CTX='+t.slice(Math.max(0,i-2500),Math.min(t.length,i+key.length+7000)).replace(/\n/g,'\\n'));
}
