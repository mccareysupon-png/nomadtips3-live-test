// Consented browser presence only. Never derives visitors from requests or IPs.
export const PRESENCE_PREFIX='presence/v1/';
export const ONLINE_MS=120000, RETENTION_SECONDS=26*3600;
const DAY=86400000;
export const PUBLIC_PATHS=new Set(['/', '/index.html', '/information.html', '/about.html', '/user-guide.html', '/methodology.html', '/privacy.html', '/terms.html', '/disclaimer.html', '/affiliate-disclosure.html', '/responsible-gambling.html', '/cookies.html', '/contact.html']);
const ORIGINS=new Set(['https://ball46.com','https://www.ball46.com']);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8',...extra}});
const cors=origin=>({'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','vary':'Origin'});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('ball46-monitor-presence-v1:'+value))),b=>b.toString(16).padStart(2,'0')).join('');
const unavailable=reason=>({status:'not_connected',online:null,unique24h:null,sessions24h:null,source:'Consented browser heartbeat · dedicated Cloudflare KV',reason});

async function listAll(kv,prefix){
 const keys=[]; let cursor;
 // Fail closed when the report exceeds its bounded scan; never report a partial total.
 for(let page=0;page<30;page++){
  const result=await kv.list({prefix,limit:1000,...(cursor?{cursor}:{})});
  keys.push(...(result.keys||[]));
  if(result.list_complete===true)return keys;
  if(!result.cursor||result.cursor===cursor)throw Error('incomplete_presence_scan');
  cursor=result.cursor;
 }
 throw Error('presence_capacity_review_required');
}

