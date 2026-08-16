const BASE_URL='https://api.odds-api.io/v3';
const DEFAULT_BOOKMAKER='1xbet';

const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const ascii=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
export function normalizeTeamName(value=''){
  return ascii(value).toLowerCase()
    .replace(/&/g,' and ')
    .replace(/\b(?:football club|futbol club|fc|cf|afc|sc|ac|fk|bk|club de futbol)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function tokens(value){return new Set(normalizeTeamName(value).split(' ').filter(Boolean));}
export function teamSimilarity(a,b){
  const na=normalizeTeamName(a),nb=normalizeTeamName(b);
  if(!na||!nb)return 0;
  if(na===nb)return 1;
  if(na.includes(nb)||nb.includes(na))return .94;
  const A=tokens(na),B=tokens(nb);let intersection=0;
  for(const t of A)if(B.has(t))intersection++;
  const union=new Set([...A,...B]).size;
  const jaccard=union?intersection/union:0;
  const prefix=na.slice(0,5)===nb.slice(0,5)?.5:0;
  return Math.min(1,jaccard*.9+prefix);
}
function kickoffScore(a,b){
  const ta=Date.parse(a||''),tb=Date.parse(b||'');
  if(!Number.isFinite(ta)||!Number.isFinite(tb))return .5;
  const diff=Math.abs(ta-tb)/60000;
  if(diff<=20)return 1;
  if(diff<=90)return .8;
  if(diff<=240)return .45;
  return 0;
}
function leagueSimilarity(a,b){return teamSimilarity(a,b);}
export function matchEvent(goalooMatch,event){
  const home=teamSimilarity(goalooMatch?.home,event?.home),away=teamSimilarity(goalooMatch?.away,event?.away);
  const teamAvg=(home+away)/2;
  const league=leagueSimilarity(goalooMatch?.league,event?.league?.name);
  const kickoff=kickoffScore(goalooMatch?.kickoffUtc,event?.date);
  const confidence=teamAvg*.78+league*.07+kickoff*.15;
  const ok=home>=.62&&away>=.62&&teamAvg>=.72&&confidence>=.70;
  return{ok,confidence:Number(confidence.toFixed(4)),home:Number(home.toFixed(4)),away:Number(away.toFixed(4)),league:Number(league.toFixed(4)),kickoff:Number(kickoff.toFixed(4))};
}
export function mapGoalooToOddsEvents(matches=[],events=[]){
  const unused=new Set(events.map((_,i)=>i)),mapped=[];
  for(const match of matches){
    let best=null;
    for(const i of unused){const score=matchEvent(match,events[i]);if(!score.ok)continue;if(!best||score.confidence>best.score.confidence)best={i,event:events[i],score};}
    if(best){unused.delete(best.i);mapped.push({match,event:best.event,matchConfidence:best.score.confidence,matchBreakdown:best.score});}
    else mapped.push({match,event:null,matchConfidence:0,matchBreakdown:null});
  }
  return mapped;
}
function apiUrl(path,params,apiKey){const u=new URL(`${BASE_URL}${path}`);u.searchParams.set('apiKey',apiKey);for(const [k,v] of Object.entries(params||{})){if(v!==null&&v!==undefined&&v!=='')u.searchParams.set(k,String(v));}return u.toString();}
async function fetchJson(url,timeoutMs=9000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'NOMADTIPS3-CAR3.4-RealMarketAudit/1.0'},signal:controller.signal,cf:{cacheTtl:0,cacheEverything:false}});const text=await r.text();let data=null;try{data=JSON.parse(text);}catch{}if(!r.ok)throw new Error(`ODDS_API_HTTP_${r.status}:${String(text).slice(0,180)}`);return data;}
  finally{clearTimeout(timer);}
}
export async function fetchLiveEvents(apiKey,bookmaker=DEFAULT_BOOKMAKER){
  if(!apiKey)throw new Error('ODDS_API_KEY_MISSING');
  const data=await fetchJson(apiUrl('/events',{sport:'football',status:'live',bookmaker},apiKey));
  return Array.isArray(data)?data:[];
}
export async function fetchMultiOdds(apiKey,eventIds=[],bookmaker=DEFAULT_BOOKMAKER){
  if(!apiKey)throw new Error('ODDS_API_KEY_MISSING');
  const ids=[...new Set(eventIds.map(String).filter(Boolean))].slice(0,10);
  if(!ids.length)return[];
  const data=await fetchJson(apiUrl('/odds/multi',{eventIds:ids.join(','),bookmakers:bookmaker},apiKey));
  return Array.isArray(data)?data:[];
}
function bookmakerMarkets(payload,bookmaker=DEFAULT_BOOKMAKER){
  const bookies=payload?.bookmakers||{};
  const direct=bookies[bookmaker];if(Array.isArray(direct))return direct;
  const key=Object.keys(bookies).find(k=>k.toLowerCase()===String(bookmaker).toLowerCase());
  return key&&Array.isArray(bookies[key])?bookies[key]:[];
}
export function parseAsianHandicap(payload,bookmaker=DEFAULT_BOOKMAKER){
  const markets=bookmakerMarkets(payload,bookmaker);
  const spread=markets.find(m=>String(m?.name||'').toLowerCase()==='spread');
  const rows=Array.isArray(spread?.odds)?spread.odds:[];
  const valid=rows.map(row=>({line:num(row?.hdp),home:num(row?.home),away:num(row?.away)})).filter(r=>r.line!==null&&r.home!==null&&r.away!==null&&r.home>1&&r.away>1);
  if(!valid.length)return null;
  // The API may expose more than one live spread. Prefer a balanced two-way price,
  // which is normally the current main AH line rather than an alternate line.
  valid.sort((a,b)=>Math.abs(a.home-b.away)-Math.abs(b.home-b.away));
  const chosen=valid[0];
  return{line:chosen.line,home:chosen.home,away:chosen.away,updatedAt:spread?.updatedAt||null,bookmaker:String(bookmaker),market:'Spread',alternatives:valid.length};
}
export function marketAgeSeconds(ah,now=Date.now()){
  const ts=Date.parse(ah?.updatedAt||'');return Number.isFinite(ts)?Math.max(0,Math.round((now-ts)/1000)):null;
}
export function attachRealMarket(matches=[],events=[],oddsPayloads=[],bookmaker=DEFAULT_BOOKMAKER){
  const mapped=mapGoalooToOddsEvents(matches,events),byId=new Map(oddsPayloads.map(x=>[String(x?.id),x]));
  return mapped.map(item=>{
    if(!item.event)return{...item,ah:null,status:'NOT_FOUND'};
    const payload=byId.get(String(item.event.id)),ah=parseAsianHandicap(payload,bookmaker);
    return{...item,ah,status:ah?'MATCH':'NO_AH'};
  });
}
