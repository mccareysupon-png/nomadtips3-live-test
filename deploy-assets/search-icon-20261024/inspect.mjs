import{mkdir,writeFile}from'node:fs/promises';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;const root='https://api.cloudflare.com/client/v4/accounts/'+A;
async function cf(p){const r=await fetch(root+p,{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(45000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+r.status);return j.result}
const w='ball46-production',d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0],id=d.versions.find(x=>x.percentage===100)?.version_id;
const v=await cf('/workers/workers/'+w+'/versions/'+id+'?include=modules'),main=v.modules.find(x=>x.name===v.main_module),s=Buffer.from(main.content_base64,'base64').toString();
const r=await fetch('https://ball46.com/?searchIconAudit='+Date.now(),{signal:AbortSignal.timeout(55000)}),h=await r.text();
const audit={active:id,mainLength:s.length,htmlLength:h.length,htmlStatus:r.status,occurrences:[]};
const toks=['Team or league','team or league','Search team','search-input','header-search','live-header-search','search-field','type="search"'];
for(const t of toks)for(const [name,str]of[['HTML',h],['WORKER',s]]){let i=-1,n=0;while((i=str.toLowerCase().indexOf(t.toLowerCase(),i+1))>=0&&n++<6)audit.occurrences.push({name,token:t,at:i,context:str.slice(Math.max(0,i-570),i+790)});}
await mkdir('audit',{recursive:true});await writeFile('audit/search.json',JSON.stringify(audit,null,2));
console.log('SEARCH_ICON_CONTEXT='+JSON.stringify(audit).slice(0,25000));
