(()=>{
'use strict';
if(window.__NOMAD_M88_MAIN_HOOK__) return;
window.__NOMAD_M88_MAIN_HOOK__=true;

const SCHEMA='m88-msports-referee';
const EVENT='m88:referee-update';
const lastFingerprint=new Map();

const KEYS={
  event:['event_id','match_id','matchPartaiId','selectedMatchId','eventId','matchId'],
  league:['league_id','leagueId'],
  sport:['sport_id','sportId','sportID'],
  home:['homeName','teamHomeName','club_home','ClHome','home'],
  away:['awayName','teamAwayName','club_away','away'],
  homeLine:['homeHDPOri','homeHDP','home_hdp'],
  awayLine:['awayHDPOri','awayHDP','away_hdp'],
  homeOdds:['homeOdds','home_pry','newHome','homePrice'],
  awayOdds:['awayOdds','away_pry','newAway','awayPrice'],
  market:['marketId','marketDataId','market_id'],
  homeChoice:['homeChoiceId','homeSelectionId'],
  awayChoice:['awayChoiceId','awaySelectionId'],
  selection:['selectionKey','oddKey','selection_id','selectionId'],
  homeScore:['homeScore','scoreHome','home_score'],
  awayScore:['awayScore','scoreAway','away_score'],
  minute:['minute','live_timer','timeData','time'],
  period:['period','matchPeriod','livePeriod','half'],
  oddsType:['odds_type','oddsType','priceType'],
  sourceTs:['timestamp','source_timestamp','client_time','match_date','DtMatch']
};

function own(obj,key){return Object.prototype.hasOwnProperty.call(obj,key)}
function pick(obj,names){for(const k of names){if(own(obj,k)&&obj[k]!==null&&obj[k]!==undefined&&obj[k]!=='') return obj[k]}return undefined}
function asString(v){return v===null||v===undefined?'':String(v).trim()}
function asNumber(v){if(v===null||v===undefined||v==='') return null; const n=Number(v); return Number.isFinite(n)?n:null}
function segmentFrom(obj,marketId){
  const candidates=[marketId,pick(obj,['marketType','marketName','marketCode','market','segment'])].map(asString).filter(Boolean);
  const text=candidates.join(' ').toUpperCase();
  if(/(^|[^A-Z])FH([^A-Z]|$)|1H|FIRST\s*HALF/.test(text)) return 'FH';
  if(/FTHDP|FT\s*HDP|FULL\s*TIME|(^|[^A-Z])FT([^A-Z]|$)/.test(text)) return 'FT';
  return '';
}
function normalizeOddsType(v){const s=asString(v).toUpperCase(); if(!s) return 'Hong Kong'; if(s==='HK'||s==='HONGKONG'||s==='HONG KONG') return 'Hong Kong'; return asString(v)}
function minuteFrom(v){
  const n=asNumber(v); if(n!==null&&n>=0&&n<=200) return Math.floor(n);
  const m=asString(v).match(/(\d{1,3})\s*['’]?/); return m?Number(m[1]):null;
}
function selectionId(obj){
  const h=asString(pick(obj,KEYS.homeChoice)),a=asString(pick(obj,KEYS.awayChoice));
  if(h&&a) return `home-${h}|away-${a}`;
  return asString(pick(obj,KEYS.selection));
}
function build(obj){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)) return null;
  const eventId=asString(pick(obj,KEYS.event));
  const marketId=asString(pick(obj,KEYS.market));
  const selId=selectionId(obj);
  const home=asString(pick(obj,KEYS.home));
  const away=asString(pick(obj,KEYS.away));
  const homeLine=pick(obj,KEYS.homeLine),awayLine=pick(obj,KEYS.awayLine);
  const homeOdds=pick(obj,KEYS.homeOdds),awayOdds=pick(obj,KEYS.awayOdds);
  if(!eventId||!marketId||!selId||!home||!away) return null;
  if(homeLine===undefined||awayLine===undefined||homeOdds===undefined||awayOdds===undefined) return null;
  const segment=segmentFrom(obj,marketId);
  if(!segment) return null;
  const sportId=pick(obj,KEYS.sport);
  if(sportId!==undefined&&String(sportId)!=='10') return null;
  const hs=asNumber(pick(obj,KEYS.homeScore)),as=asNumber(pick(obj,KEYS.awayScore));
  return {
    schema:SCHEMA,
    event_id:eventId,
    league_id:asString(pick(obj,KEYS.league)),
    sport_id:asString(sportId||'10'),
    home,away,
    score:{home:hs,away:as},
    period:asString(pick(obj,KEYS.period)),
    minute:minuteFrom(pick(obj,KEYS.minute)),
    market:{
      type:'asian_handicap',segment,
      market_id:marketId,selection_id:selId,
      home_line:homeLine,away_line:awayLine,
      home_odds_raw:homeOdds,away_odds_raw:awayOdds,
      odds_type:normalizeOddsType(pick(obj,KEYS.oddsType))
    },
    market_id:marketId,
    selection_id:selId,
    home_line:homeLine,
    away_line:awayLine,
    home_odds_raw:homeOdds,
    away_odds_raw:awayOdds,
    odds_type:normalizeOddsType(pick(obj,KEYS.oddsType)),
    source_timestamp:pick(obj,KEYS.sourceTs)??null,
    received_at_utc:new Date().toISOString(),
    transport:'xhr-poll'
  };
}
function fingerprint(p){return JSON.stringify([p.event_id,p.market_id,p.selection_id,p.segment,p.home_line,p.away_line,p.home_odds_raw,p.away_odds_raw,p.score?.home,p.score?.away,p.period])}
function emit(payload){
  const key=`${payload.event_id}|${payload.market_id}|${payload.selection_id}`;
  const fp=fingerprint(payload);
  if(lastFingerprint.get(key)===fp) return;
  lastFingerprint.set(key,fp);
  window.dispatchEvent(new CustomEvent(EVENT,{detail:payload}));
}
function scan(value,depth=0,seen=new WeakSet()){
  if(depth>12||value===null||typeof value!=='object') return;
  if(seen.has(value)) return; seen.add(value);
  if(Array.isArray(value)){for(const item of value) scan(item,depth+1,seen);return}
  const payload=build(value); if(payload) emit(payload);
  for(const v of Object.values(value)) if(v&&typeof v==='object') scan(v,depth+1,seen);
}
function inspectText(text){if(typeof text!=='string'||text.length<2) return; try{scan(JSON.parse(text))}catch{}}

const XHR=window.XMLHttpRequest;
if(XHR&&XHR.prototype){
  const open=XHR.prototype.open,send=XHR.prototype.send;
  XHR.prototype.open=function(method,url,...rest){this.__nomadM88Url=asString(url);return open.call(this,method,url,...rest)};
  XHR.prototype.send=function(...args){
    this.addEventListener('load',()=>{
      try{
        const type=this.responseType;
        if(type===''||type==='text') inspectText(this.responseText);
        else if(type==='json') scan(this.response);
      }catch{}
    },{once:true});
    return send.apply(this,args);
  };
}

const originalFetch=window.fetch;
if(typeof originalFetch==='function'){
  window.fetch=async function(...args){
    const response=await originalFetch.apply(this,args);
    try{
      const clone=response.clone();
      const ct=(clone.headers.get('content-type')||'').toLowerCase();
      if(ct.includes('json')) clone.json().then(scan).catch(()=>{});
      else clone.text().then(inspectText).catch(()=>{});
    }catch{}
    return response;
  };
}
})();
