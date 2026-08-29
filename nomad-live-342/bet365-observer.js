(()=>{
'use strict';
const STORAGE_KEY='nomadBet365Observation342';
const POOL_KEY='nomadBet365ObservationPool342';
const COLLECTOR_SCHEMA='bet365-referee';
const READY_EVENT='nomad:bet365-observer-ready';
const VALID_STATES=new Set(['VALID','STALE','UNAVAILABLE','UNKNOWN','MISMATCH']);

function finite(v){
  if(v===null||v===undefined||v===''||typeof v==='boolean') return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
function parseOdds(raw,format='AUTO'){
  const s=String(raw??'').trim().replace('−','-');
  if(!s)return null;
  const f=String(format||'AUTO').toUpperCase();
  if(s.includes('/')){
    const [a,b]=s.split('/').map(Number);
    if(Number.isFinite(a)&&Number.isFinite(b)&&b!==0)return Number((1+a/b).toFixed(3));
    return null;
  }
  const n=Number(s.replace(',','.'));
  if(!Number.isFinite(n))return null;
  if(f==='HK'||f==='HONG KONG'||f==='HONGKONG')return n>=0?Number((1+n).toFixed(3)):null;
  if(f==='AMERICAN'){
    if(n>=100)return Number((1+n/100).toFixed(3));
    if(n<=-100)return Number((1+100/Math.abs(n)).toFixed(3));
    return null;
  }
  if(n>=1)return Number(n.toFixed(3));
  return null;
}
function parseLine(raw,trusted=false){
  const s=String(raw??'').trim().replaceAll('−','-').replaceAll('＋','+');
  if(!s)return {value:null,status:'UNAVAILABLE',reason:'empty handicap'};
  const parts=s.split('/').map(x=>x.trim()).filter(Boolean);
  if(parts.length===2){
    const vals=parts.map(Number);
    if(vals.every(Number.isFinite)&&trusted)return {value:Number(((vals[0]+vals[1])/2).toFixed(3)),status:'VALID',reason:'trusted split handicap'};
    if(vals.every(Number.isFinite)&&parts.every(x=>x==='0'||/^[+-]/.test(x)))return {value:Number(((vals[0]+vals[1])/2).toFixed(3)),status:'VALID',reason:'signed split handicap'};
    return {value:null,status:'UNKNOWN',reason:'unsigned split handicap'};
  }
  const n=Number(s);
  if(!Number.isFinite(n))return {value:null,status:'MISMATCH',reason:'unrecognized handicap'};
  if(n===0)return {value:0,status:'VALID',reason:'zero handicap'};
  if(trusted||/^[+-]/.test(s))return {value:n,status:'VALID',reason:trusted?'trusted Bet365 selection handicap':'signed handicap'};
  return {value:null,status:'UNKNOWN',reason:'unsigned handicap'};
}
function parseTime(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number'&&Number.isFinite(v))return v<1e12?v*1000:v;
  const n=Number(v);if(Number.isFinite(n)&&String(v).trim()!=='')return n<1e12?n*1000:n;
  const ms=Date.parse(String(v));return Number.isFinite(ms)?ms:null;
}
function norm(v){
  const stop=new Set(['fc','cf','sc','afc','fk','club']);
  return String(v||'').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean).filter(x=>!stop.has(x));
}
function teamScore(a,b){
  const A=norm(a),B=norm(b);if(!A.length||!B.length)return 0;
  const sa=A.join(' '),sb=B.join(' ');if(sa===sb)return 1;if(sa.includes(sb)||sb.includes(sa))return .92;
  const S=new Set(A),I=B.filter(x=>S.has(x)).length;return I/Math.max(A.length,B.length);
}
function sameTeam(a,b){return teamScore(a,b)>=0.67;}
function scorePair(score){
  if(Array.isArray(score))return score.slice(0,2).map(finite);
  if(score&&typeof score==='object')return [finite(score.home),finite(score.away)];
  const m=String(score||'').match(/(\d+)\D+(\d+)/);return m?[Number(m[1]),Number(m[2])]:null;
}
function collectorToObservation(payload){
  if(!payload||String(payload.schema||'')!==COLLECTOR_SCHEMA)return {status:'MISMATCH',collectorSchema:String(payload?.schema||''),observedAt:Date.now()};
  const market=payload.market&&typeof payload.market==='object'?payload.market:{};
  const eventId=String(payload.event_id??payload.fixture_id??payload.match_id??'');
  const marketId=String(payload.market_id??market.market_id??'');
  const selectionId=String(payload.selection_id??market.selection_id??'');
  const segment=String(market.segment??payload.segment??'').toUpperCase();
  const homeLine=market.home_line??payload.home_line;
  const awayLine=market.away_line??payload.away_line;
  const homeOdds=market.home_odds_raw??payload.home_odds_raw;
  const awayOdds=market.away_odds_raw??payload.away_odds_raw;
  const observedAt=parseTime(payload.source_timestamp)??parseTime(payload.received_at_utc)??Date.now();
  const basicValid=Boolean(eventId&&marketId&&selectionId&&payload.home&&payload.away&&segment&&homeLine!==undefined&&awayLine!==undefined&&homeOdds!==undefined&&awayOdds!==undefined);
  return {
    status:basicValid?'VALID':'MISMATCH',book:'BET365',matchId:eventId,eventId,
    home:String(payload.home||''),away:String(payload.away||''),league:String(payload.league||''),
    minute:finite(payload.minute),period:String(payload.period||''),score:scorePair(payload.score),
    rawHomeLine:String(homeLine??''),rawAwayLine:String(awayLine??''),homeOddsRaw:String(homeOdds??''),awayOddsRaw:String(awayOdds??''),
    oddsFormat:String(market.odds_type??payload.odds_type??'AUTO').toUpperCase(),segment,marketId,selectionId,
    observedAt,timestampSource:payload.source_timestamp?'SOURCE':'INGEST',transport:'WEBSOCKET',collectorSchema:COLLECTOR_SCHEMA
  };
}
function normalizeObservation(input,maxAgeSeconds=30,now=Date.now()){
  let state=VALID_STATES.has(input?.status)?input.status:'UNKNOWN';
  const observedAt=Number(input?.observedAt);const ageSeconds=Number.isFinite(observedAt)?Math.max(0,Math.round((now-observedAt)/1000)):null;
  if(state==='VALID'&&ageSeconds===null)state='UNKNOWN';
  if(state==='VALID'&&ageSeconds>maxAgeSeconds)state='STALE';
  const trusted=String(input?.collectorSchema||'')===COLLECTOR_SCHEMA;
  const homeLine=parseLine(input?.rawHomeLine,trusted),awayLine=parseLine(input?.rawAwayLine,trusted);
  if(state==='VALID'&&homeLine.status!=='VALID')state=homeLine.status;
  if(state==='VALID'&&awayLine.status!=='VALID')state=awayLine.status;
  if(state==='VALID'&&String(input?.segment||'').toUpperCase()!=='FT')state='MISMATCH';
  if(state==='VALID'&&homeLine.value!==null&&awayLine.value!==null&&Math.abs(homeLine.value+awayLine.value)>0.001)state='MISMATCH';
  const homeOddsDecimal=parseOdds(input?.homeOddsRaw,input?.oddsFormat),awayOddsDecimal=parseOdds(input?.awayOddsRaw,input?.oddsFormat);
  if(state==='VALID'&&(homeOddsDecimal===null||awayOddsDecimal===null))state='MISMATCH';
  return {
    book:'BET365',status:state,ageSeconds,observedAt:Number.isFinite(observedAt)?observedAt:null,
    matchId:String(input?.matchId||input?.eventId||''),eventId:String(input?.eventId||input?.matchId||''),
    home:String(input?.home||''),away:String(input?.away||''),league:String(input?.league||''),minute:finite(input?.minute),period:String(input?.period||''),score:scorePair(input?.score),
    rawHomeLine:String(input?.rawHomeLine??''),rawAwayLine:String(input?.rawAwayLine??''),decodedHomeLine:homeLine.value,decodedAwayLine:awayLine.value,decodeStatus:homeLine.status,decodeReason:homeLine.reason,
    homeOddsRaw:input?.homeOddsRaw??'',awayOddsRaw:input?.awayOddsRaw??'',oddsFormat:String(input?.oddsFormat||'AUTO').toUpperCase(),homeOddsDecimal,awayOddsDecimal,
    segment:String(input?.segment||'').toUpperCase(),marketId:String(input?.marketId||''),selectionId:String(input?.selectionId||''),transport:'WEBSOCKET',collectorSchema:String(input?.collectorSchema||'')
  };
}
function readPool(){try{return JSON.parse(localStorage.getItem(POOL_KEY)||'{}')}catch{return {}}}
function writePool(pool){
  const rows=Object.entries(pool).sort((a,b)=>Number(b[1]?.receivedAt||0)-Number(a[1]?.receivedAt||0)).slice(0,250);
  localStorage.setItem(POOL_KEY,JSON.stringify(Object.fromEntries(rows)));
}
function persist(snapshot){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
  const id=String(snapshot.matchId||snapshot.eventId||'');if(id){const pool=readPool();pool[id]=snapshot;writePool(pool);}
  try{window.dispatchEvent(new CustomEvent('nomad:bet365-update',{detail:{matchId:id,receivedAt:snapshot.receivedAt}}));}catch{}
  return snapshot;
}
function ingestCollector(payload){return persist({...collectorToObservation(payload),receivedAt:Date.now()})}
function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function readForMatch(matchId,home='',away=''){
  const pool=readPool(),id=String(matchId||'');if(id&&pool[id])return pool[id];
  const rows=Object.values(pool).sort((a,b)=>Number(b?.receivedAt||0)-Number(a?.receivedAt||0));
  let best=null,bestScore=0;
  for(const row of rows){const score=(teamScore(row?.home,home)+teamScore(row?.away,away))/2;if(score>bestScore){best=row;bestScore=score;}}
  return bestScore>=0.67?best:null;
}
function clear(){localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(POOL_KEY)}
function eventPayload(detail){if(detail&&typeof detail==='object')return detail;if(typeof detail==='string'){try{return JSON.parse(detail)}catch{return null}}return null;}
window.addEventListener('nomad:bet365-collector-payload',event=>{const payload=eventPayload(event?.detail);if(payload)ingestCollector(payload);});
window.NOMADBET365={STORAGE_KEY,POOL_KEY,COLLECTOR_SCHEMA,parseOdds,parseLine,teamScore,sameTeam,collectorToObservation,normalizeObservation,ingestCollector,read,readForMatch,clear};
try{if(document.documentElement)document.documentElement.dataset.nomadBet365ObserverReady='1';window.dispatchEvent(new CustomEvent(READY_EVENT,{detail:{schema:COLLECTOR_SCHEMA}}));}catch{}
})();