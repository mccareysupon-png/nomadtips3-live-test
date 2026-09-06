const BASE='https://www.nowgoal.net';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';
const TIMEOUT_MS=12000;
const FALLBACK_MATCH_ID='2991086';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
function cookieFromHeaders(headers){
  const all=typeof headers?.getSetCookie==='function'?headers.getSetCookie():[];
  if(all.length)return all.map(v=>String(v).split(';')[0]).filter(Boolean).join('; ');
  const one=headers?.get?.('set-cookie')||'';return one?String(one).split(';')[0]:'';
}
async function get(path,cookie=''){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(new URL(path,BASE),{redirect:'follow',cache:'no-store',signal:ac.signal,headers:{'user-agent':UA,'accept':'text/html,application/javascript,*/*','accept-language':'en-US,en;q=0.9','cache-control':'no-cache','pragma':'no-cache','referer':`${BASE}/`,...(cookie?{cookie}:{})}});
    const text=await r.text();
    if(!r.ok)throw new Error(`HTTP_${r.status}:${path}`);
    if(/cf-chl-|captcha|attention required|access denied/i.test(text))throw new Error(`BLOCKED_OR_CHALLENGE:${path}`);
    return {text,cookie:cookieFromHeaders(r.headers)};
  }finally{clearTimeout(timer)}
}
function splitLiteral(body=''){
  const out=[];let current='',quote=null,escape=false;
  for(const ch of body){
    if(quote){if(escape){current+=ch;escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch===quote){quote=null;continue}current+=ch;continue}
    if(ch==="'"||ch==='"'){quote=ch;continue}if(ch===','){out.push(current.trim());current='';continue}current+=ch;
  }
  out.push(current.trim());return out;
}
function liveRoster(js=''){
  const rows=[];
  for(const m of String(js).matchAll(/A\[\d+\]\s*=\s*\[([^;]*?)\];/g)){
    const f=splitLiteral(m[1]),id=String(f[0]||'').trim(),state=finite(f[8]);
    if(/^\d+$/.test(id)&&state!==null&&state>0)rows.push({id,home:String(f[4]||'').trim(),away:String(f[5]||'').trim(),state,score:[finite(f[9]),finite(f[10])]});
  }
  return rows;
}
function inspectMatchHtml(id,html){
  const label=(re)=>re.test(html);
  const eventHits=[...html.matchAll(/(?:Off Target|On Target|Blocked|Shots on Goal|Shots off Goal)/gi)].length;
  return {
    id,
    bytes:html.length,
    statistics:label(/Statistics/i),
    shotsOnGoal:label(/Shots\s+on\s+Goal/i),
    shotsOffGoal:label(/Shots\s+off\s+Goal/i),
    possession:label(/Possession/i),
    attacks:label(/\bAttacks\b/i),
    dangerousAttacks:label(/Dangerous\s+Attacks/i),
    timelineOffTarget:label(/Off\s+Target/i),
    timelineOnTarget:label(/On\s+Target/i),
    timelineBlocked:label(/\bBlocked\b/i),
    eventHits,
  };
}

const homepage=await get('/');
if(!homepage.cookie)throw new Error('NOWGOAL_SESSION_COOKIE_MISSING');
const rosterResp=await get(`/gf/data/bf_en-idn1.js?${Date.now()}`,homepage.cookie);
const live=liveRoster(rosterResp.text);
const ids=live.slice(0,5).map(x=>x.id);
if(!ids.length)ids.push(FALLBACK_MATCH_ID);
const results=[];
for(const id of ids){
  try{const page=await get(`/match/live-${id}?_=${Date.now()}`,homepage.cookie);results.push(inspectMatchHtml(id,page.text));}
  catch(error){results.push({id,error:String(error?.message||error)});}
}
const usable=results.filter(r=>!r.error&&r.statistics&&r.shotsOnGoal&&r.shotsOffGoal);
const timeline=results.filter(r=>!r.error&&(r.timelineOffTarget||r.timelineOnTarget||r.timelineBlocked));
const out={ok:usable.length>0,mode:'READ_ONLY_DIAGNOSTIC',source:'Nowgoal',liveRosterCount:live.length,usedFallback:live.length===0,results,summary:{pages:results.length,usableStatsPages:usable.length,timelineEvidencePages:timeline.length}};
console.log(JSON.stringify(out,null,2));
if(!out.ok)process.exitCode=2;
