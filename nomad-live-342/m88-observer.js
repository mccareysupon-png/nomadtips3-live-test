(()=>{
'use strict';
const STORAGE_KEY='nomadM88Observation342';
const VALID_STATES=new Set(['VALID','STALE','UNAVAILABLE','UNKNOWN','MISMATCH']);

function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function normalizeOdds(raw,format='HK'){
  const n=finite(raw); if(n===null||n<0)return null;
  const f=String(format||'HK').toUpperCase();
  if(f==='HK') return Number((1+n).toFixed(3));
  if(f==='DECIMAL') return n>=1?Number(n.toFixed(3)):null;
  return null;
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
function normalizeObservation(input,maxAgeSeconds=30,now=Date.now()){
  const raw={...input};
  let state=VALID_STATES.has(input?.status)?input.status:'UNKNOWN';
  const observedAt=Number(input?.observedAt);
  const ageSeconds=Number.isFinite(observedAt)?Math.max(0,Math.round((now-observedAt)/1000)):null;
  if(state==='VALID'&&ageSeconds===null)state='UNKNOWN';
  if(state==='VALID'&&ageSeconds>maxAgeSeconds)state='STALE';
  const line=decodeHomeLine(input?.rawHomeLine);
  if(state==='VALID'&&line.status!=='VALID')state=line.status;
  const homeOddsDecimal=normalizeOdds(input?.homeOddsRaw,input?.oddsFormat||'HK');
  const awayOddsDecimal=normalizeOdds(input?.awayOddsRaw,input?.oddsFormat||'HK');
  if(state==='VALID'&&(homeOddsDecimal===null||awayOddsDecimal===null))state='MISMATCH';
  return {
    book:'M88',
    status:state,
    ageSeconds,
    observedAt:Number.isFinite(observedAt)?observedAt:null,
    matchId:String(input?.matchId||''),
    home:String(input?.home||''),
    away:String(input?.away||''),
    minute:finite(input?.minute),
    score:Array.isArray(input?.score)?input.score.slice(0,2).map(x=>finite(x)):null,
    rawHomeLine:String(input?.rawHomeLine??''),
    rawAwayLine:String(input?.rawAwayLine??''),
    decodedHomeLine:line.value,
    decodeStatus:line.status,
    decodeReason:line.reason,
    homeOddsRaw:finite(input?.homeOddsRaw),
    awayOddsRaw:finite(input?.awayOddsRaw),
    oddsFormat:String(input?.oddsFormat||'HK').toUpperCase(),
    homeOddsDecimal,
    awayOddsDecimal,
    transport:String(input?.transport||'DOM'),
    raw
  };
}
function ingest(input){
  const snapshot={...input,book:'M88',receivedAt:Date.now()};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
  return snapshot;
}
function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
function clear(){localStorage.removeItem(STORAGE_KEY)}
window.NOMADM88={STORAGE_KEY,normalizeOdds,decodeHomeLine,normalizeObservation,ingest,read,clear};
})();