const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN;
const w='nomadtips3-engine-343',r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acc+'/workers/scripts/'+w+'/deployments?per_page=3',{headers:{authorization:'Bearer '+tok},signal:AbortSignal.timeout(35000)});
const j=await r.json();const out={time:new Date().toISOString(),deployments:j.result?.deployments?.slice(0,3).map(d=>({id:d.id,versions:d.versions})),probes:[]};
for(const path of ['/api/engine/health','/api/engine/statistics?paged=1','/api/engine/signals','/api/engine/form5-health']){
 try{const response=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(45000)}),x=await response.text();let body;try{body=JSON.parse(x)}catch{}out.probes.push({path,status:response.status,ok:body?.ok,size:x.length,ledgerTotal:body?.ledgerTotal,total:body?.total,signals:body?.signals?.length,component:body?.component,model:body?.model,enabled:body?.enabled,error:body?.error});}catch(e){out.probes.push({path,error:String(e.message||e)})}
}
console.log('B46_FORM5_ROLLBACK_CHECK='+JSON.stringify(out));
