import {assessHomeMarket} from './detector.js';
import {mapMatchesToOddsEvents,matchEvent,normalizeTeamName} from './real-market.js';

const BASE_URL='https://v3.football.api-sports.io';
const SOURCE='API-Football';
const UNKNOWN_BOOKMAKER='API-Football (bookmaker not supplied)';
const RESPONSE_LIMIT_BYTES=2_000_000;
const PAGED_RESPONSE_LIMIT_BYTES=20_000_000;
const MAX_PAGES=25;
const PAGE_CONCURRENCY=4;
const FIXTURE_CACHE_MS=180_000;

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
      bytes:text.length,
      paging:{current:num(payload?.paging?.current)??1,total:num(payload?.paging?.total)??1},
      quota:{
        remainingDay:num(response.headers.get('x-ratelimit-requests-remaining')),
        remainingMinute:num(response.headers.get('x-ratelimit-remaining')),
      },
    };
  }finally{clearTimeout(timer);}
}

const minimumQuota=(...quotas)=>({
  remainingDay:Math.min(...quotas.map(item=>item?.remainingDay).filter(value=>value!=null),Infinity),
  remainingMinute:Math.min(...quotas.map(item=>item?.remainingMinute).filter(value=>value!=null),Infinity),
});
const publicQuota=quota=>({
  remainingDay:Number.isFinite(quota.remainingDay)?quota.remainingDay:null,
  remainingMinute:Number.isFinite(quota.remainingMinute)?quota.remainingMinute:null,
});

