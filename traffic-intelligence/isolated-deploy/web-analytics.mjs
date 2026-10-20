// Existing Cloudflare Web Analytics beacon data, not HTTP requests or a new tracker.
const ACCOUNT='62cb0db544160e6591342abd6b4f35cc',SITE='8225c4c7c7b549909bac62b6385f09f7';
const DAY=86400000,OFFSET=7*3600000,CACHE='analytics/cloudflare-web-visitors-v1';
const missing=()=>({status:'not_connected',visits:null,pageviews:null,reason:'Cloudflare Web Analytics data unavailable'});
export function visitorQueries(now=Date.now()){
 const end=Math.floor(now/60000)*60000,today=Math.floor((now+OFFSET)/DAY)*DAY-OFFSET;
 const range=(start)=>({start:new Date(start).toISOString(),end:new Date(end).toISOString()});
 const periods={today:range(today),last24h:range(end-DAY),last7d:range(end-7*DAY),last30d:range(end-30*DAY),recent60m:range(end-3600000)};
 const filter=p=>`{datetime_geq:"${p.start}",datetime_lt:"${p.end}",siteTag:"${SITE}",requestHost_in:["ball46.com","www.ball46.com"],bot:0}`;
 const metric=(name,p)=>`${name}:rumPageloadEventsAdaptiveGroups(limit:1,filter:${filter(p)}){count sum{visits} avg{sampleInterval}}`;
 const series=(name,p,dimension)=>`${name}:rumPageloadEventsAdaptiveGroups(limit:1000,filter:${filter(p)},orderBy:[${dimension}_ASC]){count sum{visits} dimensions{${dimension}}}`;
 const breakdown=(name,dimension)=>`${name}:rumPageloadEventsAdaptiveGroups(limit:20,filter:${filter(periods.last24h)},orderBy:[count_DESC]){count sum{visits} dimensions{${dimension}}}`;
 const wrap=s=>`{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){${s}}}}`;
 return {periods,core:wrap(Object.entries(periods).map(([k,p])=>metric(k,p)).join(' ')+' '+series('hourly',periods.last24h,'datetimeHour')+' '+series('daily',periods.last30d,'date')),
  details:wrap([['pages','requestPath'],['countries','countryName'],['devices','deviceType'],['browsers','userAgentBrowser'],['referrers','refererHost']].map(([n,d])=>breakdown(n,d)).join(' '))};
}
async function request(token,query,fetcher){
 const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Cloudflare unavailable');const j=await r.json();
 if(j.errors?.length||j.data?.viewer?.accounts?.length!==1)throw Error('Web Analytics unavailable');return j.data.viewer.accounts[0];
}
function valid(row){return row&&Number.isSafeInteger(row.count)&&row.count>=0&&Number.isSafeInteger(row.sum?.visits)&&row.sum.visits>=0;}
export async function loadWebAnalytics(env,{now=Date.now(),fetcher=fetch}={}){
 const q=visitorQueries(now),empty={schemaVersion:1,status:'not_connected',source:'Cloudflare Web Analytics',site:'ball46.com',hosts:['ball46.com','www.ball46.com'],excludeBots:true,updatedAt:new Date(now).toISOString(),periods:q.periods,metrics:Object.fromEntries(Object.keys(q.periods).map(k=>[k,missing()])),hourly:null,daily:null,pages:null,countries:null,devices:null,browsers:null,referrers:null};
 if(!env.CF_WEB_ANALYTICS_TOKEN)return empty;
 try{const cached=await env.EVENTS_KV?.get(CACHE,'json');const age=now-Date.parse(cached?.updatedAt);if(cached?.schemaVersion===1&&cached.status==='connected'&&age>=0&&age<300000&&new Date(Date.parse(cached.updatedAt)+OFFSET).toISOString().slice(0,10)===new Date(now+OFFSET).toISOString().slice(0,10))return {...cached,cached:true};}catch{}
 const results=await Promise.allSettled([request(env.CF_WEB_ANALYTICS_TOKEN,q.core,fetcher),request(env.CF_WEB_ANALYTICS_TOKEN,q.details,fetcher)]);
 const core=results[0].status==='fulfilled'?results[0].value:null,details=results[1].status==='fulfilled'?results[1].value:null;
 const data={...empty};
 if(core){
  for(const key of Object.keys(q.periods)){
   const rows=core[key];if(!Array.isArray(rows)||rows.length>1||rows.some(r=>!valid(r)))continue;
   const row=rows[0];data.metrics[key]={status:'connected',visits:row?.sum.visits??0,pageviews:row?.count??0,sampleInterval:row?.avg?.sampleInterval??null};
  }
  for(const [key,dimension] of [['hourly','datetimeHour'],['daily','date']]){
   const rows=core[key];if(!Array.isArray(rows)||rows.length>=1000||rows.some(r=>!valid(r)||!Number.isFinite(Date.parse(r.dimensions?.[dimension]))))continue;
   data[key]=rows.map(r=>({time:r.dimensions[dimension],visits:r.sum.visits,pageviews:r.count}));
  }
 }
 if(details){for(const [key,dimension] of [['pages','requestPath'],['countries','countryName'],['devices','deviceType'],['browsers','userAgentBrowser'],['referrers','refererHost']]){
  const rows=details[key];if(!Array.isArray(rows)||rows.some(r=>!valid(r)||typeof r.dimensions?.[dimension]!=='string'))continue;
  data[key]=rows.map(r=>({name:(r.dimensions[dimension]||'Direct / Unknown').slice(0,180),visits:r.sum.visits,pageviews:r.count}));
 }}
 data.status=data.metrics.last24h.status==='connected'?'connected':'not_connected';
 data.definition='Visits are entry pageviews initiated from a different website according to Cloudflare. They are not unique people or concurrent online users. Pageviews come from the existing browser beacon, with Cloudflare bot filtering; adaptive sampling may apply.';
 if(data.status==='connected'&&data.metrics.last30d.status==='connected'&&data.pages&&data.devices)try{await env.EVENTS_KV?.put(CACHE,JSON.stringify(data),{expirationTtl:600});}catch{}
 return {...data,cached:false};
}
