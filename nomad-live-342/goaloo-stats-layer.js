(()=>{
'use strict';

const BASE='https://nomadtips3-goaloo-stats-342-test.mccarey-supon.workers.dev';
const PATH='/feed';
const TIMEOUT_MS=7000;
const MAX_MINUTE_GAP=5;
const LOCK_MAX_MINUTE_GAP=6;
const MIN_TEAM_SCORE=.80;
const MIN_PAIR_SCORE=.86;
const MIN_MARGIN=.07;
const SESSION_KEY='nomad342GoalooStatsLocksV1';
let cache={at:0,payload:null,promise:null};

function finite(v){if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function norm(v=''){
  return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
const TOKEN_ALIAS=Object.freeze({utd:'united',st:'saint'});
const STOP=new Set(['fc','cf','sc','afc','ac','fk','sk','club']);
function tokens(v){return norm(v).split(' ').filter(Boolean).map(x=>TOKEN_ALIAS[x]||x).filter(x=>!STOP.has(x))}
function compact(v){return tokens(v).join('')}
function teamScore(a,b){
  const x=tokens(a),y=tokens(b);if(!x.length||!y.length)return 0;
  const xa=x.join(' '),ya=y.join(' ');if(xa===ya)return 1;if(compact(a)===compact(b))return .995;
  if(xa.length>=5&&ya.length>=5&&(xa.includes(ya)||ya.includes(xa)))return .92;
  const xs=new Set(x),ys=new Set(y);let hit=0;for(const t of xs)if(ys.has(t))hit++;
  const dice=(2*hit)/(xs.size+ys.size||1);
  let prefix=0;for(let i=0;i<Math.min(x.length,y.length);i++){if(x[i]!==y[i])break;prefix++}
  return Math.min(.98,dice+(prefix?Math.min(.08,prefix*.025):0));
}
function leagueScore(a,b){
  const x=norm(a),y=norm(b);if(!x||!y)return null;if(x===y)return 1;
  const xs=new Set(tokens(a)),ys=new Set(tokens(b));let hit=0;for(const t of xs)if(ys.has(t))hit++;
  return hit/Math.max(1,Math.max(xs.size,ys.size));
}
function scorePair(v){
  if(Array.isArray(v))return [finite(v[0]),finite(v[1])];
  return [finite(v?.home),finite(v?.away)];
}
function scoreExact(a,b){const x=scorePair(a),y=scorePair(b);return x.every(Number.isFinite)&&y.every(Number.isFinite)?x[0]===y[0]&&x[1]===y[1]:null}
function scoreReversed(a,b){const x=scorePair(a),y=scorePair(b);return x.every(Number.isFinite)&&y.every(Number.isFinite)?x[0]===y[1]&&x[1]===y[0]:false}
function loadLocks(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'{}')||{}}catch{return {}}}
function saveLocks(value){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(value))}catch{}}
function pairValid(pair,{percent=false}={}){
  const h=finite(pair?.home),a=finite(pair?.away);if(h===null||a===null||h<0||a<0)return null;
  if(percent){const total=h+a;if(total<98||total>102)return null}
  return [h,a];
}
function candidate(eventMatch,goaloo){
  const h=teamScore(eventMatch?.home,goaloo?.home),a=teamScore(eventMatch?.away,goaloo?.away);
  if(h<MIN_TEAM_SCORE||a<MIN_TEAM_SCORE)return null;
  const direct=(h+a)/2;
  if(direct<MIN_PAIR_SCORE)return null;
  const reverse=(teamScore(eventMatch?.home,goaloo?.away)+teamScore(eventMatch?.away,goaloo?.home))/2;
  if(reverse>=direct-.02)return null;
  const exact=scoreExact(eventMatch?.score,goaloo?.score);
  if(exact===false)return null;
  if(scoreReversed(eventMatch?.score,goaloo?.score))return null;
  const em=finite(eventMatch?.minute),gm=finite(goaloo?.minute),minuteGap=em!==null&&gm!==null?Math.abs(em-gm):null;
  if(minuteGap!==null&&minuteGap>MAX_MINUTE_GAP)return null;
  const ls=leagueScore(eventMatch?.league,goaloo?.league);
  let confidence=direct;
  if(exact===true)confidence+=.06;
  if(minuteGap!==null)confidence+=minuteGap<=2?.04:minuteGap<=4?.02:0;
  if(ls!==null&&ls>=.5)confidence+=Math.min(.04,ls*.04);
  return {goaloo,confidence,homeScore:h,awayScore:a,minuteGap,leagueScore:ls};
}
function choose(eventMatch,goalooMatches){
  const rows=[];for(const g of goalooMatches||[]){const c=candidate(eventMatch,g);if(c)rows.push(c)}
  rows.sort((a,b)=>b.confidence-a.confidence);
  const best=rows[0],second=rows[1];
  if(!best)return {match:null,reason:'NO_CANDIDATE'};
  if(second&&best.confidence-second.confidence<MIN_MARGIN)return {match:null,reason:'AMBIGUOUS'};
  return {match:best.goaloo,reason:'MATCHED',confidence:best.confidence,minuteGap:best.minuteGap,homeScore:best.homeScore,awayScore:best.awayScore,leagueScore:best.leagueScore};
}
function validateLock(eventMatch,goaloo){
  if(!goaloo)return false;
  if(teamScore(eventMatch?.home,goaloo?.home)<.78||teamScore(eventMatch?.away,goaloo?.away)<.78)return false;
  const reverse=(teamScore(eventMatch?.home,goaloo?.away)+teamScore(eventMatch?.away,goaloo?.home))/2;
  const direct=(teamScore(eventMatch?.home,goaloo?.home)+teamScore(eventMatch?.away,goaloo?.away))/2;
  if(reverse>=direct-.02)return false;
  const exact=scoreExact(eventMatch?.score,goaloo?.score);if(exact===false)return false;
  const em=finite(eventMatch?.minute),gm=finite(goaloo?.minute);if(em!==null&&gm!==null&&Math.abs(em-gm)>LOCK_MAX_MINUTE_GAP)return false;
  return true;
}
async function fetchGoaloo(){
  const now=Date.now();if(cache.payload&&now-cache.at<4500)return cache.payload;if(cache.promise)return cache.promise;
  cache.promise=(async()=>{
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),TIMEOUT_MS);
    try{
      const response=await fetch(`${BASE}${PATH}?_=${now}`,{cache:'no-store',signal:ac.signal});
      if(!response.ok)throw new Error(`goaloo_stats_http_${response.status}`);
      const data=await response.json();if(data?.ok!==true||!Array.isArray(data?.matches))throw new Error(data?.error||'goaloo_stats_invalid');
      cache={at:Date.now(),payload:data,promise:null};return data;
    }finally{clearTimeout(timer)}
  })().catch(error=>{cache.promise=null;throw error});
  return cache.promise;
}
function inject(match,goaloo,meta){
  const sot=pairValid(goaloo?.stats?.shots_on_target);
  const off=pairValid(goaloo?.stats?.shots_off_target);
  const possession=pairValid(goaloo?.stats?.possession,{percent:true});
  const snapshots=Array.isArray(match?.event?.snapshots)?match.event.snapshots.map(s=>({...s})):[];
  let latestIndex=-1,latestMinute=-Infinity,latestAt=-Infinity;
  snapshots.forEach((s,i)=>{const m=finite(s?.minute),at=finite(s?.observedAt)||0;if(m!==null&&(m>latestMinute||(m===latestMinute&&at>=latestAt))){latestMinute=m;latestAt=at;latestIndex=i}});
  if(latestIndex>=0){
    const s=snapshots[latestIndex];
    if(sot)s.sot=sot;if(off)s.off=off;if(possession)s.possession=possession;
    s.supplement={source:'Goaloo',sourceMatchId:String(goaloo.sourceMatchId),observedAt:finite(meta?.observedAt),confidence:meta?.confidence??null,provenance:goaloo?.stats?.provenance||{}};
  }
  return {...match,event:{...(match.event||{}),snapshots},supplement:{goaloo:{sourceMatchId:String(goaloo.sourceMatchId),matched:true,confidence:meta?.confidence??null,minuteGap:meta?.minuteGap??null,homeScore:meta?.homeScore??null,awayScore:meta?.awayScore??null,leagueScore:meta?.leagueScore??null,observedAt:finite(meta?.observedAt),fields:{sot:Boolean(sot),off:Boolean(off),possession:Boolean(possession)}}}};
}
async function enrichMatches(matches){
  const original=Array.isArray(matches)?matches:[];
  let payload;
  try{payload=await fetchGoaloo()}catch(error){window.__nomad342GoalooStatsState={ok:false,error:String(error?.message||error),matched:0,total:original.length,updatedAt:Date.now()};return original}
  const goaloo=payload.matches||[],byId=new Map(goaloo.map(m=>[String(m.sourceMatchId),m])),locks=loadLocks();
  let matched=0,ambiguous=0,unmatched=0,lockedUnavailable=0;
  const out=original.map(eventMatch=>{
    const key=String(eventMatch?.id||'');let source=null,meta=null;
    const lockedId=locks[key];
    if(lockedId){
      const locked=byId.get(String(lockedId));
      if(locked&&validateLock(eventMatch,locked)){source=locked;meta={confidence:1,minuteGap:finite(eventMatch?.minute)!==null&&finite(locked?.minute)!==null?Math.abs(finite(eventMatch.minute)-finite(locked.minute)):null,observedAt:payload.observedAt,locked:true}}
      else{lockedUnavailable++;return eventMatch}
    }else{
      const picked=choose(eventMatch,goaloo);
      if(!picked.match){if(picked.reason==='AMBIGUOUS')ambiguous++;else unmatched++;return eventMatch}
      source=picked.match;meta={...picked,observedAt:payload.observedAt,locked:false};locks[key]=String(source.sourceMatchId);
    }
    matched++;return inject(eventMatch,source,meta);
  });
  saveLocks(locks);
  window.__nomad342GoalooStatsState={ok:true,matched,total:original.length,ambiguous,unmatched,lockedUnavailable,goalooLive:goaloo.length,observedAt:payload.observedAt,updatedAt:Date.now()};
  return out;
}

window.NOMAD342_GOALOO_STATS=Object.freeze({enrichMatches,teamScore,choose,validateLock,base:BASE});
})();
