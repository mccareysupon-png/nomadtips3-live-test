import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_SECRETS_MISSING');
const name='ball46-prematch-only-test-20261120';
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function cf(path){
const r=await fetch(root+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(38000)});
const j=await r.json();assert(r.ok&&j.success,path+'_'+r.status);
return j.result;
}
const v=(await cf('/scripts/'+name+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const full=await cf('/workers/'+name+'/versions/'+v+'?include=modules');
const map=Object.fromEntries(full.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
const entry=map[full.main_module];
const sched=await cf('/scripts/'+name+'/schedules');
const idx=entry.lastIndexOf('export default ');
console.log('B46_CURRENT_1X2_SCHED '+JSON.stringify({version:v,cron:sched.schedules?.map(x=>x.cron),scheduledCode:entry.slice(idx,idx+7000)}).slice(0,9000));
for(const term of ["if(path==='/bot-run'","if(path==='/daily-mission'","async runDailyMission(now)","async scheduled","/prematch-ou-engine-tick","/bot-run","HISTORY_DELIVERED_BOT_READY"]){
 const parts=[];let p=-1;while((p=entry.indexOf(term,p+1))>=0&&parts.length<3){
 parts.push(entry.slice(Math.max(0,p-400),p+1100));
 }
 console.log('B46_CURRENT_1X2_POINT '+JSON.stringify({term,found:parts.length,parts}).slice(0,6500));
}
console.log('B46_CURRENT_1X2_MODULES '+JSON.stringify({version:v,main:full.main_module,moduleCount:full.modules.length}));
