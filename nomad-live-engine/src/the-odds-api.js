import {assessHomeMarket} from './detector.js';
import {mapMatchesToOddsEvents,normalizeTeamName} from './real-market.js';

const BASE_URL='https://api.the-odds-api.com/v4';
const SOURCE='The Odds API';
const RESPONSE_LIMIT_BYTES=2_000_000;
const FRESHNESS_NEAR_MS=5000;

const num=value=>{
  if(value===null||value===undefined||value==='') return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const apiUrl=apiKey=>{
  const url=new URL(`${BASE_URL}/sports/upcoming/odds/`);
  url.searchParams.set('apiKey',apiKey);
  url.searchParams.set('regions','eu');
  url.searchParams.set('markets','spreads');
  url.searchParams.set('oddsFormat','decimal');
  url.searchParams.set('dateFormat','iso');
  return url.toString();
};
const state=(status,reason,extra={})=>({status,reason,source:SOURCE,bookmaker:null,...extra});

async function fetchJson(apiKey,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('THE_ODDS_API_TIMEOUT'),timeoutMs);
  try{
    const response=await fetch(apiUrl(apiKey),{
      signal:controller.signal,cache:'no-store',headers:{accept:'application/json','user-agent':'NOMADTIPS3-LIVE-341/1.0'},
    });
    const declaredSize=num(response.headers.get('content-length'));
    if(declaredSize!=null&&declaredSize>RESPONSE_LIMIT_BYTES) throw new Error('THE_ODDS_API_RESPONSE_TOO_LARGE');
    const text=await response.text();
    if(text.length>RESPONSE_LIMIT_BYTES) throw new Error('THE_ODDS_API_RESPONSE_TOO_LARGE');
    if(!response.ok) throw new Error(`THE_ODDS_API_HTTP_${response.status}:${text.slice(0,180)}`);
    let data;
    try{data=JSON.parse(text);}catch{throw new Error('THE_ODDS_API_INVALID_JSON');}
    return {
      data:Array.isArray(data)?data:[],
      quota:{remaining:num(response.headers.get('x-requests-remaining')),used:num(response.headers.get('x-requests-used')),last:num(response.headers.get('x-requests-last'))},
    };
  }finally{clearTimeout(timer);}
}

export async function fetchTheOddsApiLiveSoccer(apiKey,observedAt=Date.now(),timeoutMs=9000){
  if(!apiKey) throw new Error('THE_ODDS_API_KEY_MISSING');
  const response=await fetchJson(apiKey,timeoutMs);
  const events=response.data.filter(event=>{
    const kickoff=Date.parse(event?.commence_time||'');
    return String(event?.sport_key||'').startsWith('soccer_')&&Number.isFinite(kickoff)&&kickoff<=observedAt;
  });
  return {events,quota:response.quota,received:response.data.length};
}

export function parseTheOddsApiAsianHandicaps(event,item={}){
  const homeName=normalizeTeamName(event?.home_team),awayName=normalizeTeamName(event?.away_team);
  const candidates=[];
  for(const bookmaker of Array.isArray(event?.bookmakers)?event.bookmakers:[]){
    for(const market of Array.isArray(bookmaker?.markets)?bookmaker.markets:[]){
      if(String(market?.key||'').toLowerCase()!=='spreads') continue;
      const outcomes=Array.isArray(market?.outcomes)?market.outcomes:[];
      const home=outcomes.find(outcome=>normalizeTeamName(outcome?.name)===homeName);
      const away=outcomes.find(outcome=>normalizeTeamName(outcome?.name)===awayName);
      const line=num(home?.point),homeOdds=num(home?.price),awayOdds=num(away?.price);
      const sourceUpdatedAt=Date.parse(market?.last_update||bookmaker?.last_update||'');
      if(line==null||homeOdds==null||awayOdds==null||!Number.isFinite(sourceUpdatedAt)) continue;
      candidates.push({
        status:'AH READY',line,homeOdds,awayOdds,bookmaker:String(bookmaker?.title||bookmaker?.key||'Unknown'),
        market:'FULL MATCH LIVE AH',source:SOURCE,sourceUpdatedAt,eventId:String(event?.id||''),sportKey:event?.sport_key||null,
        mappingConfidence:item.matchConfidence??null,mapping:item.matchBreakdown??null,
      });
    }
  }
  return candidates;
}

function freshestThenBest(candidates=[]){
  if(!candidates.length) return null;
  return candidates.reduce((selected,candidate)=>{
    const freshnessDifference=Math.abs(candidate.sourceUpdatedAt-selected.sourceUpdatedAt);
    if(freshnessDifference>FRESHNESS_NEAR_MS) return candidate.sourceUpdatedAt>selected.sourceUpdatedAt?candidate:selected;
    const sameLine=Math.abs(candidate.line-selected.line)<1e-9;
    if(sameLine&&candidate.homeOdds!==selected.homeOdds) return candidate.homeOdds>selected.homeOdds?candidate:selected;
    return candidate.sourceUpdatedAt>selected.sourceUpdatedAt?candidate:selected;
  });
}

function mappedEvent(event){
  return {
    id:event?.id,home:event?.home_team,away:event?.away_team,league:{name:event?.sport_title||''},date:event?.commence_time,
    providerEvent:event,
  };
}

export function buildTheOddsApiMarkets(matches=[],events=[],config,observedAt=Date.now()){
  const mapped=mapMatchesToOddsEvents(matches,events.map(mappedEvent));
  const results=mapped.map(item=>{
    if(!item.event) return {matchId:item.match.id,matched:false,market:state('ODDS NOT MATCHED','no_matching_live_match')};
    const candidates=parseTheOddsApiAsianHandicaps(item.event.providerEvent,item);
    if(!candidates.length){
      return {matchId:item.match.id,matched:true,market:state('ODDS NOT READY','no_matching_live_ah',{eventId:String(item.event.id),mappingConfidence:item.matchConfidence})};
    }
    const passing=candidates.filter(candidate=>assessHomeMarket(candidate,config,observedAt).passed);
    return {matchId:item.match.id,matched:true,market:freshestThenBest(passing.length?passing:candidates)};
  });
  return {results,mapped:results.filter(item=>item.matched).length};
}

export function theOddsApiUnavailable(reason){return state('ODDS NOT READY',reason);}
