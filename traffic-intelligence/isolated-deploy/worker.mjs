import {loadAnalytics} from './analytics.mjs';
// BALL46 VISITOR MONITOR — ISOLATED WORKER (NOT ball46-production)
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(o,status=200,extra={})=>new Response(JSON.stringify(o),{status,headers:{...JSON_HEADERS,...extra}});
const allow=new Set(['https://ball46.com','https://www.ball46.com']);
const TWO_MIN=120000, DAY=86400000;
const originHeaders=(o)=>({'access-control-allow-origin':o,'access-control-allow-methods':'OPTIONS, POST','access-control-allow-headers':'content-type','vary':'Origin'});
const pathValid=(p)=>typeof p==='string'&&p.length<=160&&/^\/[a-zA-Z0-9/_.-]*$/.test(p)&&!/^\/(admin|login|account|checkout|member)(\/|$)/i.test(p);
const maskIp=(ip)=>/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)?ip.split('.').slice(0,3).join('.')+'.xxx':(ip.includes(':')?ip.slice(0,12)+'…':'unknown');
const uuid=(s)=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
const isMobile=(ua)=>/Android|iPhone|Mobi/i.test(ua||'');
function parseToken(s){return JSON.parse(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')));}
function bytes(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));}
let keys=null,keysAt=0;
async function owner(req,env){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||!env.ADMIN_EMAIL)return false;
 const team=env.ACCESS_TEAM_DOMAIN.replace(/\/$/,'');
 try{
  const tu=new URL(team);
  if(tu.protocol!=='https:'||!tu.hostname.endsWith('.cloudflareaccess.com')||tu.pathname!=='/')return false;
  const jwt=req.headers.get('Cf-Access-Jwt-Assertion')||((req.headers.get('Cookie')||'').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)||[])[1];
  if(!jwt||jwt.length>8000)return false;
  const p=jwt.split('.');if(p.length!==3)return false;
  const head=parseToken(p[0]),body=parseToken(p[1]);
  const ts=Math.floor(Date.now()/1000);
  if(head.alg!=='RS256'||!head.kid||body.iss!==team||!body.exp||body.exp<=ts||(body.nbf&&body.nbf>ts)||String(body.email||'').toLowerCase()!==String(env.ADMIN_EMAIL).toLowerCase())return false;
  if(!(Array.isArray(body.aud)?body.aud.includes(env.ACCESS_AUD):body.aud===env.ACCESS_AUD))return false;
  if(!keys||Date.now()-keysAt>300000){
    const r=await fetch(team+'/cdn-cgi/access/certs');
    if(!r.ok)return false;
    keys=(await r.json()).keys;keysAt=Date.now();
  }
  const key=(keys||[]).find(k=>k.kid===head.kid&&k.kty==='RSA');if(!key)return false;
  const pub=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5',pub,bytes(p[2]),new TextEncoder().encode(p[0]+'.'+p[1]));
 }catch{return false;}
}

async function kvEvents(env){
 const events=[];let cursor, complete=false;let scanned=0;
 // Metadata-only listings: no per-event reads or shared BALL46 databases.
 do {
  const result=await env.EVENTS_KV.list({prefix:'ev/',limit:1000,...(cursor?{cursor}:{})});
  for(const key of result.keys||[]){
   if(key.metadata&&typeof key.metadata.at==='number')events.push(key.metadata);
  }
  scanned+=1;complete=result.list_complete===true;
  cursor=result.cursor;
 }while(!complete&&cursor&&scanned<30);
 if(!complete)return {error:'incomplete_report',status:503};
 const now=Date.now(), cutoff24=now-DAY, cutoff30=now-30*DAY;
 const valid=events.filter(e=>e.at>=cutoff30&&e.at<=now);
 const lastSession=new Map();
 for(const e of valid){ const prev=lastSession.get(e.sid); if(!prev||prev.at<e.at) lastSession.set(e.sid,e); }
 const today=[...lastSession.values()].filter(e=>e.at>=cutoff24);
 const online=[...lastSession.values()].filter(e=>e.at>=now-TWO_MIN);
 const views=valid.filter(e=>e.type==='view');
 const pageCount=new Map(),countryCount=new Map();
 for(const e of views){pageCount.set(e.path,(pageCount.get(e.path)||0)+1);}
 for(const e of lastSession.values())countryCount.set(e.country,(countryCount.get(e.country)||0)+1);
 const sorted=(mp,k)=>[...mp].map(([name,total])=>({[k]:name,total})).sort((a,b)=>b.total-a.total).slice(0,10);
 return {online:online.length,visitors24h:today.length,views24h:views.filter(e=>e.at>=cutoff24).length,
  latest:online.sort((a,b)=>b.at-a.at).slice(0,30).map(e=>({last_ms:e.at,path:e.path,country:e.country,city:e.city,device:e.device,ip_masked:e.ip_masked})),
  pages:sorted(pageCount,'path'),countries:sorted(countryCount,'country'),updatedAt:new Date(now).toISOString(),source:'b46-visitor-monitor-kv',ip:'masked',collectionEnabled:env.COLLECT_ENABLED==='true',complete:true
 };
}

