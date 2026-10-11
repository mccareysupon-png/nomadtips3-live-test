const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN;
const base=`https://api.cloudflare.com/client/v4/accounts/${acc}/workers`;
const get=async p=>{const r=await fetch(base+p,{headers:{Authorization:`Bearer ${tok}`},signal:AbortSignal.timeout(30000)});let j=await r.json().catch(()=>null);return {http:r.status,j};};
for(const name of ["ball46-production","ball46","nomadtips3-343-auto-engine"]){
 const d=await get(`/scripts/${name}/deployments`);
 const versions=d.j?.result?.deployments?.[0]?.versions||[];
 console.log("SITE_SCRIPT_DEPLOYMENT",JSON.stringify({name,http:d.http,success:d.j?.success,active:versions,created:d.j?.result?.deployments?.[0]?.created_on}));
 const active=versions.find(x=>Number(x.percentage)===100);
 if(!active)continue;
 const response=await get(`/workers/${name}/versions/${active.version_id}?include=modules`);
 const v=response.j?.result,main=v?.modules?.find(x=>x.name===v.main_module),s=main?.content_base64?Buffer.from(main.content_base64,"base64").toString("utf8"):"";
 const rows=s.split("\n");
 const patterns=["/statistics.html","statistics.html","async fetch(request","fetch(request","new URL(request.url)","/index.html","export default"];
 const sections={};for(const pat of patterns){const idx=rows.findIndex(x=>x.includes(pat));sections[pat]=idx<0?null:{line:idx+1,excerpt:rows.slice(Math.max(0,idx-3),Math.min(rows.length,idx+4)).join("\n").slice(0,1800)};}
 console.log("SITE_ACTIVE_MODULE",JSON.stringify({name,version:active.version_id,bytes:s.length,main:v.main_module,moduleCount:v.modules.length,contentType:main?.content_type,sections}));
}
