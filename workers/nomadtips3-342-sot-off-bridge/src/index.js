import {openNowgoalSession,fetchNowgoalDetails,NOWGOAL_STATS_SOURCE} from './nowgoal-stats.js';

const VERSION='3.42-sot-off-bridge-v2-nowgoal';
const TC_FEED='https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
const REQUEST_TIMEOUT_MS=9000;
const MIN_TEAM_SCORE=.80;
const MIN_PAIR_SCORE=.86;
const MIN_MARGIN=.07;
const HISTORY_MS=20*60*1000;
const HISTORY_LIMIT=50;

const locks=new Map();
const histories=new Map();

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const finite=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null};

function cleanText(v=''){
  return String(v).replace(/<[^>]*>/g,' ').replace(/\(\s*N\s*\)/ig,' ');
}
function norm(v=''){
  return cleanText(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}
const TOKEN_ALIAS=Object.freeze({utd:'united',st:'saint'});
const STOP=new Set(['fc','cf','sc','afc','ac','fk','sk','club']);
function tokens(v){return norm(v).split(' ').filter(Boolean).map(x=>TOKEN_ALIAS[x]||x).filter(x=>!STOP.has(x))}
function compact(v){return tokens(v).join('')}
export function teamScore(a,b){
  const x=tokens(a),y=tokens(b);if(!x.length||!y.length)return 0;
  const xa=x.join(' '),ya=y.join(' ');if(xa===ya)return 1;if(compact(a)===compact(b))return .995;
  if(xa.length>=5&&ya.length>=5&&(xa.includes(ya)||ya.includes(xa)))return .92;
  const xs=new Set(x),ys=new Set(y);let hit=0;for(const t of xs)if(ys.has(t))hit++;
  const dice=(2*hit)/(xs.size+ys.size||1);
  let prefix=0;for(let i=0;i<Math.min(x.length,y.length);i++){if(x[i]!==y[i])break;prefix++}
  return Math.min(.98,dice+(prefix?Math.min(.08,prefix*.025):0));
}
function scorePair(v){
  if(Array.isArray(v))return [finite(v[0]),finite(v[1])];
  return [finite(v?.home),finite(v?.away)];
}
function scoreExact(a,b){
  const x=scorePair(a),y=scorePair(b);
  return x.every(Number.isFinite)&&y.every(Number.isFinite)?x[0]===y[0]&&x[1]===y[1]:null;
}
function scoreReversed(a,b){
  const x=scorePair(a),y=scorePair(b);
  return x.every(Number.isFinite)&&y.every(Number.isFinite)?x[0]===y[1]&&x[1]===y[0]:false;
}
function pairValid(pair){
  const home=finite(pair?.home),away=finite(pair?.away);
  if(home===null||away===null||home<0||away<0)return null;
  return [home,away];
}
function candidate(eventMatch,nowgoal){
  const h=teamScore(eventMatch?.home,nowgoal?.home),a=teamScore(eventMatch?.away,nowgoal?.away);
  if(h<MIN_TEAM_SCORE||a<MIN_TEAM_SCORE)return null;
  const direct=(h+a)/2;if(direct<MIN_PAIR_SCORE)return null;
  const reverse=(teamScore(eventMatch?.home,nowgoal?.away)+teamScore(eventMatch?.away,nowgoal?.home))/2;
  if(reverse>=direct-.02)return null;
  const exact=scoreExact(eventMatch?.score,nowgoal?.score);
  if(exact!==true)return null;
  if(scoreReversed(eventMatch?.score,nowgoal?.score))return null;
  return {nowgoal,confidence:direct+.08,homeScore:h,awayScore:a};
}
export function chooseNowgoal(eventMatch,nowgoalMatches){
  const rows=[];for(const row of nowgoalMatches||[]){const c=candidate(eventMatch,row);if(c)rows.push(c)}
  rows.sort((a,b)=>b.confidence-a.confidence);
  const best=rows[0],second=rows[1];
  if(!best)return {match:null,reason:'NO_CANDIDATE'};
  if(second&&best.confidence-second.confidence<MIN_MARGIN)return {match:null,reason:'AMBIGUOUS'};
  return {match:best.nowgoal,reason:'MATCHED',confidence:best.confidence,homeScore:best.homeScore,awayScore:best.awayScore};
}
function validateLock(eventMatch,nowgoal){
  if(!nowgoal)return false;
  const h=teamScore(eventMatch?.home,nowgoal?.home),a=teamScore(eventMatch?.away,nowgoal?.away);
  if(h<.78||a<.78)return false;
  const direct=(h+a)/2,reverse=(teamScore(eventMatch?.home,nowgoal?.away)+teamScore(eventMatch?.away,nowgoal?.home))/2;
  if(reverse>=direct-.02)return false;
  return scoreExact(eventMatch?.score,nowgoal?.score)===true;
}
function latestSnapshot(match){
  const rows=Array.isArray(match?.event?.snapshots)?match.event.snapshots:[];
  return [...rows].filter(s=>finite(s?.minute)!==null).sort((a,b)=>finite(a.minute)-finite(b.minute)||(finite(a.observedAt)||0)-(finite(b.observedAt)||0)).at(-1)||null;
}
function saveObservation(match,nowgoal,observedAt){
  const id=String(match?.id||'');if(!id)return null;
  const sot=pairValid(nowgoal?.stats?.shots_on_target),off=pairValid(nowgoal?.stats?.shots_off_target);
  if(!sot&&!off)return null;
  const latest=latestSnapshot(match),minute=finite(latest?.minute)??finite(match?.minute);
  if(minute===null)return null;
  const sourceObservedAt=finite(observedAt)??Date.now();
  const at=finite(latest?.observedAt)??sourceObservedAt;
  const next={minute,observedAt:at,sot,off,nowgoalId:String(nowgoal?.sourceMatchId||'')};
  const cutoff=sourceObservedAt-HISTORY_MS;
  let rows=(histories.get(id)||[]).filter(x=>x.observedAt>=cutoff);
  const idx=rows.findIndex(x=>x.minute===minute);
  if(idx>=0)rows[idx]=next;else rows.push(next);
  rows.sort((a,b)=>a.minute-b.minute||a.observedAt-b.observedAt);
  histories.set(id,rows.slice(-HISTORY_LIMIT));
  return next;
}
function overlayHistory(match){
  const id=String(match?.id||''),hist=histories.get(id)||[],byMinute=new Map(hist.map(x=>[x.minute,x]));
  const snapshots=Array.isArray(match?.event?.snapshots)?match.event.snapshots.map(s=>{
    const minute=finite(s?.minute),obs=minute===null?null:byMinute.get(minute);
    if(!obs)return {...s};
    const next={...s};
    if(obs.sot)next.sot=[...obs.sot];
    if(obs.off)next.off=[...obs.off];
    next.supplement={...(s?.supplement||{}),nowgoalSotOff:{sourceMatchId:obs.nowgoalId,observedAt:obs.observedAt}};
    return next;
  }):[];
  return {...match,event:{...(match?.event||{}),snapshots}};
}

function detailIdsNeeded(tcMatches,roster){
  const byId=new Map((roster||[]).map(row=>[String(row.sourceMatchId),row]));
  const ids=new Set();
  for(const eventMatch of tcMatches||[]){
    const key=String(eventMatch?.id||''),lockedId=locks.get(key);
    if(lockedId){
      const locked=byId.get(String(lockedId));
      if(locked&&validateLock(eventMatch,locked))ids.add(String(locked.sourceMatchId));
      continue;
    }
    const picked=chooseNowgoal(eventMatch,roster);
    if(picked.match)ids.add(String(picked.match.sourceMatchId));
  }
  return [...ids];
}

export function enrichFeed(tcFeed,nowgoalFeed,observedAt=Date.now()){
  const sourceMatches=Array.isArray(nowgoalFeed?.matches)?nowgoalFeed.matches:[],byId=new Map(sourceMatches.map(m=>[String(m.sourceMatchId),m]));
  let matched=0,ambiguous=0,unmatched=0,lockedUnavailable=0,withSot=0,withOff=0;
  const matches=(Array.isArray(tcFeed?.matches)?tcFeed.matches:[]).map(eventMatch=>{
    const key=String(eventMatch?.id||'');let source=null,meta=null;
    const lockedId=locks.get(key);
    if(lockedId){
      const locked=byId.get(String(lockedId));
      if(locked&&validateLock(eventMatch,locked)){
        source=locked;meta={confidence:1,locked:true};
      }else{
        lockedUnavailable++;
        return overlayHistory(eventMatch);
      }
    }else{
      const picked=chooseNowgoal(eventMatch,sourceMatches);
      if(!picked.match){if(picked.reason==='AMBIGUOUS')ambiguous++;else unmatched++;return overlayHistory(eventMatch)}
      source=picked.match;meta={...picked,locked:false};locks.set(key,String(source.sourceMatchId));
    }
    matched++;
    const obs=saveObservation(eventMatch,source,nowgoalFeed?.observedAt??observedAt);
    if(obs?.sot)withSot++;if(obs?.off)withOff++;
    const enriched=overlayHistory(eventMatch);
    return {...enriched,supplement:{...(eventMatch?.supplement||{}),nowgoalSotOff:{matched:true,sourceMatchId:String(source.sourceMatchId),confidence:meta?.confidence??null,locked:Boolean(meta?.locked),fields:{sot:Boolean(obs?.sot),off:Boolean(obs?.off)}}}};
  });
  return {...tcFeed,matches,bridge:{version:VERSION,mode:'SOT_OFF_ONLY',source:'Nowgoal match detail',totalCornerLive:matches.length,nowgoalLive:nowgoalFeed?.rosterCount??sourceMatches.length,detailRequested:nowgoalFeed?.detailRequested??sourceMatches.length,detailUsable:sourceMatches.length,matched,ambiguous,unmatched,lockedUnavailable,withSot,withOff,observedAt:finite(nowgoalFeed?.observedAt)??observedAt}};
}

async function fetchJson(url){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{signal:ac.signal,cache:'no-store',headers:{accept:'application/json'}});
    if(!response.ok)throw new Error(`http_${response.status}`);
    return await response.json();
  }catch(error){if(error?.name==='AbortError')throw new Error('timeout');throw error}
  finally{clearTimeout(timer)}
}

