import assert from 'node:assert/strict';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',token=process.env.CLOUDFLARE_API_TOKEN;
async function cf(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(40000)}),j=await r.json();assert(r.ok&&j.success,'CF_READ '+r.status);return j.result}
const names=['nomadtips3-5usd-hub-343','nomadtips3-engine-343','ball46-production'];
for(const n of names){
 const d=(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions;const v=await cf('/workers/'+n+'/versions/'+d[0].version_id+'?include=modules');
 const main=v.modules.find(m=>m.name===v.main_module)||v.modules[0];const src=Buffer.from(main.content_base64,'base64').toString();
 console.log('ACTIVE',JSON.stringify({n,d,main:main.name,length:src.length}));
 if(n==='ball46-production')continue;
 const clean=s=>s.replace(/(?:api[_-]?key|secret|token|authorization|bearer|password)\s*[:=]\s*["'][^"']+["']/gi,'[REDACTED]').replace(/[A-Za-z0-9+/_-]{90,}/g,'[REDACTED]');
 if(n.includes('hub')){
 const needles=['async fetch(','async refreshToday(','async refreshLive(','async refreshFinished(','async provider','async apiGet','async request','/snapshot','/health','/history','/finished','/bulk','/fixtures','status=finished','status: "finished"',"status: 'finished'",'async alarm','function normalize','has_more','Retry-After'];
 for(const k of needles){let i=src.indexOf(k);if(i>=0)console.log('HUB_SOURCE',JSON.stringify({k,chunk:clean(src.slice(Math.max(i-120,0),i+1700))}))}
 }else{
 for(const k of ['HUB.fetch','/snapshot','/board','finished','homeTeamId','awayTeamId','fixtureId']){let i=src.indexOf(k);if(i>=0)console.log('ENGINE_SOURCE',JSON.stringify({k,chunk:clean(src.slice(Math.max(i-100,0),i+700))}))}
 }
}
// Existing October cache audit verified /snapshot is cache-only. Read one snapshot and board only; no refresh call.
for(const [name,url] of [['hub','https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot'],['board','https://ball46.com/api/engine/board']]){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok){console.log('CACHE',JSON.stringify({name,status:r.status}));continue}
 const j=await r.json(),a=j.fixtures||j.rows||j.data||[];const counts={};if(Array.isArray(a))for(const f of a){const k=f.status||f.boardState;counts[k]=(counts[k]||0)+1}
 const sample=Array.isArray(a)?[a[0],a.find(f=>f.status==='finished'||f.boardState==='finished'),a.find(f=>f.status==='scheduled'||f.boardState==='scheduled')].filter(Boolean).map(f=>({keys:Object.keys(f),fields:Object.fromEntries(Object.entries(f).filter(([k])=>/^(id|fixtureId|fixture_id|league|leagueId|teams|home|away|homeTeamId|awayTeamId|homeId|awayId|kickoff|kickoff_ts|kickoffUtc|start_time|status|status_code|boardState|goals|score|scores|homeScore|awayScore|homeGoals|awayGoals)$/.test(k)))})):[];
 console.log('CACHE',JSON.stringify({name,status:r.status,keys:Object.keys(j),count:a.length,counts,sample}));
 }catch(e){console.log('CACHE_ERROR',name,String(e.message).slice(0,120))}
}
