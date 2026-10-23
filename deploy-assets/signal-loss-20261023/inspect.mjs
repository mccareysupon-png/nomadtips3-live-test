import {mkdir,writeFile}from'node:fs/promises';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
if(!A||!T)throw Error('READ_ONLY_CLOUDFLARE_CREDENTIALS_NOT_SET');
async function cf(path){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{headers:{Authorization:'Bearer '+T},signal:AbortSignal.timeout(40000)});const j=await r.json();if(!r.ok||j.success!==true)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors));return j.result}
async function req(url){const at=Date.now();try{const u=new URL(url);u.searchParams.set('readonlySignalRescue',at);const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});const t=await r.text();let j;try{j=JSON.parse(t)}catch{};return{url,status:r.status,ms:Date.now()-at,bytes:t.length,headers:Object.fromEntries([...r.headers].filter(([k])=>/cache|version|signal/i.test(k))),data:j,html:t.slice(0,1200)}}catch(e){return{url,error:String(e.message||e)}}}
const workers=[];for(const w of['nomadtips3-engine-343','ball46-production','nomadtips3-5usd-hub-343']){try{const d=await cf('/workers/scripts/'+w+'/deployments?per_page=4');workers.push({name:w,deployments:d.deployments.slice(0,4).map(x=>({id:x.id,versions:x.versions,created_on:x.created_on}))})}catch(e){workers.push({name:w,error:String(e)})}}
const urls=['https://ball46.com/api/engine/health','https://ball46.com/api/engine/signals','https://ball46.com/api/engine/board','https://ball46.com/api/engine/settings','https://ball46.com/api/engine/registry','https://ball46.com/api/engine/statistics?paged=1','https://ball46.com/api/hub/snapshot','https://ball46.com/signal.html','https://ball46.com/signal.js','https://www.ball46.com/api/engine/signals','https://nomadtips3-engine-343.mccarey-supon.workers.dev/signals'];
const result=await Promise.all(urls.map(req));
const extract=r=>{if(!r.data)return{url:r.url,status:r.status,ms:r.ms,bytes:r.bytes,html:r.url.includes('signal.html')?r.html.slice(0,300):undefined};
 const j=r.data;const sig=j.signals??[];return{url:r.url,status:r.status,ms:r.ms,bytes:r.bytes,ok:j.ok,keys:Object.keys(j).slice(0,45),
 version:j.version,revision:j.revision,runState:j.runState,run:j.run,marketEnabled:j.marketEnabled,settings:j.settings, fixtureCount:j.fixtureCount,liveCount:j.liveCount,hubAgeMs:j.hubAgeMs,stale:j.stale,lastError:j.lastError,signalCount:j.signalCount,allCount:j.allCount,signalLength:sig.length,
 signals:sig.slice(0,35).map(s=>({id:s.id,fixtureId:s.fixtureId,market:s.market,selection:s.selection,status:s.status,result:s.result,createdAt:s.createdAt,entryMinute:s.entryMinute,home:s.home?.name,away:s.away?.name})),
 stats:j.ledgerTotal?{ledgerTotal:j.ledgerTotal,total:j.total,pending:j.pending,win:j.win,loss:j.loss,byMarket:j.byMarket}:undefined,
 board:j.fixtures?{total:j.fixtures.length,counts:j.counts,live:j.fixtures.filter(x=>x.boardState==='live').length,activeSigRows:j.fixtures.filter(x=>x.signals?.length).length}:undefined,
 hub:j.fixtures?{total:j.fixtures.length,counts:j.counts,lastSuccessAt:j.lastSuccessAt,lastError:j.lastError}:undefined,
 mirror:j.mirror,
 };};
const out={time:new Date().toISOString(),workers,probes:result.map(extract)};
await mkdir('audit',{recursive:true});await writeFile('audit/signal-incident.json',JSON.stringify(out,null,2));console.log('B46_SIGNAL_INCIDENT='+JSON.stringify(out).slice(0,46000));