async function collect(req,env){
 const origin=req.headers.get('Origin')||'';
 if(!allow.has(origin))return json({error:'not_allowed'},403);
 const cors=originHeaders(origin);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'method'},405,cors);
 if(env.COLLECT_ENABLED!=='true')return json({error:'collection_not_enabled'},503,cors);
 if(!env.DB&&!env.EVENTS_KV)return json({error:'database_not_ready'},503,cors);
 if(req.headers.get('DNT')==='1'||req.headers.get('Sec-GPC')==='1')return new Response(null,{status:204,headers:cors});
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('Content-Type')||''))return json({error:'type'},415,cors);
 const len=Number(req.headers.get('Content-Length')||0);if(len>1400)return json({error:'too_large'},413,cors);
 let data;try{const str=await req.text();if(str.length>1400)return json({error:'too_large'},413,cors);data=JSON.parse(str);}catch{return json({error:'bad_json'},400,cors);}
 if(!uuid(data?.sid)||!pathValid(data?.path)||!['view','heartbeat'].includes(data?.type))return json({error:'invalid_event'},400,cors);
 const ts=Date.now(), ip=maskIp(req.headers.get('CF-Connecting-IP')||''), ua=req.headers.get('User-Agent')||'', c=req.cf||{};
 const ref=(()=>{try{return new URL(data.referrer).hostname.slice(0,100);}catch{return'direct';}})();
 try{
  if(env.EVENTS_KV&&!env.DB){
   const meta={sid:data.sid,at:ts,type:data.type,path:data.path,country:String(c.country||'??').slice(0,2),city:String(c.city||'Unknown').slice(0,80),device:isMobile(ua)?'Mobile':'Desktop',ip_masked:ip,referrer:ref};
   await env.EVENTS_KV.put('ev/'+new Date(ts).toISOString().slice(0,10)+'/'+crypto.randomUUID(),'1',{expirationTtl:30*86400,metadata:meta});
   return new Response(null,{status:204,headers:cors});
  }
  const st=env.DB.prepare('INSERT INTO sessions (sid,first_ms,last_ms,path,country,city,device,ip_masked,referrer,pageviews) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sid) DO UPDATE SET last_ms=excluded.last_ms,path=excluded.path,pageviews=sessions.pageviews+excluded.pageviews').bind(data.sid,ts,ts,data.path,String(c.country||'??').slice(0,2),String(c.city||'Unknown').slice(0,80),isMobile(ua)?'Mobile':'Desktop',ip,ref,data.type==='view'?1:0);
  if(data.type==='view')await env.DB.batch([st,env.DB.prepare('INSERT INTO views (sid,at_ms,path) VALUES (?,?,?)').bind(data.sid,ts,data.path)]);else await st.run();
  return new Response(null,{status:204,headers:cors});
 }catch(e){console.error('collector DB failed',String(e?.message||''));return json({error:'storage_failure'},503,cors);}
}
async function summary(env){return json(await loadAnalytics(env));}
const DASHBOARD=String.raw`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BALL46 VISITOR MONITOR</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1518;color:#e7f5f1;font:15px system-ui,Arial}main{max-width:1080px;margin:auto;padding:26px}h1{font-size:clamp(23px,4vw,39px);letter-spacing:1px}h1 b{color:#4cdaa9}small{color:#89aaab}header{display:flex;justify-content:space-between;align-items:center;gap:12px}.kpi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{padding:23px;border-radius:19px;background:linear-gradient(155deg,#243c3e,#122428);box-shadow:inset 0 1px 0 #fff2,0 14px 24px #0004}.card strong{display:block;font-size:32px;color:#63e5bc;margin-top:8px}.tables{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:10px 4px;border-bottom:1px solid #ffffff13;text-align:left}th{color:#96c0b4}#status{font-size:12px;color:#b5d3c8}@media(max-width:720px){.kpi{grid-template-columns:1fr}.tables{grid-template-columns:1fr}}header{flex-wrap:wrap}.kpi{grid-template-columns:repeat(4,minmax(0,1fr))}.card{min-width:0}.card strong{font-size:clamp(19px,3vw,30px);overflow-wrap:anywhere}.period{display:block;line-height:1.6;font-size:11px;margin-top:10px;color:#a9c5bb}p{line-height:1.6}#status{max-width:380px}.chart{height:160px;display:flex;align-items:flex-end;gap:3px;margin:18px 0 10px}.bar{background:#4cdaa9;flex:1;min-width:2px;border-radius:3px 3px 0 0}.range{font-size:11px;color:#a9c5bb;overflow-wrap:anywhere}.unconnected{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.unconnected strong{font-size:17px;color:#c2d5ce}.unconnected .card{padding:18px}.table-wrap{max-height:360px;overflow:auto}.chart-empty{align-self:center;color:#a9c5bb}.status-error{color:#ffbf9c}@media(max-width:900px){.kpi{grid-template-columns:repeat(2,minmax(0,1fr))}.unconnected{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:540px){main{padding:16px}.kpi,.tables,.unconnected{grid-template-columns:1fr}header{display:block}.card{padding:18px}.chart{height:125px}}</style><main><header><div><small>SEPARATE CONTROL CENTER · PRIVATE</small><h1>BALL46 <b>VISITOR MONITOR</b></h1></div><div id="status" role="status">Connecting to Cloudflare…</div></header><p><small>Cloudflare HTTP request statistics · ball46.com zone, including proxied subdomains and bots. Requests are not unique visitors.</small></p><section class="kpi" aria-label="Request statistics"><article class="card">Requests today · Thailand<strong id="today">Not connected</strong><small class="period" id="today-period">Waiting for verified data</small></article><article class="card">Requests · 24 complete hours<strong id="last24h">Not connected</strong><small class="period" id="last24h-period">Waiting for verified data</small></article><article class="card">Requests · 7 complete UTC days<strong id="last7d">Not connected</strong><small class="period" id="last7d-period">Waiting for verified data</small></article><article class="card">Requests · 30 complete UTC days<strong id="last30d">Not connected</strong><small class="period" id="last30d-period">Waiting for verified data</small></article></section><section class="tables"><article class="card"><h3>Hourly requests · 24h</h3><div id="hourly-chart" class="chart" role="img" aria-label="Hourly request trend"></div><div class="range" id="hourly-range"></div><details><summary>View hourly data</summary><div class="table-wrap"><table><thead><tr><th>Hour · Thailand</th><th>Requests</th></tr></thead><tbody id="hourly"></tbody></table></div></details></article><article class="card"><h3>Daily requests · 30 UTC days</h3><div id="daily-chart" class="chart" role="img" aria-label="Daily request trend"></div><div class="range" id="daily-range"></div><details><summary>View daily data</summary><div class="table-wrap"><table><thead><tr><th>Date · UTC</th><th>Requests</th></tr></thead><tbody id="daily"></tbody></table></div></details></article></section><article class="card" style="margin-top:14px"><h3>Top 10 request countries · 24h</h3><p class="range" id="country-period">Waiting for verified data</p><div class="table-wrap"><table><thead><tr><th>Country</th><th>Requests</th></tr></thead><tbody id="countries"></tbody></table></div></article><section class="unconnected" aria-label="Additional data sources"><article class="card">Online visitors<strong>Not connected</strong><small>Live source and privacy review required</small></article><article class="card">Unique visitors<strong>Not connected</strong><small>Unique visitor source required</small></article><article class="card">Sessions<strong>Not connected</strong><small>Consented session source required</small></article><article class="card">Individual IP addresses<strong>Not connected</strong><small>Individual IP source not connected</small></article><article class="card">Popular pages<strong>Not connected</strong><small>Page-level dataset not integrated in V1</small></article><article class="card">Device statistics<strong>Not connected</strong><small>Device-level dataset not integrated in V1</small></article></section><p><small>Source: Cloudflare GraphQL Analytics API · Hourly and daily request aggregates. Today starts at midnight in Asia/Bangkok. Today and 24h end at the latest completed hour; 7/30 days use complete UTC days. Cloudflare processing may be delayed. Refreshes every 5 minutes. Collector remains disabled; no tracker installed on BALL46.</small></p></main><script>
const $=id=>document.getElementById(id), number=n=>new Intl.NumberFormat('en-US').format(n);
const time=t=>new Date(t).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' ICT';
const period=m=>time(m.start)+' → '+time(m.end)+' (end excluded)';
function rows(id,data,fn){const t=$(id);t.replaceChildren();if(!data?.length){const tr=document.createElement('tr'),td=document.createElement('td');td.textContent='Not connected — no verified buckets available';td.colSpan=2;tr.append(td);t.append(tr);return;}for(const x of data){const tr=document.createElement('tr');for(const v of fn(x)){const td=document.createElement('td');td.textContent=String(v??'—');tr.append(td)}t.append(tr)}}
function chart(id,data){const c=$(id+'-chart');c.replaceChildren();if(!data?.length){const p=document.createElement('span');p.className='chart-empty';p.textContent='Not connected';c.append(p);$(id+'-range').textContent='No verified data';return;}const max=Math.max(1,...data.map(v=>v.requests));for(const x of data){const b=document.createElement('div');b.className='bar';b.style.height=(x.requests/max*100)+'%';b.title=(id==='daily'?x.time+' UTC':time(x.time))+': '+number(x.requests)+' requests';c.append(b)}$(id+'-range').textContent='Returned Cloudflare buckets: '+(id==='daily'?data[0].time+' → '+data.at(-1).time+' UTC':time(data[0].time)+' → '+time(data.at(-1).time));}
function clear(){for(const k of ['today','last24h','last7d','last30d']){$(k).textContent='Not connected';$(k+'-period').textContent='Verified data unavailable';}rows('countries',null,()=>[]);rows('hourly',null,()=>[]);rows('daily',null,()=>[]);chart('hourly',null);chart('daily',null);$('country-period').textContent='Verified data unavailable';}
async function load(){try{const r=await fetch('/api/summary',{credentials:'same-origin',cache:'no-store'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Owner login or data connection required');const x=await r.json();if(x.schemaVersion!==1)throw Error('Verified data connection required');for(const k of ['today','last24h','last7d','last30d']){const m=x.metrics[k];$(k).textContent=m.status==='connected'?number(m.value):'Not connected';$(k+'-period').textContent=m.status==='connected'?period(m):m.reason;}rows('countries',x.countries?.slice(0,10),v=>[v.country,number(v.requests)]);rows('hourly',x.hourly,v=>[time(v.time),number(v.requests)]);rows('daily',x.daily,v=>[v.time,number(v.requests)]);chart('hourly',x.hourly);chart('daily',x.daily);$('country-period').textContent=x.metrics.last24h.status==='connected'?period(x.metrics.last24h):'Not connected';const ok=Object.values(x.metrics).every(m=>m.status==='connected');$('status').textContent=(ok?'Connected':'Some data not connected')+' · Last checked '+time(x.updatedAt);$('status').className=ok?'':'status-error';}catch(e){clear();$('status').textContent='Not connected — '+e.message;$('status').className='status-error';}}
load();setInterval(load,300000);
</script></html>`;
export default {
 async fetch(req,env){
  const u=new URL(req.url);
  if(u.pathname==='/health')return json({ok:true,service:'BALL46 VISITOR MONITOR',isolated:true,collectionEnabled:env.COLLECT_ENABLED==='true',storageReady:!!(env.DB||env.EVENTS_KV),ownerAccessConfigured:!!(env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.ADMIN_EMAIL)});
  if(u.pathname==='/api/collect')return collect(req,env);
  if(u.pathname!=='/'&&u.pathname!=='/api/summary')return json({error:'not_found'},404);
  if(!await owner(req,env))return new Response('Forbidden — Cloudflare Access owner login required',{status:403,headers:{'cache-control':'no-store','x-robots-tag':'noindex,nofollow'}});
  if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'method'},405);
  if(u.pathname==='/api/summary')return summary(env);
  return new Response(DASHBOARD,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','x-robots-tag':'noindex,nofollow','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 },
 async scheduled(event,env){
  if(!env.DB)return;
  const ts=Date.now();
  await env.DB.batch([env.DB.prepare('UPDATE sessions SET ip_masked=NULL WHERE last_ms<?').bind(ts-DAY),env.DB.prepare('DELETE FROM views WHERE at_ms<?').bind(ts-30*DAY),env.DB.prepare('DELETE FROM sessions WHERE last_ms<?').bind(ts-30*DAY)]);
 }
};