// Correlate live active Worker event handlers against registered Cron schedules.
// Authorized read-only Cloudflare metadata; never output binding values or secrets.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('missing audit credentials');
const names=['nomadtips3-full-market-343-ball46','ball46-member-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343'];
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
async function get(path){
 try{
  const r=await fetch(endpoint+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(18000)});
  const j=await r.json().catch(()=>({}));return {ok:r.ok&&j.success===true,status:r.status,data:j.result};
 }catch{return {ok:false,status:0};}
}
const rows=[];
for(const name of names){
 const path='/workers/scripts/'+encodeURIComponent(name);
 const [d,c]=await Promise.all([get(path+'/deployments?per_page=1'),get(path+'/schedules')]);
 const deploy=(Array.isArray(d.data)?d.data:d.data?.deployments||[])[0];
 const live=deploy?.versions?.filter(v=>Number(v.percentage)>0)||[];
 const cron=(Array.isArray(c.data)?c.data:c.data?.schedules||[]).map(x=>x.cron);
 const versions=[];
 for(const v of live){
  const r=await get(path+'/versions/'+encodeURIComponent(v.version_id));
  const obj=r.data?.resources?.script||{};
  const handlers=obj.handlers||[];
  versions.push({version:v.version_id,trafficPercent:Number(v.percentage),ok:r.ok,handlerReadStatus:r.status,eventHandlers:handlers,
   scheduledSupported:handlers.includes('scheduled'),namedObjectClasses:(obj.named_handlers||[]).map(x=>x.name).slice(0,12)});
 }
 rows.push({name,cron,active:versions,hasScheduledCron:cron.length>0,missingTopLevelScheduledHandler:cron.length>0&&versions.length>0&&versions.every(v=>v.ok&&!v.scheduledSupported)});
}
console.log('BALL46_CRON_HANDLER_CONTRACT='+JSON.stringify({atUtc:new Date().toISOString(),readOnly:true,workers:rows}));
