const BASE_URL='https://api.odds-api.io/v3';
const DEFAULT_BOOKMAKER='1xbet';

const num=value=>{
  if(value===null||value===undefined||value==='') return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const ascii=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'');

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
  if(!na||!nb) return 0;
  if(na===nb) return 1;
  if(na.includes(nb)||nb.includes(na)) return .94;
  const A=tokens(na),B=tokens(nb); let intersection=0;
  for(const token of A) if(B.has(token)) intersection++;
  const union=new Set([...A,...B]).size;
  const jaccard=union?intersection/union:0;
  const prefix=na.slice(0,5)===nb.slice(0,5)?.5:0;
  return Math.min(1,jaccard*.9+prefix);
}

function kickoffScore(a,b){
  const ta=Date.parse(a||''),tb=Date.parse(b||'');
  if(!Number.isFinite(ta)||!Number.isFinite(tb)) return .5;
  const diff=Math.abs(ta-tb)/60000;
  if(diff<=20) return 1;
  if(diff<=90) return .8;
  if(diff<=240) return .45;
  return 0;
}
function leagueSimilarity(a,b){return teamSimilarity(a,b);}

export function matchEvent(match,event){
  const home=teamSimilarity(match?.home,event?.home),away=teamSimilarity(match?.away,event?.away);
  const teamAvg=(home+away)/2;
  const league=leagueSimilarity(match?.league,event?.league?.name);
  const kickoff=kickoffScore(match?.kickoffUtc,event?.date);
  const confidence=teamAvg*.78+league*.07+kickoff*.15;
  const ok=home>=.62&&away>=.62&&teamAvg>=.72&&confidence>=.70;
  return {ok,confidence:Number(confidence.toFixed(4)),home:Number(home.toFixed(4)),away:Number(away.toFixed(4)),league:Number(league.toFixed(4)),kickoff:Number(kickoff.toFixed(4))};
}

export function mapMatchesToOddsEvents(matches=[],events=[],matcher=matchEvent){
  const unused=new Set(events.map((_,index)=>index)),mapped=[];
  for(const match of matches){
    let best=null;
    for(const index of unused){
      const score=matcher(match,events[index]);
      if(!score.ok) continue;
      if(!best||score.confidence>best.score.confidence) best={index,event:events[index],score};
    }
    if(best){
      unused.delete(best.index);
      mapped.push({match,event:best.event,matchConfidence:best.score.confidence,matchBreakdown:best.score});
    }else mapped.push({match,event:null,matchConfidence:0,matchBreakdown:null});
  }
  return mapped;
}

function apiUrl(path,params,apiKey){
  const url=new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey',apiKey);
  for(const [key,value] of Object.entries(params||{})) if(value!==null&&value!==undefined&&value!=='') url.searchParams.set(key,String(value));
  return url.toString();
}

async function fetchJson(url,timeoutMs=9000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{headers:{accept:'application/json','user-agent':'NOMADTIPS3-LIVE-341/1.0'},signal:controller.signal,cf:{cacheTtl:0,cacheEverything:false}});
    const text=await response.text();
    let data=null; try{data=JSON.parse(text);}catch{}
    if(!response.ok) throw new Error(`ODDS_API_HTTP_${response.status}:${String(text).slice(0,180)}`);
    return data;
  }finally{clearTimeout(timer);}
}

export async function fetchLiveEvents(apiKey){
  if(!apiKey) throw new Error('ODDS_API_KEY_MISSING');
  const data=await fetchJson(apiUrl('/events/live',{sport:'football'},apiKey));
  return Array.isArray(data)?data:[];
}

export async function fetchMultiOdds(apiKey,eventIds=[],bookmaker=DEFAULT_BOOKMAKER){
  if(!apiKey) throw new Error('ODDS_API_KEY_MISSING');
  const ids=[...new Set(eventIds.map(String).filter(Boolean))].slice(0,10);
  if(!ids.length) return [];
  const data=await fetchJson(apiUrl('/odds/multi',{eventIds:ids.join(','),bookmakers:bookmaker},apiKey));
  return Array.isArray(data)?data:[];
}

function bookmakerMarkets(payload,bookmaker=DEFAULT_BOOKMAKER){
  const bookies=payload?.bookmakers||{};
  const direct=bookies[bookmaker]; if(Array.isArray(direct)) return direct;
  const key=Object.keys(bookies).find(item=>item.toLowerCase()===String(bookmaker).toLowerCase());
  return key&&Array.isArray(bookies[key])?bookies[key]:[];
}
function balanced(rows=[]){return [...rows].sort((a,b)=>Math.abs(a.home-a.away)-Math.abs(b.home-b.away));}

export function parseAsianHandicap(payload,bookmaker=DEFAULT_BOOKMAKER,preference=null){
  const markets=bookmakerMarkets(payload,bookmaker);
  const spread=markets.find(m=>String(m?.name||'').toLowerCase()==='spread');
  const rows=Array.isArray(spread?.odds)?spread.odds:[];
  const valid=rows.map(row=>({line:num(row?.hdp),home:num(row?.home),away:num(row?.away)}))
    .filter(row=>row.line!==null&&row.home!==null&&row.away!==null&&row.home>1&&row.away>1);
  if(!valid.length) return null;

  let pool=valid;
  if(preference&&typeof preference==='object'){
    const allowedLines=Array.isArray(preference.allowedLines)?preference.allowedLines.map(num).filter(value=>value!==null):[];
    const oddsMin=num(preference.oddsMin),oddsMax=num(preference.oddsMax);
    const lineMatches=allowedLines.length?valid.filter(row=>allowedLines.some(line=>Math.abs(line-row.line)<1e-9)):valid;
    if(lineMatches.length){
      const priceMatches=lineMatches.filter(row=>(oddsMin===null||row.home>=oddsMin)&&(oddsMax===null||row.home<=oddsMax));
      pool=priceMatches.length?priceMatches:lineMatches;
    }
  }

  const chosen=balanced(pool)[0];
  return {line:chosen.line,home:chosen.home,away:chosen.away,updatedAt:spread?.updatedAt||null,bookmaker:String(bookmaker),market:'Spread',alternatives:valid.length};
}

export function marketUpdatedAtMs(ah){
  const timestamp=Date.parse(ah?.updatedAt||'');
  return Number.isFinite(timestamp)?timestamp:null;
}
