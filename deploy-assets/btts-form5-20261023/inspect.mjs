import {writeFile,mkdir} from'node:fs/promises';
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!acc||!token)throw Error('CLOUDFLARE_READ_CREDENTIALS_MISSING');
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acc+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(35000)}),j=await r.json();if(!r.ok||j.success!==true)throw Error('CF'+r.status);return j.result}
const out={at:new Date().toISOString(),workers:[],urlPaths:[],markets:{}};
for(const w of ['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343']){
 try{const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];const id=d.versions.find(x=>x.percentage===100)?.version_id||d.versions[0].version_id;
 const v=await cf('/workers/workers/'+w+'/versions/'+id+'?include=modules');
 const s=Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64').toString();
 const terms=w==='ball46-production'?['Settled Signal History','No settled results in this view','/api/engine/','statistics.html','statistics-v','statsPayload','stat-settled','history-table','settled-history','statsV2','function renderStatistics','data-stat-market','statistics-live']:w==='nomadtips3-engine-343'?['/statistics','/signals','/board','ft_btts_yes','ft_btts_no','function settleMarketSignal','settleMarketSignal','rollingWindowMinutes','windowDays','function periodEligible','function marketSettings','function runCycle','async scheduled']:['function team(','function providerOddsRaw','/snapshot'];
 const matches=[];
 for(const t of terms){let i=-1,cnt=0;while((i=s.indexOf(t,i+1))!==-1&&cnt++<4){matches.push({term:t,index:i,text:s.slice(Math.max(i-330,0),Math.min(s.length,i+t.length+550)).replace(/(?:authorization|bearer|secret|token|password)\s*[:=]\s*['"\x60][^'"\x60]+/ig,'[redacted]').slice(0,960)});}}
 out.workers.push({name:w,version:id,length:s.length,matches});
 }catch(e){out.workers.push({name:w,error:String(e.message||e)})}
}
for(const p of ['/statistics.html','/statistics','/api/engine/stats','/api/engine/statistics','/api/engine/history','/api/engine/signals','/api/engine/board','/api/engine/health','/api/5usd/snapshot','/api/hub/snapshot']){
 try{const r=await fetch('https://ball46.com'+p,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(40000)}),t=await r.text();
 let j;try{j=JSON.parse(t)}catch(e){}
 const matches=[...t.matchAll(/Settled Signal History|No settled results|statistics-scripts|<script[^>]+src=[^>]+|\/api\/engine\/[a-z/-]+/gi)].slice(0,30).map(m=>({at:m.index,text:t.slice(Math.max(0,m.index-150),m.index+250).slice(0,400)}));
 out.urlPaths.push({path:p,status:r.status,len:t.length,type:r.headers.get('content-type'),topKeys:Object.keys(j||{}).slice(0,25),count:j?.signals?.length,fixtureCount:j?.fixtures?.length,settledCount:j?.settledCount,markets:j?.runState,matched:matches.slice(0,p.includes('stat')?25:4)});
 }catch(e){out.urlPaths.push({path:p,error:String(e.message||e)})}
}
const sample=await fetch('https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev/snapshot',{signal:AbortSignal.timeout(40000)}).then(x=>x.json()).catch(e=>({error:String(e)}));
const sf=sample.fixtures?.find(f=>f.home?.id&&f.away?.id);
out.sampleHub={topKeys:Object.keys(sample),fixtureCount:sample.fixtureCount,home:sf?.home,away:sf?.away,fixture:{fixtureId:sf?.fixtureId,kickoffUtc:sf?.kickoffUtc,boardState:sf?.boardState}};
await mkdir('audit',{recursive:true});await writeFile('audit/stats-btts-inspection.json',JSON.stringify(out,null,2));
console.log('BALL46_STATS_INSPECT='+JSON.stringify(out).slice(0,57000));