async function liveFeed(){
  let tc;
  try{tc=await fetchJson(TC_FEED)}catch(error){return {status:502,body:{ok:false,version:VERSION,error:`totalcorner_unavailable:${String(error?.message||error)}`,matches:[]}}}
  if(tc?.ok!==true||!Array.isArray(tc?.matches))return {status:502,body:{ok:false,version:VERSION,error:'totalcorner_feed_invalid',matches:[]}};

  const observedAt=Date.now();
  let session;
  try{session=await openNowgoalSession(fetch,observedAt)}catch(error){
    return {status:200,body:{...tc,bridge:{version:VERSION,mode:'SOT_OFF_ONLY',source:'Nowgoal match detail',degraded:true,error:String(error?.message||error),matched:0,totalCornerLive:tc.matches.length,nowgoalLive:0}}};
  }

  const ids=detailIdsNeeded(tc.matches,session.matches);
  const details=await fetchNowgoalDetails(session,ids,fetch,observedAt);
  const detailById=new Map(details.map(item=>[String(item.sourceMatchId),item]));
  const ready=session.matches.map(row=>{
    const detail=detailById.get(String(row.sourceMatchId));
    if(!detail?.ok||!detail.stats)return null;
    return {...row,stats:detail.stats};
  }).filter(Boolean);

  return {status:200,body:enrichFeed(tc,{ok:true,observedAt,matches:ready,rosterCount:session.matches.length,detailRequested:ids.length},observedAt)};
}

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
    if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health')return json({ok:true,version:VERSION,mode:'SOT_OFF_ONLY',totalCorner:TC_FEED,statsSource:NOWGOAL_STATS_SOURCE,changes:['event.snapshots[].sot','event.snapshots[].off'],untouched:['minute','score','attacks','dangerous','corner','markets','settlement']});
    if(url.pathname==='/contract')return json({ok:true,version:VERSION,input:'TotalCorner V3 + Nowgoal match-detail statistics',output:'TotalCorner V3-compatible feed',fills:['event.snapshots[].sot','event.snapshots[].off'],failClosed:true,matchGuards:['HOME/AWAY orientation','exact score','team similarity','ambiguity reject','session lock']});
    if(url.pathname==='/feed'){const result=await liveFeed();return json(result.body,result.status)}
    return json({ok:false,error:'not_found'},404);
  }
};
