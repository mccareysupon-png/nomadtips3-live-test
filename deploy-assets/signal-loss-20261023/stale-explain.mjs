import {createHash} from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const hash=x=>createHash('sha256').update(x).digest('hex');
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(40000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF'+r.status);return j.result;}
const versions=[];
for(const id of['8867d39d-f381-4261-8d05-5b429926353b','9f0b9a92-6a1f-402e-9ff6-a428ae591080','50f65def-f4a1-4172-8dd4-ac3c7bb82209']){
 const v=await cf('/workers/workers/ball46-production/versions/'+id+'?include=modules'),s=Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64').toString();
 let i=s.indexOf('async function activeSignals(');const next=s.indexOf('\nasync function',i+10),end=next>0?next:i+3500;
 const body=s.slice(i,end);
 versions.push({id,exists:i>=0,sha:hash(body),length:body.length,first:body.slice(0,320),filter:body.slice(Math.max(0,body.indexOf('hiddenPendingSignals')-520),body.indexOf('hiddenPendingSignals')+500)});
}
const base='https://ball46.com';
const requests=[base+'/api/engine/signals',base+'/api/hub/snapshot',base+'/signal.js',base+'/api/engine/statistics?paged=1'];
const data=await Promise.all(requests.map(async u=>{const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});if(u.endsWith('.js'))return{url:u,text:await r.text()};const j=await r.json();return{url:u,status:r.status,data:j};}));
const es=data[0].data,hub=data[1].data,script=data[2].text,stat=data[3].data;
const fx=new Map((hub.fixtures||[]).map(f=>[String(f.fixtureId),f]));
const direct=await fetch('https://nomadtips3-engine-343.mccarey-supon.workers.dev/signals',{signal:AbortSignal.timeout(35000)}).then(r=>r.json());
const pending=(direct.signals||[]).map(s=>{const f=fx.get(String(s.fixtureId));const t=Date.now();return{id:s.id,fixtureId:s.fixtureId,market:s.market,created:new Date(s.createdAt).toISOString(),ageHours:Math.round((t-s.createdAt)/3600000),inHub:!!f,boardState:f?.boardState||null,fixtureStatus:f?.status||null,hubKickoff:f?.kickoffUtc||null,inProxy:(es.signals||[]).some(x=>x.id===s.id)};});
const markers=[...script.matchAll(/\/api\/engine\/signals|load\(|fetch\(|active|pending|filter\(/g)].slice(0,25).map(m=>({term:m[0],context:script.slice(Math.max(0,m.index-100),m.index+190)}));
console.log('B46_SIGNAL_TROUBLE='+JSON.stringify({time:new Date().toISOString(),versions,pending,mirror:es.mirror,hub:{lastError:hub.lastError,stale:hub.stale,ageMs:hub.ageMs,counts:hub.counts},stats:{pending:stat.pending,total:stat.total,ledgerTotal:stat.ledgerTotal},scriptMarkers:markers}).slice(0,14500));
