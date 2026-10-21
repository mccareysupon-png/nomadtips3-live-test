// Read existing Cloudflare sampled request data. No tracker, KV writes or raw-data logging.
const ZONE='d491ee30b7a87a6c37e6a4dacf00ae8d';
const HOSTS=['ball46.com','www.ball46.com'];
export function requestLogQuery(now=Date.now()){
 const end=Math.floor((now-180000)/60000)*60000,start=end-86400000;
 return {start:new Date(start).toISOString(),end:new Date(end).toISOString(),query:`{viewer{zones(filter:{zoneTag:"${ZONE}"}){httpRequestsAdaptive(limit:100,filter:{datetime_geq:"${new Date(start).toISOString()}",datetime_lt:"${new Date(end).toISOString()}",clientRequestHTTPHost_in:["ball46.com","www.ball46.com"],requestSource:"eyeball"},orderBy:[datetime_DESC]){clientIP clientCountryName datetime clientRequestHTTPHost clientRequestPath clientDeviceType userAgentBrowser edgeResponseStatus}}}}`};
}
function validIP(ip){
 if(typeof ip!=='string'||ip.length>45)return false;
 if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))return ip.split('.').every(n=>Number(n)<=255);
 if(!/^[a-fA-F0-9:.]+$/.test(ip)||!ip.includes(':'))return false;
 try{return new URL('http://['+ip+']/').hostname.startsWith('[');}catch{return false;}
}
function safePath(path){
 const clean=path.split(/[?#]/)[0];
 if(!/^\/[a-zA-Z0-9/_.-]*$/.test(clean)||/\/(?:admin|login|account|checkout|member|password|reset|token)(?:\/|\.|$)/i.test(clean))return '[private path]';
 return clean.slice(0,180);
}
export async function loadRequestLogs(env,{now=Date.now(),fetcher=fetch}={}){
 const q=requestLogQuery(now),base={status:'not_connected',source:'Cloudflare Security Analytics / httpRequestsAdaptive',hosts:HOSTS,start:q.start,end:q.end,updatedAt:new Date(now).toISOString(),sampled:true,limit:100,rows:null,sampledDistinctIPs:null,storedInKV:false,definition:'Sampled network requests, including bots and automated traffic. IPs are not unique people, sessions or online users.'};
 if(!env.CF_ANALYTICS_TOKEN)return {...base,reason:'Analytics read secret unavailable'};
 try{
  const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({query:q.query}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('source');const j=await r.json();
  const zones=j.data?.viewer?.zones,rows=zones?.[0]?.httpRequestsAdaptive;
  if(j.errors?.length||!Array.isArray(zones)||zones.length!==1||!Array.isArray(rows)||rows.length>100)throw Error('source');
  for(const row of rows){
   const t=Date.parse(row.datetime);
   if(!validIP(row.clientIP)||!HOSTS.includes(row.clientRequestHTTPHost)||!Number.isFinite(t)||t<Date.parse(q.start)||t>=Date.parse(q.end)||typeof row.clientCountryName!=='string'||!/^[A-Z0-9?]{2}$/.test(row.clientCountryName)||typeof row.clientRequestPath!=='string'||typeof row.clientDeviceType!=='string'||typeof row.userAgentBrowser!=='string'||!Number.isInteger(row.edgeResponseStatus)||row.edgeResponseStatus<0||row.edgeResponseStatus>599)throw Error('source');
  }
  const mapped=rows.map(x=>({ip:x.clientIP,country:x.clientCountryName,time:x.datetime,host:x.clientRequestHTTPHost,path:safePath(x.clientRequestPath),device:x.clientDeviceType.slice(0,40),browser:x.userAgentBrowser.slice(0,60),status:x.edgeResponseStatus})).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  return {...base,status:'connected',rows:mapped,sampledDistinctIPs:new Set(mapped.map(x=>x.ip)).size};
 }catch{return {...base,reason:'Cloudflare sampled IP dataset unavailable; no visitor count inferred'};}
}
