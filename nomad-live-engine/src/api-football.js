import {assessHomeMarket} from './detector.js';
import {mapMatchesToOddsEvents,normalizeTeamName} from './real-market.js';

const BASE_URL='https://v3.football.api-sports.io';
const SOURCE='API-Football';
const UNKNOWN_BOOKMAKER='API-Football (bookmaker not supplied)';
const RESPONSE_LIMIT_BYTES=2_000_000;

const num=value=>{
  if(value===null||value===undefined||value==='') return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
};
const normalized=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const fullMatchAsianName=name=>{
  const text=normalized(name);
  if(!/(?:asian handicap|asian line|\bah\b)/.test(text)) return false;
  return !/(?:1st|2nd|first|second|half|quarter|period|corner|card)/.test(text);
};
const apiUrl=(path,params={})=>{
  const url=new URL(path,`${BASE_URL}/`);
  for(const [key,value] of Object.entries(params)) if(value!==null&&value!==undefined&&value!=='') url.searchParams.set(key,String(value));
  return url.toString();
};
const state=(status,reason,extra={})=>({status,reason,source:SOURCE,bookmaker:null,...extra});
const parseTimestamp=(...values)=>{
  for(const value of values){
    const timestamp=Date.parse(value||'');
    if(Number.isFinite(timestamp)) return timestamp;
  }
  return null;
};
const responseErrors=errors=>{
  if(Array.isArray(errors)) return errors.filter(Boolean);
  if(errors&&typeof errors==='object') return Object.entries(errors).filter(([,value])=>value).map(([key,value])=>`${key}:${value}`);
  if(typeof errors==='string'&&errors.trim()) return [errors.trim()];
  return [];
};

async function fetchJson(apiKey,path,params,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('API_FOOTBALL_TIMEOUT'),timeoutMs);
  try{
    const response=await fetch(apiUrl(path,params),{
      signal:controller.signal,cache:'no-store',headers:{accept:'application/json','x-apisports-key':apiKey,'user-agent':'NOMADTIPS3-LIVE-341/1.0'},
    });
    const declaredSize=num(response.headers.get('content-length'));
    if(declaredSize!=null&&declaredSize>RESPONSE_LIMIT_BYTES) throw new Error('API_FOOTBALL_RESPONSE_TOO_LARGE');
    const text=await response.text();
    if(text.length>RESPONSE_LIMIT_BYTES) throw new Error('API_FOOTBALL_RESPONSE_TOO_LARGE');
    if(!response.ok) throw new Error(`API_FOOTBALL_HTTP_${response.status}:${text.slice(0,180)}`);
    let payload;
    try{payload=text?JSON.parse(text):{};}catch{throw new Error('API_FOOTBALL_INVALID_JSON');}
    const errors=responseErrors(payload?.errors);
    if(errors.length) throw new Error(`API_FOOTBALL_ERRORS:${errors.join('|').slice(0,240)}`);
    return {
      data:Array.isArray(payload?.response)?payload.response:[],
      quota:{
        remainingDay:num(response.headers.get('x-ratelimit-requests-remaining')),
        remainingMinute:num(response.headers.get('x-ratelimit-remaining')),
      },
    };
  }finally{clearTimeout(timer);}
}

export function selectApiFootballAsianHandicapBet(bets=[]){
  const candidates=bets.map(bet=>({id:num(bet?.id),name:String(bet?.name||'')}))
    .filter(bet=>bet.id!=null&&fullMatchAsianName(bet.name));
  return candidates.sort((a,b)=>{
    const exactA=normalized(a.name)==='asian handicap'?1:0,exactB=normalized(b.name)==='asian handicap'?1:0;
    return exactB-exactA||a.id-b.id;
  })[0]||null;
}

function validCachedBet(value){
  const id=num(value?.id);
  return id==null?null:{id,name:String(value?.name||'Asian Handicap')};
}

export async function fetchApiFootballLiveAsianHandicaps(apiKey,cachedBet=null,timeoutMs=9000){
  if(!apiKey) throw new Error('API_FOOTBALL_KEY_MISSING');
  let bet=validCachedBet(cachedBet),referenceQuota=null;
  if(!bet){
    const reference=await fetchJson(apiKey,'/odds/live/bets',{},timeoutMs);
    referenceQuota=reference.quota;
    bet=selectApiFootballAsianHandicapBet(reference.data);
    if(!bet) throw new Error('API_FOOTBALL_LIVE_AH_BET_NOT_FOUND');
  }
  const response=await fetchJson(apiKey,'/odds/live',{bet:bet.id},timeoutMs);
  const events=response.data.filter(event=>!event?.status?.blocked&&!event?.status?.stopped&&!event?.status?.finished);
  return {events,bet,quota:response.quota,referenceQuota,received:response.data.length};
}

