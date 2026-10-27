// BALL46 / John — no-write audit of named Cloudflare Worker scripts.
// Security: only GET; never output tokens, binding values or script source.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Cloudflare read credentials unavailable');
const scriptNames=['ball46-production','nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46','nomadtips3-live-engine-5usd-shadow','nomadtips3-live-engine'];
const API=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
const safeError=(r,b)=>({status:r.status,codes:(b?.errors||[]).map(e=>e.code).filter(Number.isInteger).slice(0,4)});
async function read(path){
 const response=await fetch(API+path,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 const body=await response.json().catch(()=>null);
 return response.ok&&body?.success===true?{ok:true,result:body.result}:{ok:false,error:safeError(response,body)};
}
function deploymentSummary(raw){
 const rows=Array.isArray(raw)?raw:(raw?.deployments||[]);
 const first=rows[0];
 return {exists:Boolean(first),deploymentId:first?.id||null,createdOn:first?.created_on||null,active:(first?.versions||[]).filter(v=>Number(v.percentage)>0).map(v=>({versionId:v.version_id||null,percentage:Number(v.percentage)}))};
}
function scheduleSummary(raw){const rows=Array.isArray(raw)?raw:(raw?.schedules||[]);return {count:rows.length,crons:rows.map(x=>x.cron).filter(Boolean)}}
function settingsSummary(raw){return {bindings:(raw?.bindings||[]).map(v=>({name:String(v.name||''),type:String(v.type||'')})),compatibilityDate:raw?.compatibility_date||null}}
const results=[];
for(const name of scriptNames){
 const id=encodeURIComponent(name);
 const [deployments,schedules,settings]=await Promise.allSettled([
  read(`/workers/scripts/${id}/deployments?per_page=1`),
  read(`/workers/scripts/${id}/schedules`),
  read(`/workers/scripts/${id}/settings`),
 ]);
 const norm=(res,mapper)=>res.status==='fulfilled'?(res.value.ok?{ok:true,...mapper(res.value.result)}:{ok:false,...res.value.error}):{ok:false,error:'request_failed'};
 results.push({script:name,deployments:norm(deployments,deploymentSummary),schedules:norm(schedules,scheduleSummary),settings:norm(settings,settingsSummary)});
}
const out={type:'BALL46_JOHN_CLOUDFLARE_READONLY',asOfUtc:new Date().toISOString(),readOnly:true,requests:scriptNames.length*3,workers:results};
console.log('BALL46_READONLY_AUDIT='+JSON.stringify(out));
const {appendFile}=await import('node:fs/promises');
if(process.env.GITHUB_STEP_SUMMARY){
 let s='# BALL46 read-only Cloudflare inventory\n\nGenerated '+out.asOfUtc+'; no Cloudflare mutations.\n\n| Worker | Active version | Cron triggers | Settings |\n|---|---|---|---|\n';
 for(const w of results){
  const versions=w.deployments.active?.map(v=>`${v.versionId} (${v.percentage}%)`).join(', ')||'unverified';
  const crons=w.schedules.ok?(w.schedules.crons.join(', ')||'none'):'unavailable';
  s+=`| ${w.script} | ${versions} | ${crons} | ${w.settings.ok?'read':'unavailable'} |\n`;
 }
 s+='\nScope: six known workers only. Deployment metadata, cron triggers and binding names do not prove whether a Durable Object alarm is active or identify the source of a specific request without per-request logs.\n';
 await appendFile(process.env.GITHUB_STEP_SUMMARY,s);
}