async function fetchAllPages(apiKey,path,params,timeoutMs){
  const first=await fetchJson(apiKey,path,params,timeoutMs);
  const total=Math.max(1,Math.trunc(first.paging.total||1));
  if(total>MAX_PAGES) throw new Error(`API_FOOTBALL_PAGING_LIMIT_EXCEEDED:${total}`);
  const pages=[first];
  for(let page=2;page<=total;page+=PAGE_CONCURRENCY){
    const pageNumbers=Array.from({length:Math.min(PAGE_CONCURRENCY,total-page+1)},(_,index)=>page+index);
    pages.push(...await Promise.all(pageNumbers.map(value=>fetchJson(apiKey,path,{...params,page:value},timeoutMs))));
    if(pages.reduce((sum,item)=>sum+item.bytes,0)>PAGED_RESPONSE_LIMIT_BYTES) throw new Error('API_FOOTBALL_PAGED_RESPONSE_TOO_LARGE');
  }
  return {
    data:pages.flatMap(item=>item.data),quota:publicQuota(minimumQuota(...pages.map(item=>item.quota))),
    paging:{total,fetched:pages.length},requests:pages.length,bytes:pages.reduce((sum,item)=>sum+item.bytes,0),
  };
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

const compactFixture=fixture=>({
  fixture:{id:fixture?.fixture?.id,date:fixture?.fixture?.date||null},
  league:{name:fixture?.league?.name||''},
  teams:{home:{name:fixture?.teams?.home?.name||''},away:{name:fixture?.teams?.away?.name||''}},
});
const validFixtureCache=value=>{
  const updatedAt=num(value?.updatedAt);
  const fixtures=Array.isArray(value?.fixtures)?value.fixtures.filter(item=>item?.fixture?.id!=null):[];
  return updatedAt!=null&&Array.isArray(value?.fixtures)?{updatedAt,fixtures}:null;
};

export async function fetchApiFootballLiveAsianHandicaps(apiKey,cachedBet=null,timeoutMs=9000,onBetResolved=null,cachedFixtures=null,onFixturesResolved=null,observedAt=Date.now()){
  if(!apiKey) throw new Error('API_FOOTBALL_KEY_MISSING');
  let bet=validCachedBet(cachedBet),referenceQuota=null;
  if(!bet){
    const reference=await fetchAllPages(apiKey,'/odds/live/bets',{},timeoutMs);
    referenceQuota=reference.quota;
    bet=selectApiFootballAsianHandicapBet(reference.data);
    if(!bet) throw new Error('API_FOOTBALL_LIVE_AH_BET_NOT_FOUND');
    if(typeof onBetResolved==='function') await onBetResolved(bet);
  }
  const fixtureCache=validFixtureCache(cachedFixtures);
  const fixtureCacheAgeMs=fixtureCache?Math.max(0,observedAt-fixtureCache.updatedAt):null;
  const useCachedFixtures=fixtureCache&&fixtureCacheAgeMs<=FIXTURE_CACHE_MS;
  const [oddsResponse,fixturesResult]=await Promise.all([
    fetchAllPages(apiKey,'/odds/live',{bet:bet.id},timeoutMs),
    useCachedFixtures?Promise.resolve({value:null,error:null}):fetchAllPages(apiKey,'/fixtures',{live:'all'},timeoutMs)
      .then(value=>({value,error:null}),error=>({value:null,error})),
  ]);
  const refreshedFixtures=fixturesResult.value?.data?.map(compactFixture).filter(item=>item.fixture.id!=null)||null;
  if(refreshedFixtures!==null&&typeof onFixturesResolved==='function'){
    await onFixturesResolved({updatedAt:observedAt,fixtures:refreshedFixtures});
  }
  const fixtures=refreshedFixtures!==null?refreshedFixtures:(fixtureCache?.fixtures||[]);
  const fixturesResponse=fixturesResult.value||{data:fixtures,quota:null,paging:{total:0,fetched:0},requests:0};
  const events=oddsResponse.data.filter(event=>!event?.status?.blocked&&!event?.status?.stopped&&!event?.status?.finished);
  return {
    events,fixtures,bet,
    quota:publicQuota(minimumQuota(oddsResponse.quota,fixturesResponse.quota)),referenceQuota,
    received:oddsResponse.data.length,fixturesReceived:fixtures.length,
    fixturesError:fixturesResult.error?String(fixturesResult.error?.message||fixturesResult.error):null,
    fixtureCache:useCachedFixtures?'HIT':refreshedFixtures!==null?'REFRESHED':fixtureCache?'STALE_FALLBACK':'MISS',
    fixtureCacheAgeSeconds:fixtureCacheAgeMs==null?null:Math.round(fixtureCacheAgeMs/1000),
    pages:{odds:oddsResponse.paging,fixtures:fixturesResponse.paging},
    requests:{odds:oddsResponse.requests,fixtures:fixturesResponse.requests,total:oddsResponse.requests+fixturesResponse.requests},
  };
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
    const bookmaker=bookmakerName(event,market);
    for(const home of homes){
      const away=aways.filter(value=>Math.abs(value.line+home.line)<1e-9)
        .sort((a,b)=>Number(b.main)-Number(a.main)||Math.abs(a.odds-home.odds)-Math.abs(b.odds-home.odds))[0];
      if(!away) continue;
      candidates.push({
        status:'AH READY',line:home.line,homeOdds:home.odds,awayOdds:away.odds,bookmaker,
        bookmakerVerified:bookmaker!==UNKNOWN_BOOKMAKER,
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

const competitionClass=value=>{
  const teams=normalized([value?.home,value?.away].filter(Boolean).join(' '));
  const text=normalized([teams,value?.league?.name??value?.league].filter(Boolean).join(' '));
  const youth=text.match(/\b(?:u|under)\s*(1[5-9]|2[0-3])\b/);
  return {
    women:/\b(?:women|woman|ladies|female|w)\b/.test(text),
    youth:youth?Number(youth[1]):null,
    reserve:/\b(?:reserve|reserves|res)\b/.test(text),
    second:/\b(?:ii|b team)\b/.test(text)||/\bb\b/.test(teams),
  };
};
const sameCompetitionClass=(match,event)=>{
  const left=competitionClass(match),right=competitionClass(event);
  return left.women===right.women&&left.youth===right.youth&&left.reserve===right.reserve&&left.second===right.second;
};
export function matchApiFootballEvent(match,event){
  const score=matchEvent(match,event);
  return sameCompetitionClass(match,event)?score:{...score,ok:false,classMismatch:true};
}
const fixtureEvent=fixture=>({
  id:fixture?.fixture?.id,home:fixture?.teams?.home?.name,away:fixture?.teams?.away?.name,
  league:{name:fixture?.league?.name||''},date:fixture?.fixture?.date||null,providerFixture:fixture,
});
const eventFixtureId=event=>String(event?.fixture?.id??'');
const mergeFixtureIdentity=(event,fixture)=>fixture?{
  ...event,fixture:{...(event?.fixture||{}),...(fixture?.fixture||{})},
  league:fixture?.league||event?.league,teams:fixture?.teams||event?.teams,
}:event;

export function buildApiFootballMarkets(matches=[],events=[],config,observedAt=Date.now(),bet=null,fixtures=[]){
  const fixtureMappings=mapMatchesToOddsEvents(matches,fixtures.map(fixtureEvent),matchApiFootballEvent);
  const fixtureById=new Map(fixtures.map(fixture=>[eventFixtureId(fixture),fixture]).filter(([id])=>id));
  const oddsByFixtureId=new Map(events.map(event=>[eventFixtureId(event),event]).filter(([id])=>id));
  const joinedIds=new Set(fixtureMappings.map(item=>item.event&&oddsByFixtureId.has(String(item.event.id))?String(item.event.id):null).filter(Boolean));
  const directMatches=fixtureMappings.filter(item=>!item.event||!oddsByFixtureId.has(String(item.event.id))).map(item=>item.match);
  const enrichedEvents=events.map(event=>mergeFixtureIdentity(event,fixtureById.get(eventFixtureId(event))));
  const directEvents=enrichedEvents.filter(event=>!joinedIds.has(eventFixtureId(event)));
  const directMappings=new Map(mapMatchesToOddsEvents(directMatches,directEvents.map(mappedEvent),matchApiFootballEvent)
    .map(item=>[String(item.match.id),item]));
  let fixtureMapped=0;
  const resolved=fixtureMappings.map(item=>{
    if(item.event){
      fixtureMapped++;
      const raw=oddsByFixtureId.get(String(item.event.id));
      if(raw) return {...item,event:mappedEvent(mergeFixtureIdentity(raw,item.event.providerFixture)),mappingMethod:'fixture_id',fixtureMatched:true};
      const direct=directMappings.get(String(item.match.id));
      return {...direct,mappingMethod:'direct',fixtureMatched:true};
    }
    const direct=directMappings.get(String(item.match.id));
    return {...direct,mappingMethod:'direct',fixtureMatched:false};
  });
  const results=resolved.map(item=>{
    if(!item.event){
      const reason=item.fixtureMatched?'no_matching_live_ah':'no_matching_live_match';
      return {matchId:item.match.id,matched:false,fixtureMatched:item.fixtureMatched,mappingMethod:item.mappingMethod,market:state(item.fixtureMatched?'ODDS NOT READY':'ODDS NOT MATCHED',reason)};
    }
    const candidates=parseApiFootballAsianHandicaps(item.event.providerEvent,item,bet);
    if(!candidates.length){
      return {matchId:item.match.id,matched:true,fixtureMatched:item.fixtureMatched,mappingMethod:item.mappingMethod,market:state('ODDS NOT READY','no_matching_live_ah',{eventId:String(item.event.id),mappingConfidence:item.matchConfidence})};
    }
    const passing=candidates.filter(candidate=>assessHomeMarket(candidate,config,observedAt).passed);
    return {matchId:item.match.id,matched:true,fixtureMatched:item.fixtureMatched,mappingMethod:item.mappingMethod,market:preferredCandidate(passing.length?passing:candidates)};
  });
  return {results,mapped:results.filter(item=>item.matched).length,fixtureMapped};
}

export function apiFootballUnavailable(reason){return state('ODDS NOT READY',reason);}