function sideOf(value,homeName,awayName){
  const raw=String(value?.value??value?.name??value?.label??value?.team??'');
  const text=normalized(raw),home=normalizeTeamName(homeName),away=normalizeTeamName(awayName);
  if(/^home(?:\s|$)/.test(text)||/^1(?:\s|$)/.test(text)||(home&&normalizeTeamName(raw).includes(home))) return 'home';
  if(/^away(?:\s|$)/.test(text)||/^2(?:\s|$)/.test(text)||(away&&normalizeTeamName(raw).includes(away))) return 'away';
  return null;
}
const handicap=value=>{
  const match=String(value??'').replace(',','.').match(/([+-]?(?:\d+(?:\.\d+)?|\.\d+))/);
  return match?num(match[1]):null;
};
const bookmakerName=(event,market)=>{
  const value=market?.bookmaker?.name??market?.bookmaker?.title??market?.bookmaker??event?.bookmaker?.name??event?.bookmaker?.title??event?.bookmaker;
  return value?String(value):UNKNOWN_BOOKMAKER;
};

export function parseApiFootballAsianHandicaps(event,item={},bet=null){
  const homeName=event?.teams?.home?.name,awayName=event?.teams?.away?.name;
  const sourceUpdatedAt=parseTimestamp(event?.update,event?.updatedAt);
  if(!homeName||!awayName||sourceUpdatedAt==null) return [];
  const candidates=[];
  for(const market of Array.isArray(event?.odds)?event.odds:[]){
    const sameId=bet?.id!=null&&num(market?.id)===num(bet.id);
    if(!sameId&&!fullMatchAsianName(market?.name)) continue;
    const outcomes=(Array.isArray(market?.values)?market.values:[]).map(value=>({
      side:sideOf(value,homeName,awayName),line:handicap(value?.handicap??value?.line??value?.hdp??value?.value),
      odds:num(value?.odd??value?.odds??value?.price??value?.decimal),main:value?.main===true,suspended:value?.suspended===true,
    })).filter(value=>value.side&&value.line!=null&&value.odds!=null&&!value.suspended);
    const homes=outcomes.filter(value=>value.side==='home'),aways=outcomes.filter(value=>value.side==='away');
    for(const home of homes){
      const away=aways.filter(value=>Math.abs(value.line+home.line)<1e-9)
        .sort((a,b)=>Number(b.main)-Number(a.main)||Math.abs(a.odds-home.odds)-Math.abs(b.odds-home.odds))[0];
      if(!away) continue;
      candidates.push({
        status:'AH READY',line:home.line,homeOdds:home.odds,awayOdds:away.odds,bookmaker:bookmakerName(event,market),
        market:'FULL MATCH LIVE AH',source:SOURCE,sourceUpdatedAt,eventId:String(event?.fixture?.id||''),
        betId:num(market?.id),betName:String(market?.name||bet?.name||'Asian Handicap'),main:home.main&&away.main,
        mappingConfidence:item.matchConfidence??null,mapping:item.matchBreakdown??null,
      });
    }
  }
  return candidates;
}

function preferredCandidate(candidates=[]){
  return [...candidates].sort((a,b)=>Number(b.main)-Number(a.main)
    ||Math.abs(a.homeOdds-a.awayOdds)-Math.abs(b.homeOdds-b.awayOdds)
    ||b.homeOdds-a.homeOdds)[0]||null;
}

function mappedEvent(event){
  return {
    id:event?.fixture?.id,home:event?.teams?.home?.name,away:event?.teams?.away?.name,
    league:{name:event?.league?.name||''},date:event?.fixture?.date||null,providerEvent:event,
  };
}

export function buildApiFootballMarkets(matches=[],events=[],config,observedAt=Date.now(),bet=null){
  const mapped=mapMatchesToOddsEvents(matches,events.map(mappedEvent));
  const results=mapped.map(item=>{
    if(!item.event) return {matchId:item.match.id,matched:false,market:state('ODDS NOT MATCHED','no_matching_live_match')};
    const candidates=parseApiFootballAsianHandicaps(item.event.providerEvent,item,bet);
    if(!candidates.length){
      return {matchId:item.match.id,matched:true,market:state('ODDS NOT READY','no_matching_live_ah',{eventId:String(item.event.id),mappingConfidence:item.matchConfidence})};
    }
    const passing=candidates.filter(candidate=>assessHomeMarket(candidate,config,observedAt).passed);
    return {matchId:item.match.id,matched:true,market:preferredCandidate(passing.length?passing:candidates)};
  });
  return {results,mapped:results.filter(item=>item.matched).length};
}

export function apiFootballUnavailable(reason){return state('ODDS NOT READY',reason);}