export async function collectPresence(request,env,now=Date.now()){
 const origin=request.headers.get('Origin')||'';
 if(!ORIGINS.has(origin))return json({error:'not_allowed'},403);
 const headers=cors(origin);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...HEADERS,...headers}});
 if(request.method!=='POST')return json({error:'method'},405,headers);
 if(env.COLLECT_ENABLED!=='true')return json({error:'collection_not_enabled'},503,headers);
 if(!env.EVENTS_KV||!env.PRESENCE_VISITOR_LIMIT?.limit||!env.PRESENCE_NETWORK_LIMIT?.limit)return json({error:'collection_not_ready'},503,headers);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'type'},415,headers);
 if(Number(request.headers.get('Content-Length')||0)>700)return json({error:'too_large'},413,headers);
 let data;
 try{const text=await request.text();if(new TextEncoder().encode(text).byteLength>700)return json({error:'too_large'},413,headers);data=JSON.parse(text);}catch{return json({error:'bad_json'},400,headers);}
 if(data?.v!==1||!UUID.test(data?.vid||'')||!UUID.test(data?.sid||'')||!['heartbeat','revoke'].includes(data?.type))return json({error:'invalid_event'},400,headers);
 if(Object.keys(data).some(k=>!['v','vid','sid','type','path','consent'].includes(k)))return json({error:'unexpected_field'},400,headers);
 if(data.type==='heartbeat'&&(data.consent!==true||!PUBLIC_PATHS.has(data.path)))return json({error:'consent_or_path_required'},400,headers);
 if(data.type==='heartbeat'&&(request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'))return new Response(null,{status:204,headers:{...HEADERS,...headers}});
 const vid=await hash(data.vid.toLowerCase()),sid=await hash(data.sid.toLowerCase());
 try{
  // Network key is an in-memory abuse counter, never an analytics identifier.
  const network=await hash(request.headers.get('CF-Connecting-IP')||'unknown-network');
  const [a,b]=await Promise.all([env.PRESENCE_VISITOR_LIMIT.limit({key:'b46-vm-20261021:'+vid}),env.PRESENCE_NETWORK_LIMIT.limit({key:'b46-vm-20261021:'+network})]);
  if(!a.success||!b.success)return json({error:'rate_limited'},429,{...headers,'retry-after':'60'});
  if(data.type==='revoke'){
   // A short-lived tombstone also suppresses a heartbeat already in flight at withdrawal.
   await env.EVENTS_KV.put(PRESENCE_PREFIX+'revoked/'+vid,'1',{expirationTtl:RETENTION_SECONDS});
   const sessions=await listAll(env.EVENTS_KV,PRESENCE_PREFIX+'session/'+vid+'/');
   await Promise.all([env.EVENTS_KV.delete(PRESENCE_PREFIX+'visitor/'+vid),...sessions.map(k=>env.EVENTS_KV.delete(k.name))]);
   return new Response(null,{status:204,headers:{...HEADERS,...headers}});
  }
  if(await env.EVENTS_KV.get(PRESENCE_PREFIX+'revoked/'+vid))return new Response(null,{status:204,headers:{...HEADERS,...headers}});
  const country=/^[A-Z]{2}$/.test(request.cf?.country||'')?request.cf.country:'??';
  const device=/Android|iPhone|Mobi/i.test(request.headers.get('User-Agent')||'')?'Mobile':'Desktop';
  await Promise.all([
   env.EVENTS_KV.put(PRESENCE_PREFIX+'visitor/'+vid,'1',{expirationTtl:RETENTION_SECONDS,metadata:{at:now,path:data.path,country,device}}),
   env.EVENTS_KV.put(PRESENCE_PREFIX+'session/'+vid+'/'+sid,'1',{expirationTtl:RETENTION_SECONDS,metadata:{at:now}})
  ]);
  // This non-personal marker lets a genuinely idle, previously connected source show 0.
  if(!await env.EVENTS_KV.get(PRESENCE_PREFIX+'connected'))await env.EVENTS_KV.put(PRESENCE_PREFIX+'connected',JSON.stringify({firstAcceptedAt:now}));
  return new Response(null,{status:204,headers:{...HEADERS,...headers}});
 }catch{return json({error:'storage_or_limit_unavailable'},503,headers);}
}

export async function loadPresence(env,now=Date.now()){
 if(env.COLLECT_ENABLED!=='true'||!env.EVENTS_KV)return unavailable('Consented browser source is disabled; no visitor count is inferred.');
 try{
  const [marker,visitors,sessions,revoked]=await Promise.all([
   env.EVENTS_KV.get(PRESENCE_PREFIX+'connected','json'),listAll(env.EVENTS_KV,PRESENCE_PREFIX+'visitor/'),listAll(env.EVENTS_KV,PRESENCE_PREFIX+'session/'),listAll(env.EVENTS_KV,PRESENCE_PREFIX+'revoked/')
  ]);
  if(!Number.isFinite(marker?.firstAcceptedAt)||marker.firstAcceptedAt>now)return unavailable('Waiting for the first consented browser event; no historical data exists.');
  if([...visitors,...sessions].some(k=>!Number.isFinite(k.metadata?.at)))throw Error('invalid_presence_metadata');
  const withdrawn=new Set(revoked.map(k=>k.name.slice((PRESENCE_PREFIX+'revoked/').length)));
  const retained=k=>!withdrawn.has(k.name.slice(PRESENCE_PREFIX.length).split('/')[1]);
  const valid=keys=>keys.filter(k=>Number.isFinite(k.metadata?.at)&&k.metadata.at<=now&&k.metadata.at>=now-DAY);
  const recentVisitors=valid(visitors.filter(retained)),recentSessions=valid(sessions.filter(retained));
  const latest=recentVisitors.reduce((last,k)=>Math.max(last,k.metadata.at),marker.firstAcceptedAt);
  return {status:'connected',online:recentVisitors.filter(k=>k.metadata.at>=now-ONLINE_MS).length,unique24h:recentVisitors.length,sessions24h:recentSessions.length,
   source:'Consented browser heartbeat · b46-visitor-monitor-kv',firstAcceptedAt:new Date(marker.firstAcceptedAt).toISOString(),lastEventAt:new Date(latest).toISOString(),updatedAt:new Date(now).toISOString(),
   period:{start:new Date(Math.max(now-DAY,marker.firstAcceptedAt)).toISOString(),end:new Date(now).toISOString()},
   onlineWindowSeconds:ONLINE_MS/1000,heartbeatSeconds:45,sessionIdleMinutes:30,retentionHours:26,
   scope:'Consenting browsers on ball46.com and www.ball46.com. Unique browsers, not verified people. Sessions active within the last 24 hours.',
   latency:'Cloudflare KV can take 60 seconds or more to propagate. Dashboard polls every 30 seconds.'};
 }catch{return unavailable('Presence storage is unavailable or the bounded scan is incomplete; no partial count is shown.');}
}
