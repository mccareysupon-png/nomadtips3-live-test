const BASE='https://www.nowgoal.net';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';
const TIMEOUT_MS=9000;
const DETAIL_CACHE_MS=7000;
const MAX_DETAIL_CONCURRENCY=6;

const detailCache=new Map();

const finite=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null};

function cookieFromHeaders(headers){
  const all=typeof headers?.getSetCookie==='function'?headers.getSetCookie():[];
  if(all.length)return all.map(v=>String(v).split(';')[0]).filter(Boolean).join('; ');
  const one=headers?.get?.('set-cookie')||'';
  return one?String(one).split(';')[0]:'';
}

async function requestText(fetchImpl,path,cookie='',accept='*/*'){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  try{
    const response=await fetchImpl(new URL(path,BASE).toString(),{
      signal:ac.signal,redirect:'follow',cache:'no-store',
      headers:{
        'user-agent':UA,
        accept,
        'accept-language':'en-US,en;q=0.9',
        'cache-control':'no-cache, no-store',
        pragma:'no-cache',
        referer:`${BASE}/`,
        ...(cookie?{cookie}:{})
      }
    });
    const text=await response.text();
    if(!response.ok)throw new Error(`nowgoal_http_${response.status}:${path}`);
    if(/cf-chl-|captcha|attention required|access denied/i.test(text))throw new Error(`nowgoal_blocked_or_challenge:${path}`);
    return {text,cookie:cookieFromHeaders(response.headers)};
  }catch(error){
    if(error?.name==='AbortError')throw new Error(`nowgoal_timeout:${path}`);
    throw error;
  }finally{clearTimeout(timer)}
}

function splitLiteral(body=''){
  const out=[];let current='',quote=null,escape=false;
  for(const ch of String(body)){
    if(quote){
      if(escape){current+=ch;escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch===quote){quote=null;continue}
      current+=ch;continue;
    }
    if(ch==="'"||ch==='"'){quote=ch;continue}
    if(ch===','){out.push(current.trim());current='';continue}
    current+=ch;
  }
  out.push(current.trim());
  return out.map(v=>v===''?null:v);
}

export function parseNowgoalRoster(js=''){
  const rows=[];
  for(const match of String(js).matchAll(/A\[\d+\]\s*=\s*\[([^;]*?)\];/g)){
    const f=splitLiteral(match[1]);
    const id=String(f[0]??'').trim();
    const state=finite(f[8]);
    if(!/^\d+$/.test(id)||state===null||state<=0)continue;
    const home=String(f[4]??'').trim(),away=String(f[5]??'').trim();
    if(!home||!away)continue;
    rows.push({
      sourceMatchId:id,
      home,
      away,
      state,
      score:{home:finite(f[9]),away:finite(f[10])}
    });
  }
  return rows;
}

function decodeEntities(v=''){
  return String(v)
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>{const cp=Number(n);return Number.isFinite(cp)?String.fromCodePoint(cp):' '})
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>{const cp=parseInt(n,16);return Number.isFinite(cp)?String.fromCodePoint(cp):' '});
}

function htmlText(html=''){
  return decodeEntities(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ')
    .trim();
}

function pair(text,label){
  const re=new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*%?\\s*${label}\\s*(-?\\d+(?:\\.\\d+)?)\\s*%?`,'i');
  const m=String(text).match(re);
  if(!m)return null;
  const home=finite(m[1]),away=finite(m[2]);
  if(home===null||away===null||home<0||away<0)return null;
  return {home,away};
}

export function parseNowgoalStatsHtml(html=''){
  const text=htmlText(html);
  if(!text)return {shots_on_target:null,shots_off_target:null,possession:null,usable:false};
  const statsIndex=text.search(/\bStatistics\b/i);
  const after=statsIndex>=0?text.slice(statsIndex):text;
  const teamIndex=after.search(/\bTeam\s+Statistics\b/i);
  const scope=teamIndex>0?after.slice(0,teamIndex):after;
  const shotsOn=pair(scope,'Shots\\s+on\\s+Goal');
  const shotsOff=pair(scope,'Shots\\s+off\\s+Goal');
  const possession=pair(scope,'Possession');
  return {
    shots_on_target:shotsOn,
    shots_off_target:shotsOff,
    possession,
    usable:Boolean(shotsOn||shotsOff),
  };
}

export async function openNowgoalSession(fetchImpl=fetch,observedAt=Date.now()){
  const homepage=await requestText(fetchImpl,'/','','text/html,*/*');
  if(!homepage.cookie)throw new Error('nowgoal_session_cookie_missing');
  const rosterResponse=await requestText(fetchImpl,`/gf/data/bf_en-idn1.js?${observedAt}`,homepage.cookie,'application/javascript,text/javascript,*/*');
  const matches=parseNowgoalRoster(rosterResponse.text);
  if(!matches.length)throw new Error('nowgoal_live_roster_empty');
  return {cookie:homepage.cookie,matches,observedAt};
}

async function fetchOneDetail(session,id,fetchImpl,observedAt){
  const key=String(id),cached=detailCache.get(key);
  if(cached&&observedAt-cached.at<DETAIL_CACHE_MS)return cached.value;
  try{
    const response=await requestText(fetchImpl,`/match/live-${encodeURIComponent(key)}?_=${observedAt}`,session.cookie,'text/html,*/*');
    const stats=parseNowgoalStatsHtml(response.text);
    const value={ok:stats.usable,sourceMatchId:key,stats,error:stats.usable?null:'nowgoal_stats_missing'};
    detailCache.set(key,{at:observedAt,value});
    return value;
  }catch(error){
    const value={ok:false,sourceMatchId:key,stats:null,error:String(error?.message||error)};
    detailCache.set(key,{at:observedAt,value});
    return value;
  }
}

export async function fetchNowgoalDetails(session,ids=[],fetchImpl=fetch,observedAt=Date.now()){
  const unique=[...new Set((ids||[]).map(String).filter(id=>/^\d+$/.test(id)))];
  const out=[];
  let cursor=0;
  async function worker(){
    while(cursor<unique.length){
      const index=cursor++;out[index]=await fetchOneDetail(session,unique[index],fetchImpl,observedAt);
    }
  }
  const count=Math.min(MAX_DETAIL_CONCURRENCY,unique.length);
  await Promise.all(Array.from({length:count},()=>worker()));
  return out;
}

export const NOWGOAL_STATS_SOURCE=Object.freeze({base:BASE,mode:'MATCH_DETAIL_STATS',fills:['sot','off'],detailCacheMs:DETAIL_CACHE_MS});
