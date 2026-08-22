import {teamSimilarity} from './real-market.js';

const BASE='https://www.nowgoal.net';
const COMPANY_ID='50';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const finite=value=>Number.isFinite(Number(value));
const n=value=>finite(value)?Number(value):null;

export function nowgoalUnavailable(reason='nowgoal_unavailable'){
  return {status:'AH UNAVAILABLE',reason,source:'Nowgoal',bookmaker:'1xBet',bookmakerVerified:true,market:'FULL MATCH LIVE AH',sourceUpdatedAt:null};
}

function cookieFromHeaders(headers){
  const all=typeof headers?.getSetCookie==='function'?headers.getSetCookie():[];
  if(all.length) return all.map(v=>String(v).split(';')[0]).filter(Boolean).join('; ');
  const one=headers?.get?.('set-cookie')||'';
  return one?String(one).split(';')[0]:'';
}

async function requestText(fetchImpl,path,config,cookie='',accept='*/*'){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config?.requestTimeoutMs||9000);
  try{
    const response=await fetchImpl(new URL(path,BASE).toString(),{
      signal:controller.signal,redirect:'follow',cache:'no-store',cf:{cacheTtl:0,cacheEverything:false},
      headers:{'user-agent':UA,'accept':accept,'accept-language':'en-US,en;q=0.9','cache-control':'no-cache, no-store','pragma':'no-cache','referer':`${BASE}/`,...(cookie?{cookie}:{})}
    });
    const text=await response.text();
    if(!response.ok) throw new Error(`NOWGOAL_HTTP_${response.status}`);
    return {text,cookie:cookieFromHeaders(response.headers)};
  }finally{clearTimeout(timer);}
}

function splitLiteral(body=''){
  const out=[]; let current='',quote=null,escape=false;
  for(const ch of body){
    if(quote){
      if(escape){current+=ch;escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;continue;}
      current+=ch;continue;
    }
    if(ch==='\''||ch==='"'){quote=ch;continue;}
    if(ch===','){out.push(current.trim());current='';continue;}
    current+=ch;
  }
  out.push(current.trim());
  return out.map(value=>value===''?null:value);
}

export function parseNowgoalRoster(js=''){
  const rows=[];
  for(const match of String(js).matchAll(/A\[\d+\]\s*=\s*\[([^;]*?)\];/g)){
    const f=splitLiteral(match[1]);
    const id=String(f[0]??'').trim();
    if(!/^\d+$/.test(id)) continue;
    rows.push({id,home:String(f[4]??'').trim(),away:String(f[5]??'').trim(),date:String(f[6]??'').trim(),state:n(f[8]),score:{home:n(f[9]),away:n(f[10])}});
  }
  return rows;
}

export function parseGoal50Rows(xml=''){
  const rows=new Map();
  for(const match of String(xml).matchAll(/<m>([^<]+)<\/m>/g)){
    const f=match[1].split(',');
    const id=String(f[0]||'').trim();
    if(!/^\d+$/.test(id)) continue;
    rows.set(id,{id,rawLine:n(f[2]),homeHk:n(f[3]),awayHk:n(f[4]),fields:f});
  }
  return rows;
}

export function normalizeNowgoalAhRow(row,sourceUpdatedAt){
  if(!row||!finite(row.rawLine)||!finite(row.homeHk)||!finite(row.awayHk)) return nowgoalUnavailable('invalid_nowgoal_ah_row');
  const line=-Number(row.rawLine),homeOdds=Number(row.homeHk)+1,awayOdds=Number(row.awayHk)+1;
  if(!finite(line)||!finite(homeOdds)||!finite(awayOdds)||homeOdds<=1||awayOdds<=1) return nowgoalUnavailable('invalid_nowgoal_ah_row');
  if(!Number.isFinite(Number(sourceUpdatedAt))) return nowgoalUnavailable('missing_verified_price_change_time');
  return {status:'AH READY',line,homeOdds,awayOdds,bookmaker:'1xBet',bookmakerVerified:true,market:'FULL MATCH LIVE AH',source:'Nowgoal',sourceUpdatedAt:Number(sourceUpdatedAt),sourceTimestampKind:'nowgoal_change_observed'};
}

function mapMatches(matches,roster){
  const candidates=roster.filter(row=>Number.isFinite(row.state)&&row.state>0);
  const unused=new Set(candidates.map((_,i)=>i));
  return matches.map(match=>{
    let best=null;
    for(const index of unused){
      const row=candidates[index],home=teamSimilarity(match.home,row.home),away=teamSimilarity(match.away,row.away),score=(home+away)/2;
      if(home<.62||away<.62||score<.74) continue;
      if(!best||score>best.score) best={index,row,score,home,away};
    }
    if(!best) return {match,row:null,confidence:0};
    unused.delete(best.index);
    return {match,row:best.row,confidence:Number(best.score.toFixed(4)),breakdown:{home:Number(best.home.toFixed(4)),away:Number(best.away.toFixed(4))}};
  });
}

export async function fetchNowgoal1xBetMarkets(matches=[],config,observedAt=Date.now(),previousUpdates={},fetchImpl=fetch){
  const targets=Array.isArray(matches)?matches:[];
  if(!targets.length) return {status:'NOT_NEEDED',checked:0,mapped:0,ready:0,results:[],priceUpdates:{},checkedAt:observedAt};
  const homepage=await requestText(fetchImpl,'/',config,'','text/html,*/*');
  const cookie=homepage.cookie;
  if(!cookie) throw new Error('NOWGOAL_SESSION_COOKIE_MISSING');
  const [rosterResponse,fullResponse,changeResponse]=await Promise.all([
    requestText(fetchImpl,`/gf/data/bf_en-idn1.js?${observedAt}`,config,cookie,'application/javascript,text/javascript,*/*'),
    requestText(fetchImpl,`/gf/data/odds/en/goal${COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*'),
    requestText(fetchImpl,`/gf/data/odds/en/ch_goal${COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*'),
  ]);
  const roster=parseNowgoalRoster(rosterResponse.text),full=parseGoal50Rows(fullResponse.text),changed=parseGoal50Rows(changeResponse.text);
  if(!roster.length) throw new Error('NOWGOAL_ROSTER_EMPTY');
  if(!full.size) throw new Error('NOWGOAL_1XBET_FEED_EMPTY');

  const keepMs=Math.max((config?.maximumPriceAgeSeconds||3600)*2000,7200000);
  const priceUpdates={};
  for(const [id,value] of Object.entries(previousUpdates||{})) if(Number.isFinite(Number(value))&&observedAt-Number(value)<=keepMs) priceUpdates[id]=Number(value);
  for(const id of changed.keys()) priceUpdates[id]=observedAt;

  const mapped=mapMatches(targets,roster); let mappedCount=0,ready=0;
  const results=mapped.map(item=>{
    if(!item.row) return {matchId:item.match.id,market:nowgoalUnavailable('nowgoal_match_not_mapped'),event:null};
    mappedCount++;
    const row=full.get(item.row.id);
    if(!row) return {matchId:item.match.id,market:nowgoalUnavailable('nowgoal_1xbet_ah_missing'),event:item.row};
    const market=normalizeNowgoalAhRow(row,priceUpdates[item.row.id]);
    market.mappingConfidence=item.confidence; market.mapping=item.breakdown; market.nowgoalMatchId=item.row.id;
    if(market.status==='AH READY') ready++;
    return {matchId:item.match.id,market,event:item.row};
  });
  return {status:'READY',checked:targets.length,mapped:mappedCount,ready,events:roster.length,results,priceUpdates,changed:changed.size,checkedAt:observedAt};
}
