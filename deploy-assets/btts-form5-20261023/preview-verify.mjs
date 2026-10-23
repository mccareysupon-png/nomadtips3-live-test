import{mkdir,writeFile}from'node:fs/promises';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,w='nomadtips3-engine-343',candidate='e7c66b7b-ba60-497a-831c-193c0e93cad0',base='1f2336fa-7b45-4a23-a23c-06d01a92330d';
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+p,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(40000)}),j=await r.json();if(!j.success)throw Error('CF'+r.status);return j.result}
const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0],active=d.versions.find(v=>v.percentage===100)?.version_id;
const r={time:new Date().toISOString(),candidate,active,unchanged:active===base,checks:[]};
for(const host of ['https://e7c66b7b-nomadtips3-engine-343.mccarey-supon.workers.dev','https://nomadtips3-engine-343.mccarey-supon.workers.dev']){
 for(const path of ['/form5-health','/health']){
  try{const a=await fetch(host+path,{method:'GET',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(20000)}),txt=await a.text();
   let json;try{json=JSON.parse(txt)}catch{};
   r.checks.push({host,path,status:a.status,type:a.headers.get('content-type'),length:txt.length,ok:json?.ok,component:json?.component,enabled:json?.enabled,mode:json?.operationalMode,body:txt.slice(0,130)});
  }catch(e){r.checks.push({host,path,error:String(e.message||e)})}
 }
}
await mkdir('audit',{recursive:true});await writeFile('audit/candidate-preview-status.json',JSON.stringify(r,null,2));
console.log('B46_FORM5_PREVIEW='+JSON.stringify(r));
