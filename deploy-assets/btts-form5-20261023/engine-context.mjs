import{mkdir,writeFile}from'node:fs/promises';
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acc+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)}),j=await r.json();if(!j.success)throw Error(JSON.stringify(j.errors).slice(0,160));return j.result}
const w='nomadtips3-engine-343';const id=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await cf('/workers/workers/'+w+'/versions/'+id+'?include=modules');
const src=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
const terms=['function statsFrom(','async scan()','async scanIfDue()','readWorkingSignals','async writeWorkingSignals','async syncStatisticsLedger','async statisticsLedgerResponse','class Nomad343Engine','class Nomad343Engine2','async getFixture','async reconcile','async reconcileFinal','async fetch(request)','STATS_LEDGER','var STAT_LEDGER','function settlement','async settle','async updateLedger','MARKET_RULES =','function mark','async load','function pickBestPriced'];
let matches=[];
for(const t of terms){let idx=-1,n=0;while((idx=src.indexOf(t,idx+1))!==-1&&n++<2){
let text=src.slice(Math.max(0,idx-300),Math.min(src.length,idx+3600));
text=text.replace(/(authorization:\s*)[^,}\n]{25,}/gi,'$1[REDACTED]').replace(/[A-Za-z0-9+/_-]{180,}/g,'[redacted]');
matches.push({term:t,at:idx,source:text.slice(0,3600)})}}
const obj={version:id,length:src.length,matches};
await mkdir('audit',{recursive:true});await writeFile('audit/engine-integration-context.json',JSON.stringify(obj,null,2));
for(const m of matches)console.log('B46_ENGINE_CONTEXT='+JSON.stringify({...m,source:m.source.slice(0,1900)}));
