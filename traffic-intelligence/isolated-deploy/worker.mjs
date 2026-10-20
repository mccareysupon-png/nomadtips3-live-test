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
async function collect(req,env){
 const origin=req.headers.get('Origin')||'';
 if(!allow.has(origin))return json({error:'not_allowed'},403);
 const cors=originHeaders(origin);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:'method'},405,cors);
 if(env.COLLECT_ENABLED!=='true')return json({error:'collection_not_enabled'},503,cors);
 if(!env.DB)return json({error:'database_not_ready'},503,cors);
 if(req.headers.get('DNT')==='1'||req.headers.get('Sec-GPC')==='1')return new Response(null,{status:204,headers:cors});
 if(!/^application\/json(?:;|$)/i.test(req.headers.get('Content-Type')||''))return json({error:'type'},415,cors);
 const len=Number(req.headers.get('Content-Length')||0);if(len>1400)return json({error:'too_large'},413,cors);
 let data;try{const str=await req.text();if(str.length>1400)return json({error:'too_large'},413,cors);data=JSON.parse(str);}catch{return json({error:'bad_json'},400,cors);}
 if(!uuid(data?.sid)||!pathValid(data?.path)||!['view','heartbeat'].includes(data?.type))return json({error:'invalid_event'},400,cors);
 const ts=Date.now(), ip=maskIp(req.headers.get('CF-Connecting-IP')||''), ua=req.headers.get('User-Agent')||'', c=req.cf||{};
 const ref=(()=>{try{return new URL(data.referrer).hostname.slice(0,100);}catch{return'direct';}})();
 try{
  const st=env.DB.prepare('INSERT INTO sessions (sid,first_ms,last_ms,path,country,city,device,ip_masked,referrer,pageviews) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(sid) DO UPDATE SET last_ms=excluded.last_ms,path=excluded.path,pageviews=sessions.pageviews+excluded.pageviews').bind(data.sid,ts,ts,data.path,String(c.country||'??').slice(0,2),String(c.city||'Unknown').slice(0,80),isMobile(ua)?'Mobile':'Desktop',ip,ref,data.type==='view'?1:0);
  if(data.type==='view')await env.DB.batch([st,env.DB.prepare('INSERT INTO views (sid,at_ms,path) VALUES (?,?,?)').bind(data.sid,ts,data.path)]);else await st.run();
  return new Response(null,{status:204,headers:cors});
 }catch(e){console.error('collector DB failed',String(e?.message||''));return json({error:'storage_failure'},503,cors);}
}
async function summary(env){
 if(!env.DB)return json({error:'database_not_ready'},503);
 const ts=Date.now(),days=[1,7,30];
 try{
  const [online,visitors,views,latest,pages,countries]=await Promise.all([
   env.DB.prepare('SELECT count(*) total FROM sessions WHERE last_ms>=?').bind(ts-TWO_MIN).first(),
   env.DB.prepare('SELECT count(*) total FROM sessions WHERE last_ms>=?').bind(ts-DAY).first(),
   env.DB.prepare('SELECT count(*) total FROM views WHERE at_ms>=?').bind(ts-DAY).first(),
   env.DB.prepare('SELECT last_ms,path,country,city,device,ip_masked FROM sessions WHERE last_ms>=? ORDER BY last_ms DESC LIMIT 30').bind(ts-TWO_MIN).all(),
   env.DB.prepare('SELECT path,count(*) total FROM views WHERE at_ms>=? GROUP BY path ORDER BY total DESC LIMIT 10').bind(ts-30*DAY).all(),
   env.DB.prepare('SELECT country,count(*) total FROM sessions WHERE last_ms>=? GROUP BY country ORDER BY total DESC LIMIT 10').bind(ts-30*DAY).all()
  ]);
  return json({online:online?.total||0,visitors24h:visitors?.total||0,views24h:views?.total||0,latest:latest.results||[],pages:pages.results||[],countries:countries.results||[],updatedAt:new Date(ts).toISOString(),source:'b46-visitor-monitor-db',ip:'masked'});
 }catch(e){console.error('summary DB failed',String(e?.message||''));return json({error:'storage_failure'},503);}
}
const DASHBOARD=String.raw`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>BALL46 VISITOR MONITOR</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1518;color:#e7f5f1;font:15px system-ui,Arial}main{max-width:1080px;margin:auto;padding:26px}h1{font-size:clamp(23px,4vw,39px);letter-spacing:1px}h1 b{color:#4cdaa9}small{color:#89aaab}header{display:flex;justify-content:space-between;align-items:center;gap:12px}.kpi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{padding:23px;border-radius:19px;background:linear-gradient(155deg,#243c3e,#122428);box-shadow:inset 0 1px 0 #fff2,0 14px 24px #0004}.card strong{display:block;font-size:32px;color:#63e5bc;margin-top:8px}.tables{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:10px 4px;border-bottom:1px solid #ffffff13;text-align:left}th{color:#96c0b4}#status{font-size:12px;color:#b5d3c8}@media(max-width:720px){.kpi{grid-template-columns:1fr}.tables{grid-template-columns:1fr}}</style><main><header><div><small>SEPARATE CONTROL CENTER · PRIVATE</small><h1>BALL46 <b>VISITOR MONITOR</b></h1></div><div id="status">Connecting to private data…</div></header><section class="kpi"><article class="card">Online now<strong id="online">—</strong></article><article class="card">Visitors 24h<strong id="visitors24h">—</strong></article><article class="card">Pageviews 24h<strong id="views24h">—</strong></article></section><section class="tables"><article class="card"><h3>Popular pages</h3><table><tbody id="pages"></tbody></table></article><article class="card"><h3>Countries</h3><table><tbody id="countries"></tbody></table></article></section><article class="card" style="margin-top:14px"><h3>Recent online visitors (IP masked)</h3><table><thead><tr><th>Last seen</th><th>Page</th><th>Country / City</th><th>IP</th></tr></thead><tbody id="latest"></tbody></table></article><p><small>Actual data only · Updates every 30 seconds · No personally identifying precision promised</small></p></main><script>
const $=id=>document.getElementById(id);
function rows(id,data,fn){const t=$(id);t.replaceChildren();for(const x of data){const tr=document.createElement('tr');for(const v of fn(x)){const td=document.createElement('td');td.textContent=String(v??'—');tr.append(td)}t.append(tr)}}
async function load(){try{const r=await fetch('/api/summary',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const x=await r.json();for(const k of ['online','visitors24h','views24h'])$(k).textContent=x[k]??'—';rows('pages',x.pages||[],v=>[v.path,v.total]);rows('countries',x.countries||[],v=>[v.country,v.total]);rows('latest',x.latest||[],v=>[new Date(v.last_ms).toLocaleTimeString(),v.path,[v.country,v.city].join(' / '),v.ip_masked]);$('status').textContent='Last updated: '+new Date(x.updatedAt).toLocaleString()}catch(e){$('status').textContent='Data unavailable — '+e.message;}}
load();setInterval(load,30000);
</script></html>`;
export default {
 async fetch(req,env){
  const u=new URL(req.url);
  if(u.pathname==='/health')return json({ok:true,service:'BALL46 VISITOR MONITOR',isolated:true,collectionEnabled:env.COLLECT_ENABLED==='true',ownerAccessConfigured:!!(env.ACCESS_TEAM_DOMAIN&&env.ACCESS_AUD&&env.ADMIN_EMAIL)});
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