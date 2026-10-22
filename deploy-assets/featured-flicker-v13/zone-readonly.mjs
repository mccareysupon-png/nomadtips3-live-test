const token=process.env.CLOUDFLARE_API_TOKEN,acct=process.env.CLOUDFLARE_ACCOUNT_ID;
const base='https://api.cloudflare.com/client/v4',H={Authorization:'Bearer '+token};
for(const path of ['/zones?name=ball46.com&per_page=5','/accounts/'+acct+'/workers/domains']){
 const r=await fetch(base+path,{headers:H}),j=await r.json();
 console.log('B46_V13_CF_READONLY_ZONE',JSON.stringify({path,status:r.status,success:j.success,errors:j.errors,
  zones:path.startsWith('/zones')?j.result?.map(z=>({id:z.id,name:z.name,status:z.status,type:z.type})):undefined,
  domains:path.includes('/domains')?j.result?.filter(d=>/ball46.com/.test(d.hostname)).map(d=>({hostname:d.hostname,service:d.service,zone_id:d.zone_id,environment:d.environment})):undefined}));
}
