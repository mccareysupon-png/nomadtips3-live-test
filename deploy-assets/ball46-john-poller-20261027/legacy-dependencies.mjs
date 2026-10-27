// Audit extra legacy and member Workers via Cloudflare GET-only metadata.
const a=process.env.CLOUDFLARE_ACCOUNT_ID,t=process.env.CLOUDFLARE_API_TOKEN;
if(!a||!t)throw Error('Audit credentials missing');
const base='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(a);
async function get(path){try{const r=await fetch(base+path,{method:'GET',headers:{Authorization:'Bearer '+t},signal:AbortSignal.timeout(15000)});const j=await r.json().catch(()=>({}));return {ok:r.ok&&j.success===true,value:j.result||null,http:r.status};}catch{return {ok:false,http:0}}}
const names=['nomadtips3-live-engine-5dollar','nomadtips3-live-engine-test','nomadtips3-341-5usd-staged','nomadtips3-live-web-production','ball46-member-production','nomadtips3-rich-odds-343','nomadtips3-343-auto-engine','nomadtips3-test-api'];
const records=[];
for(const name of names){
 const p='/workers/scripts/'+encodeURIComponent(name);
 const [deploy,settings,cron]=await Promise.all([get(p+'/deployments?per_page=1'),get(p+'/settings'),get(p+'/schedules')]);
 const arr=Array.isArray(deploy.value)?deploy.value:(deploy.value?.deployments||[]);
 const v=arr[0]||{};
 const binds=settings.value?.bindings||[];
 records.push({name,activeVersions:(v.versions||[]).filter(x=>Number(x.percentage)>0).map(x=>({version:x.version_id,pct:Number(x.percentage)})),deployedAt:v.created_on||null,
  bindingNames:binds.filter(x=>x.type==='secret_text'&&/FIVEDOLLAR|5USD/i.test(x.name)).map(x=>x.name),
  serviceDependencies:binds.filter(x=>x.type==='service').map(x=>({name:x.name,service:x.service})),
  hasDO:binds.some(x=>x.type==='durable_object_namespace'),
  cron:(Array.isArray(cron.value)?cron.value:(cron.value?.schedules||[])).map(x=>x.cron),errorCount:[deploy,settings,cron].filter(x=>!x.ok).length});
}
console.log('BALL46_LEGACY_DEPENDENCIES='+JSON.stringify({asOfUtc:new Date().toISOString(),readOnly:true,workers:records}));
