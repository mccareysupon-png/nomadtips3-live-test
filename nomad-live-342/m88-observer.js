(()=>{
'use strict';
const STORAGE_KEY='nomadM88Observation342';
const VALID_STATES=new Set(['VALID','STALE','UNAVAILABLE','UNKNOWN','MISMATCH']);
const COLLECTOR_SCHEMA='m88-msports-referee';

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function normalizeOdds(raw,format='HK'){
  const n=finite(raw); if(n===null||n<0)return null;
  const f=String(format||'HK').toUpperCase();
  if(f==='HK'||f==='HONG KONG'||f==='HONGKONG') return Number((1+n).toFixed(3));
  if(f==='DECIMAL') return n>=1?Number(n.toFixed(3)):null;
  return null;
}
function normalizeOddsFormat(format='HK'){
  const f=String(format||'HK').trim().toUpperCase();
  if(f==='HONG KONG'||f==='HONGKONG') return 'HK';
  return f;
}
function decodeComponent(raw){
  const s=String(raw??'').trim().replaceAll('−','-').replaceAll('＋','+');
  if(!s)return {value:null,status:'UNAVAILABLE',reason:'empty HDP line'};
  const n=Number(s);
  if(n===0)return {value:0,status:'VALID',reason:'zero line is sign-safe'};
  if(/^[+-]/.test(s)&&Number.isFinite(n))return {value:n,status:'VALID',reason:'explicit sign present'};
  if(Number.isFinite(n))return {value:null,status:'UNKNOWN',reason:'non-zero M88 HDP has no explicit sign; hold for verified decode rule'};
  return {value:null,status:'MISMATCH',reason:'unrecognized HDP notation'};
}
function decodeHomeLine(raw){
  const s=String(raw??'').trim().replaceAll('−','-').replaceAll('＋','+');
  if(s.includes('/')){
    const parts=s.split('/').map(decodeComponent);
    if(parts.some(p=>p.status!=='VALID')){
      const first=parts.find(p=>p.status!=='VALID');
      return {value:null,status:first.status,reason:first.reason,raw:s};
    }
    return {value:Number((parts.reduce((a,p)=>a+p.value,0)/parts.length).toFixed(2)),status:'VALID',reason:'explicit split line normalized',raw:s};
  }
  return {...decodeComponent(s),raw:s};
}
function parseTime(value){
  if(value===null||value===undefined||value==='') return null;
  if(typeof value==='number'&&Number.isFinite(value)) return value;
  const ms=Date.parse(String(value));
  return Number.isFinite(ms)?ms:null;
}
function scorePair(score){
  if(Array.isArray(score)) return score.slice(0,2).map(x=>finite(x));
  if(score&&typeof score==='object') return [finite(score.home),finite(score.away)];
  return null;
}
function collectorToObservation(payload){
  if(!payload||String(payload.schema||'')!==COLLECTOR_SCHEMA){
    return {status:'MISMATCH',transport:'XHR-POLL',collectorSchema:String(payload?.schema||''),observedAt:Date.now()};
  }
  const market=payload.market&&typeof payload.market==='object'?payload.market:{};
  const homeLine=market.home_line??payload.home_line;
  const awayLine=market.away_line??payload.away_line;
  const homeOdds=market.home_odds_raw??payload.home_odds_raw;
  const awayOdds=market.away_odds_raw??payload.away_odds_raw;
  const segment=String(market.segment??payload.segment??'').toUpperCase();
  const oddsFormat=normalizeOddsFormat(market.odds_type??payload.odds_type??'HK');
  const sourceTs=parseTime(payload.source_timestamp);
  const receiveTs=parseTime(payload.received_at_utc);
  const observedAt=sourceTs??receiveTs??Date.now();
  const timestampSource=sourceTs!==null?'SOURCE':receiveTs!==null?'INGEST':'LOCAL';
  const eventId=String(payload.event_id??payload.match_id??'');
  const marketId=String(payload.market_id??market.market_id??'');
  const selectionId=String(payload.selection_id??market.selection_id??'');
  const basicValid=Boolean(eventId&&marketId&&selectionId&&payload.home&&payload.away&&segment&&homeLine!==undefined&&awayLine!==undefined&&homeOdds!==undefined&&awayOdds!==undefined);
  return {
    status:basicValid?'VALID':'MISMATCH',
    matchId:eventId,
    eventId,
    leagueId:String(payload.league_id??''),
    sportId:String(payload.sport_id??''),
    home:String(payload.home??''),
    away:String(payload.away??''),
    minute:finite(payload.minute),
    period:String(payload.period??''),
    score:scorePair(payload.score),
    rawHomeLine:String(homeLine??''),
    rawAwayLine:String(awayLine??''),
    homeOddsRaw:finite(homeOdds),
    awayOddsRaw:finite(awayOdds),
    oddsFormat,
    segment,
    marketId,
    selectionId,
    observedAt,
    timestampSource,
    transport:String(payload.transport||'XHR-POLL').toUpperCase(),
    collectorSchema:COLLECTOR_SCHEMA,
    rawCollector:payload
  };
}
function normalizeObservation(input,maxAgeSeconds=30,now=Date.now()){
  const raw={...input};
  let state=VALID_STATES.has(input?.status)?input.status:'UNKNOWN';
  const observedAt=Number(input?.observedAt);
  const ageSeconds=Number.isFinite(observedAt)?Math.max(0,Math.round((now-observedAt)/1000)):null;
  if(state==='VALID'&&ageSeconds===null)state='UNKNOWN';
  if(state==='VALID'&&ageSeconds>maxAgeSeconds)state='STALE';
  const line=decodeHomeLine(input?.rawHomeLine);
  if(state==='VALID'&&line.status!=='VALID')state=line.status;
  if(state==='VALID'&&String(input?.collectorSchema||'')===COLLECTOR_SCHEMA&&String(input?.segment||'').toUpperCase()!=='FT')state='MISMATCH';
  const homeOddsDecimal=normalizeOdds(input?.homeOddsRaw,input?.oddsFormat||'HK');
  const awayOddsDecimal=normalizeOdds(input?.awayOddsRaw,input?.oddsFormat||'HK');
  if(state==='VALID'&&(homeOddsDecimal===null||awayOddsDecimal===null))state='MISMATCH';
  return {
    book:'M88',
    status:state,
    ageSeconds,
    observedAt:Number.isFinite(observedAt)?observedAt:null,
    timestampSource:String(input?.timestampSource||''),
    matchId:String(input?.matchId||input?.eventId||''),
    eventId:String(input?.eventId||input?.matchId||''),
    leagueId:String(input?.leagueId||''),
    sportId:String(input?.sportId||''),
    home:String(input?.home||''),
    away:String(input?.away||''),
    minute:finite(input?.minute),
    period:String(input?.period||''),
    score:scorePair(input?.score),
    rawHomeLine:String(input?.rawHomeLine??''),
    rawAwayLine:String(input?.rawAwayLine??''),
    decodedHomeLine:line.value,
    decodeStatus:line.status,
    decodeReason:line.reason,
    homeOddsRaw:finite(input?.homeOddsRaw),
    awayOddsRaw:finite(input?.awayOddsRaw),
    oddsFormat:normalizeOddsFormat(input?.oddsFormat||'HK'),
    homeOddsDecimal,
    awayOddsDecimal,
    segment:String(input?.segment||'').toUpperCase(),
    marketId:String(input?.marketId||''),
    selectionId:String(input?.selectionId||''),
    transport:String(input?.transport||'DOM').toUpperCase(),
    collectorSchema:String(input?.collectorSchema||''),
    raw
  };
}
function persist(snapshot){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
  try{window.dispatchEvent(new CustomEvent('nomad:m88-update',{detail:{matchId:snapshot.matchId||snapshot.eventId||'',receivedAt:snapshot.receivedAt}}));}catch{}
  return snapshot;
}
function ingest(input){
  const snapshot={...input,book:'M88',receivedAt:Date.now()};
  return persist(snapshot);
}
function ingestCollector(payload){
  const mapped=collectorToObservation(payload);
  const snapshot={...mapped,book:'M88',receivedAt:Date.now()};
  return persist(snapshot);
}
function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function clear(){localStorage.removeItem(STORAGE_KEY)}
window.NOMADM88={STORAGE_KEY,COLLECTOR_SCHEMA,normalizeOdds,decodeHomeLine,collectorToObservation,normalizeObservation,ingest,ingestCollector,read,clear};
})();
