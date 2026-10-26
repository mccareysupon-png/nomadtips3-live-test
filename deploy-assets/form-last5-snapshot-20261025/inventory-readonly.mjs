import {mkdir,writeFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={mode:'READ_ONLY',at:new Date().toISOString(),productionWrites:0,providerRequests:0,workers:[],gaps:[]};
const allowed=new Set(['ball46-production','ball46-form-history-v1','nomadtips3-5usd-hub-343','nomadtips3-engine-343']);
async function cf(worker,suffix){
 if(!allowed.has(worker)||!/^\/(deployments\?per_page=1|settings|schedules|versions\/[a-z0-9-]+\?include=modules)$/.test(suffix))throw Error('READ_PATH_DENIED');
 const version=suffix.startsWith('/versions/');
 const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/'+(version?'workers/':'scripts/')+worker;
 const r=await fetch(root+suffix,{method:'GET',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(45000)});
 let j;try{j=await r.json();}catch{throw Error('CF_NON_JSON_'+r.status);}
 if(!r.ok||!j.success)throw Error('CF_READ_'+r.status);
 return j.result;
}
await mkdir('audit',{recursive:true});
try{
 if(!/^[a-f0-9]{32}$/.test(account||'')||!token)throw Error('CF_CREDENTIALS_UNAVAILABLE');
 for(const worker of allowed){
  const row={worker};report.workers.push(row);
  try{
   const ds=await cf(worker,'/deployments?per_page=1'),d=ds.deployments?.[0];
   row.deployment=d?.id;row.versions=d?.versions;
   const settings=await cf(worker,'/settings');
   row.bindings=(settings.bindings||[]).map(b=>({name:b.name,type:b.type,service:b.service,class_name:b.class_name}));
   try{row.schedules=await cf(worker,'/schedules');}catch(e){row.scheduleError=e.message;}
   if(d?.versions?.length===1&&d.versions[0].percentage===100){
    try{
     const v=await cf(worker,'/versions/'+d.versions[0].version_id+'?include=modules');
     row.modules=(v.modules||[]).map(m=>{
      const text=Buffer.from(m.content_base64||'','base64').toString();
      return {name:m.name,bytes:Buffer.byteLength(text),signals:{
       durableStorage:/storage\.(get|put|sql|list)/.test(text),
       finishedHistory:/finished|finalScore|final_score/.test(text),
       historyCache:/team:|normalizeHistory/.test(text),
       scheduled:/scheduled\s*\(|async\s+alarm\s*\(/.test(text),
       liveBulk:/status=live|status:.*live/.test(text),
       retryAfter:/retry-after/i.test(text),
       sharedBudget:/X-RateLimit-Remaining|x-ratelimit-remaining/.test(text)
      }};
     });
    }catch(e){row.moduleError=e.message;}
   }
  }catch(e){row.error=e.message;report.gaps.push(worker+':'+e.message);}
 }
 const r=await fetch('https://ball46.com/api/engine/board',{method:'GET',signal:AbortSignal.timeout(45000)});
 const b=await r.json();report.board={status:r.status,ok:b.ok,stale:b.stale,fixtures:b.fixtures?.length,withTeamIds:b.fixtures?.filter(f=>f.home?.id&&f.away?.id&&f.kickoffUtc).length};
 report.gaps.push('Durable FT row coverage and shared account consumption are not established by code inventory.');
 report.ok=report.workers.every(w=>!w.error)&&r.ok&&b.ok===true&&b.stale!==true;
}catch(e){report.ok=false;report.error=e.message;}
await writeFile('audit/inventory.json',JSON.stringify(report,null,2));
console.log('LAST5_READ_ONLY_INVENTORY='+JSON.stringify(report));
if(!report.ok)process.exitCode=1;
