// Server-side aggregate requests only. No tracker, visitor IDs, IPs or sessions.
export const ZONE = 'd491ee30b7a87a6c37e6a4dacf00ae8d';
const HOUR=3600000, DAY=24*HOUR, OFFSET=7*HOUR, CACHE_KEY='analytics/cloudflare-requests-v1';
export const unavailable=(reason='Additional data source required')=>({status:'not_connected',value:null,reason});
export function windows(now=Date.now()){
 const end=Math.floor(now/HOUR)*HOUR, day=Math.floor(now/DAY)*DAY;
 return {today:{start:Math.floor((now+OFFSET)/DAY)*DAY-OFFSET,end},last24h:{start:end-DAY,end},last7d:{start:day-7*DAY,end:day},last30d:{start:day-30*DAY,end:day}};
}
const iso=t=>new Date(t).toISOString();
export function queries(now){
 const w=windows(now);
 return {hourly:`{viewer{zones(filter:{zoneTag:"${ZONE}"}){httpRequests1hGroups(limit:1000,filter:{datetime_geq:"${iso(w.last24h.start)}",datetime_lt:"${iso(w.last24h.end)}"},orderBy:[datetime_ASC]){dimensions{datetime} sum{requests countryMap{clientCountryName requests}}}}}}`,
 daily:`{viewer{zones(filter:{zoneTag:"${ZONE}"}){httpRequests1dGroups(limit:1000,filter:{date_geq:"${iso(w.last30d.start).slice(0,10)}",date_lt:"${iso(w.last30d.end).slice(0,10)}"},orderBy:[date_ASC]){dimensions{date} sum{requests}}}}}`};
}
async function query(token,queryText,dataset,fetcher){
 const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query:queryText}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Cloudflare API unavailable');
 const body=await r.json();
 if(body.errors?.length)throw Error('Cloudflare dataset unavailable');
 const zones=body.data?.viewer?.zones;
 if(!Array.isArray(zones)||zones.length!==1||!Array.isArray(zones[0][dataset]))throw Error('Unconfirmed Cloudflare data');
 const rows=zones[0][dataset];
 if(rows.length>=1000)throw Error('Truncated Cloudflare data');
 const seen=new Set();
 for(const row of rows){
  const time=row.dimensions?.datetime||row.dimensions?.date;
  if(!time||!Number.isFinite(Date.parse(time))||seen.has(time)||!Number.isSafeInteger(row.sum?.requests)||row.sum.requests<0)throw Error('Invalid Cloudflare data');
  seen.add(time);
  if(dataset==='httpRequests1hGroups'&&(!Array.isArray(row.sum.countryMap)||row.sum.countryMap.some(c=>!Number.isSafeInteger(c.requests)||c.requests<0||typeof c.clientCountryName!=='string')))throw Error('Invalid country data');
 }
 return rows;
}
export function assemble(hourly,daily,now){
 const w=windows(now);
 const metric=(rows,range)=>{
  if(rows===null)return {...unavailable('Cloudflare API or dataset unavailable'),start:iso(range.start),end:iso(range.end)};
  const filtered=rows.filter(r=>{const t=Date.parse(r.dimensions.datetime||r.dimensions.date);return t>=range.start&&t<range.end;});
  if(!filtered.length)return {...unavailable('No buckets returned for this period'),start:iso(range.start),end:iso(range.end)};
  return {status:'connected',value:filtered.reduce((n,r)=>n+r.sum.requests,0),start:iso(range.start),end:iso(range.end),buckets:filtered.length};
 };
 const countries=new Map();
 for(const r of hourly||[])for(const c of r.sum.countryMap||[])countries.set(c.clientCountryName,(countries.get(c.clientCountryName)||0)+c.requests);
 const connected=hourly!==null||daily!==null;
 return {schemaVersion:1,status:connected?'connected':'not_connected',source:'Cloudflare GraphQL Analytics API',zone:'ball46.com',scope:'Whole zone, including proxied subdomains, bots and automated requests. Requests are not visitors.',
  datasets:['httpRequests1hGroups','httpRequests1dGroups'],updatedAt:iso(now),collectionEnabled:false,
  metrics:{today:metric(hourly,w.today),last24h:metric(hourly,w.last24h),last7d:metric(daily,w.last7d),last30d:metric(daily,w.last30d)},
  hourly:hourly===null?null:hourly.map(r=>({time:r.dimensions.datetime,requests:r.sum.requests})),daily:daily===null?null:daily.map(r=>({time:r.dimensions.date,requests:r.sum.requests})),
  countries:hourly===null?null:[...countries].map(([country,requests])=>({country,requests})).sort((a,b)=>b.requests-a.requests),
  online:unavailable('Live visitor source and privacy review required'),uniqueVisitors:unavailable('Unique visitor source not connected'),sessions:unavailable('Consented session analytics not connected'),individualIPs:unavailable('Individual IP source not connected'),pages:unavailable('Page-level dataset not integrated in V1'),devices:unavailable('Device-level dataset not integrated in V1'),
  timing:'Today uses Asia/Bangkok. Today and 24h end at the latest completed hour. 7d and 30d use complete UTC days. Cloudflare processing can be delayed.'};
}
export async function loadAnalytics(env,{now=Date.now(),fetcher=fetch}={}){
 if(!env.CF_ANALYTICS_TOKEN)return assemble(null,null,now);
 // KV contains aggregates only; never save the token or raw visitor observations.
 try{const cached=await env.EVENTS_KV?.get(CACHE_KEY,'json');if(cached?.schemaVersion===1&&cached.status==='connected'&&Date.parse(cached.updatedAt)<=now&&now-Date.parse(cached.updatedAt)<300000&&windows(Date.parse(cached.updatedAt)).last24h.end===windows(now).last24h.end)return {...cached,cached:true};}catch{}
 const q=queries(now);
 const result=await Promise.allSettled([query(env.CF_ANALYTICS_TOKEN,q.hourly,'httpRequests1hGroups',fetcher),query(env.CF_ANALYTICS_TOKEN,q.daily,'httpRequests1dGroups',fetcher)]);
 const data=assemble(...result.map(r=>r.status==='fulfilled'?r.value:null),now);
 if(data.metrics.last24h.status==='connected'&&data.metrics.last30d.status==='connected')try{await env.EVENTS_KV?.put(CACHE_KEY,JSON.stringify(data),{expirationTtl:600});}catch{}
 return {...data,cached:false};
}
