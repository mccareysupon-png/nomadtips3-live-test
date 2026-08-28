import {parseToday} from './totalcorner.js';

const VERSION='3.42';
const SOURCE_NAME='TotalCorner';
const SOURCE_HOST='https://www.totalcorner.com';
const TODAY_URL=`${SOURCE_HOST}/match/today/`;
const CACHE_MS=10000;
const SOURCE_STALE_MS=90000;
const HISTORY_MS=12*60*1000;
const DETAIL_MINUTE_FROM=45;
const DETAIL_MINUTE_TO=100;
const DETAIL_MODE='TODAY_ONLY';
const DETAIL_UNAVAILABLE_REASON='source_http_403';
const REQUEST_TIMEOUT_MS=9000;

const THSCORE_SOURCE='THScore';
const THSCORE_HOST='https://api2.thscore.info';
const THSCORE_SCHEDULE_PATH='/football_th/schedule/basic.aspx';
const THSCORE_INPLAY_PATH='/football_th/odds/inplay.aspx';
const THSCORE_SCHEDULE_CACHE_MS=65000;
const THSCORE_ODDS_CACHE_MS=8000;
const THSCORE_TIMEOUT_MS=8500;
const THSCORE_MATCH_THRESHOLD=80;
const THSCORE_AMBIGUITY_GAP=8;
const THSCORE_COMPANY_PRIORITY=[47,8,31,24,17];
const THSCORE_COMPANIES=Object.freeze({
  47:'Pinnacle',8:'Bet365',31:'SBOBET',24:'12Bet',17:'Mansion88',
  1:'Macauslot',3:'Crown',4:'Ladbrokes',7:'SNAI',9:'William Hill',12:'Easybets',
  14:'Vcbet',19:'Interwette',22:'10BET',23:'188bet',35:'Wewbet',42:'18bet',48:'HK Jockey Club',
});

const CAPABILITIES=Object.freeze({
  today:true,
  minute:true,
  score:true,
  attacks:true,
  dangerous:true,
  corner:true,
  sot:false,
  off:false,
  detail:false,
});

const state={
  scanning:null,
  lastScanAt:0,
  lastSuccessAt:0,
  lastError:null,
  cycle:0,
  matches:[],
  history:new Map(),
  freshness:new Map(),
  detailDiagnostics:{eligible:0,attempts:0,fetchErrors:0,parseInvalid:0,successes:0,skipped:0,errors:{}},
};

const thscoreState={
  scheduleDate:'',
  scheduleAt:0,
  scheduleRows:[],
  schedulePending:null,
  oddsKey:'',
  oddsAt:0,
  oddsRows:[],
  oddsPending:null,
};

const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const now=()=>Date.now();
const iso=t=>t?new Date(t).toISOString():null;
const finite=v=>{
  if(v===null||v===undefined||v===''||typeof v==='boolean') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};
const pairArray=p=>[finite(p?.home),finite(p?.away)];

function sourceUrl(url,token){
  const u=new URL(url);
  u.searchParams.set('_nomad342_cycle',String(token));
  return u.toString();
}

async function fetchHtml(url,token){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(sourceUrl(url,token),{
      signal:ac.signal,
      cache:'no-store',
      headers:{
        'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        'accept':'text/html,application/xhtml+xml',
        'accept-language':'en-US,en;q=0.9',
        'cache-control':'no-cache, no-store',
        'pragma':'no-cache',
      },
    });
    if(!response.ok) throw new Error(`source_http_${response.status}`);
    const text=await response.text();
    if(text.length<300) throw new Error('source_body_too_small');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function mergePair(primary,fallback){
  return {
    home:finite(primary?.home)??finite(fallback?.home),
    away:finite(primary?.away)??finite(fallback?.away),
  };
}

function mergeMatch(row,observedAt){
  const score=row.score;
  const stats={
    attacks:mergePair(null,row.stats?.attacks),
    dangerous:mergePair(null,row.stats?.dangerous),
    sot:{home:null,away:null},
    off:{home:null,away:null},
    corner:mergePair(null,row.stats?.corner),
  };
  return {
    id:String(row.id),
    league:row.league||null,
    home:row.home||null,
    away:row.away||null,
    minute:finite(row.minute),
    score:{home:finite(score?.home),away:finite(score?.away)},
    stats,
    source:{name:SOURCE_NAME,observedAt,detail:false,mode:DETAIL_MODE},
  };
}

function fingerprint(m){
  return JSON.stringify({minute:m.minute,score:m.score,stats:m.stats});
}

function updateFreshness(m,observedAt){
  const fp=fingerprint(m);
  const prev=state.freshness.get(m.id);
  const changedAt=prev?.fingerprint===fp?prev.changedAt:observedAt;
  state.freshness.set(m.id,{fingerprint:fp,changedAt,lastSeenAt:observedAt});
  return {...m,freshness:{changedAt,lastSeenAt:observedAt,stale:observedAt-changedAt>SOURCE_STALE_MS}};
}

function snapshotFromMatch(m,observedAt){
  return {
    minute:m.minute,
    observedAt,
    attacks:pairArray(m.stats.attacks),
    dangerous:pairArray(m.stats.dangerous),
    sot:[null,null],
    off:[null,null],
    corner:pairArray(m.stats.corner),
  };
}

function sameSnapshot(a,b){
  return a&&b&&JSON.stringify({minute:a.minute,attacks:a.attacks,dangerous:a.dangerous,sot:a.sot,off:a.off,corner:a.corner})===JSON.stringify({minute:b.minute,attacks:b.attacks,dangerous:b.dangerous,sot:b.sot,off:b.off,corner:b.corner});
}

function updateHistory(m,observedAt){
  const next=snapshotFromMatch(m,observedAt);
  const previous=state.history.get(m.id)||[];
  const cutoff=observedAt-HISTORY_MS;
  let rows=previous.filter(x=>x.observedAt>=cutoff);
  if(rows.length&&rows[rows.length-1].minute===next.minute){
    if(!sameSnapshot(rows[rows.length-1],next)) rows=[...rows.slice(0,-1),next];
  }else if(!sameSnapshot(rows[rows.length-1],next)) rows.push(next);
  state.history.set(m.id,rows.slice(-40));
  return rows.slice(-40);
}

function cleanup(activeIds,observedAt){
  for(const [id,rows] of state.history){
    const recent=rows.filter(x=>x.observedAt>=observedAt-HISTORY_MS);
    if(!activeIds.has(id)&&!recent.length) state.history.delete(id);
    else state.history.set(id,recent);
  }
  for(const [id,meta] of state.freshness){
    if(!activeIds.has(id)&&observedAt-meta.lastSeenAt>HISTORY_MS) state.freshness.delete(id);
  }
}

async function performScan(){
  const started=now();
  state.cycle+=1;
  const detailDiagnostics={eligible:0,attempts:0,fetchErrors:0,parseInvalid:0,successes:0,skipped:0,errors:{}};
  try{
    const todayHtml=await fetchHtml(TODAY_URL,started);
    const parsed=parseToday(todayHtml,SOURCE_HOST)
      .filter(m=>Number.isFinite(m.minute)&&m.minute>=1&&m.minute<=130)
      .filter(m=>Number.isFinite(m.score?.home)&&Number.isFinite(m.score?.away));

    const enriched=parsed.map(row=>{
      if(row.minute>=DETAIL_MINUTE_FROM&&row.minute<=DETAIL_MINUTE_TO){
        detailDiagnostics.eligible+=1;
        detailDiagnostics.skipped+=1;
      }
      const match=updateFreshness(mergeMatch(row,started),started);
      const snapshots=updateHistory(match,started);
      return {
        id:match.id,
        league:match.league,
        home:match.home,
        away:match.away,
        minute:match.minute,
        score:[match.score.home,match.score.away],
        event:{snapshots},
        source:match.source,
        freshness:match.freshness,
      };
    });

    const activeIds=new Set(enriched.map(m=>m.id));
    cleanup(activeIds,started);
    state.matches=enriched;
    state.detailDiagnostics=detailDiagnostics;
    state.lastScanAt=started;
    state.lastSuccessAt=now();
    state.lastError=null;
  }catch(error){
    state.detailDiagnostics=detailDiagnostics;
    state.lastScanAt=started;
    state.lastError=String(error?.message||error);
  }
  return feedPayload();
}

async function scan(force=false){
  if(!force&&state.lastScanAt&&now()-state.lastScanAt<CACHE_MS) return feedPayload();
  if(state.scanning) return state.scanning;
  state.scanning=performScan().finally(()=>{state.scanning=null;});
  return state.scanning;
}

function sourceMeta(){
  return {
    name:SOURCE_NAME,
    host:SOURCE_HOST,
    scanUrl:TODAY_URL,
    cacheSeconds:CACHE_MS/1000,
    staleSeconds:SOURCE_STALE_MS/1000,
    detailMode:DETAIL_MODE,
    detailWindow:`${DETAIL_MINUTE_FROM}-${DETAIL_MINUTE_TO}`,
    detailUnavailableReason:DETAIL_UNAVAILABLE_REASON,
    capabilities:CAPABILITIES,
  };
}

function feedPayload(){
  const matches=state.matches||[];
  const detail=state.detailDiagnostics||{};
  return {
    ok:!state.lastError,
    version:VERSION,
    mode:'LIVE_EVENT_FEED',
    updatedAt:iso(state.lastSuccessAt),
    cycle:state.cycle,
    source:sourceMeta(),
    counts:{
      live:matches.length,
      detailed:0,
      stale:matches.filter(m=>m.freshness?.stale).length,
      detailEligible:Number(detail.eligible||0),
      detailAttempts:0,
      detailFetchErrors:0,
      detailParseInvalid:0,
      detailSuccess:0,
      detailSkipped:Number(detail.skipped||0),
    },
    detailErrors:{},
    matches,
    lastError:state.lastError,
  };
}

function healthPayload(){
  return {
    ok:!state.lastError,
    version:VERSION,
    component:'totalcorner-inlet',
    source:sourceMeta(),
    cycle:state.cycle,
    lastScanAt:iso(state.lastScanAt),
    lastSuccessAt:iso(state.lastSuccessAt),
    lastError:state.lastError,
    liveMatches:state.matches.length,
    staleMatches:state.matches.filter(m=>m.freshness?.stale).length,
    historyMatches:state.history.size,
    detailDiagnostics:state.detailDiagnostics,
  };
}

function bangkokDate(ts=Date.now()){
  return new Date(ts+7*60*60*1000).toISOString().slice(0,10);
}

function parseBangkokTime(value){
  if(value===null||value===undefined||value==='') return null;
  if(typeof value==='number'&&Number.isFinite(value)){
    if(value>1e12) return value;
    if(value>1e9) return value*1000;
  }
  const raw=String(value).trim();
  if(/^\d{13}$/.test(raw)) return Number(raw);
  if(/^\d{10}$/.test(raw)) return Number(raw)*1000;
  if(/[zZ]|[+-]\d\d:?\d\d$/.test(raw)){
    const t=Date.parse(raw);
    return Number.isFinite(t)?t:null;
  }
  const normalized=raw.replace(/\//g,'-').replace(' ','T');
  const t=Date.parse(`${normalized}+07:00`);
  return Number.isFinite(t)?t:null;
}

function collectMatchObjects(value,out=[],seen=new Set(),depth=0){
  if(value===null||value===undefined||depth>7) return out;
  if(typeof value==='object'){
    if(seen.has(value)) return out;
    seen.add(value);
  }
  if(Array.isArray(value)){
    for(const item of value) collectMatchObjects(item,out,seen,depth+1);
    return out;
  }
  if(typeof value==='object'){
    if(value.matchId!==undefined&&value.matchId!==null) out.push(value);
    for(const v of Object.values(value)){
      if(v&&typeof v==='object') collectMatchObjects(v,out,seen,depth+1);
    }
  }
  return out;
}

async function fetchThscoreJson(env,path,params={}){
  if(!env?.THSCORE_API_KEY) throw new Error('THSCORE_API_KEY_MISSING');
  const url=new URL(path,THSCORE_HOST);
  url.searchParams.set('api_key',String(env.THSCORE_API_KEY));
  for(const [key,value] of Object.entries(params)){
    if(value!==null&&value!==undefined&&String(value)!=='') url.searchParams.set(key,String(value));
  }
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),THSCORE_TIMEOUT_MS);
  try{
    const response=await fetch(url.toString(),{signal:ac.signal,cache:'no-store',headers:{accept:'application/json,text/plain,*/*'}});
    if(!response.ok) throw new Error(`THSCORE_HTTP_${response.status}`);
    const text=(await response.text()).replace(/^\uFEFF/,'').trim();
    if(!text) throw new Error('THSCORE_EMPTY_BODY');
    try{return JSON.parse(text);}catch{throw new Error('THSCORE_INVALID_JSON');}
  } finally {
    clearTimeout(timer);
  }
}

async function thscoreSchedule(env){
  const date=bangkokDate();
  if(thscoreState.scheduleDate===date&&thscoreState.scheduleAt&&now()-thscoreState.scheduleAt<THSCORE_SCHEDULE_CACHE_MS) return thscoreState.scheduleRows;
  if(thscoreState.schedulePending) return thscoreState.schedulePending;
  thscoreState.schedulePending=(async()=>{
    const data=await fetchThscoreJson(env,THSCORE_SCHEDULE_PATH,{date});
    const rows=collectMatchObjects(data).filter(x=>x.homeName&&x.awayName&&x.matchId!==undefined);
    thscoreState.scheduleDate=date;
    thscoreState.scheduleAt=now();
    thscoreState.scheduleRows=rows;
    return rows;
  })().finally(()=>{thscoreState.schedulePending=null;});
  return thscoreState.schedulePending;
}

async function thscoreInplay(env,matchIds){
  const ids=[...new Set(matchIds.map(String).filter(Boolean))].slice(0,50).sort();
  if(!ids.length) return [];
  const key=ids.join(',');
  if(thscoreState.oddsKey===key&&thscoreState.oddsAt&&now()-thscoreState.oddsAt<THSCORE_ODDS_CACHE_MS) return thscoreState.oddsRows;
  if(thscoreState.oddsPending&&thscoreState.oddsKey===key) return thscoreState.oddsPending;
  thscoreState.oddsKey=key;
  thscoreState.oddsPending=(async()=>{
    const data=await fetchThscoreJson(env,THSCORE_INPLAY_PATH,{matchId:key,companyId:THSCORE_COMPANY_PRIORITY.join(',')});
    const rows=collectMatchObjects(data).filter(x=>String(x.matchId||'')&&x.type!==undefined);
    thscoreState.oddsAt=now();
    thscoreState.oddsRows=rows;
    return rows;
  })().finally(()=>{thscoreState.oddsPending=null;});
  return thscoreState.oddsPending;
}

const NAME_NOISE=new Set(['fc','cf','afc','sc','ac','fk','sk','club','the']);
function canonicalName(value,dropNoise=false){
  const expanded=String(value||'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/\butd\b/g,' united ')
    .replace(/\bintl\b/g,' international ')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim();
  if(!dropNoise) return expanded;
  return expanded.split(/\s+/).filter(t=>t&&!NAME_NOISE.has(t)).join(' ');
}
function tokenDice(a,b){
  const A=new Set(a.split(/\s+/).filter(Boolean)),B=new Set(b.split(/\s+/).filter(Boolean));
  if(!A.size||!B.size) return 0;
  let common=0;for(const t of A)if(B.has(t))common+=1;
  return 2*common/(A.size+B.size);
}
function editSimilarity(a,b){
  if(a===b) return a?1:0;
  if(!a||!b) return 0;
  const m=a.length,n=b.length;
  if(Math.abs(m-n)>Math.max(m,n)*0.65) return 0;
  let prev=Array.from({length:n+1},(_,i)=>i);
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++) cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return 1-prev[n]/Math.max(m,n);
}
function teamSimilarity(a,b){
  const x=canonicalName(a),y=canonicalName(b);
  if(!x||!y) return 0;
  if(x===y) return 1;
  const xc=canonicalName(a,true),yc=canonicalName(b,true);
  if(xc&&xc===yc) return .97;
  const containment=(xc.includes(yc)||yc.includes(xc))?Math.min(xc.length,yc.length)/Math.max(xc.length,yc.length):0;
  return Math.max(tokenDice(xc,yc),editSimilarity(xc,yc),containment*.94);
}
function leagueSimilarity(a,b){
  if(!a||!b) return .5;
  return teamSimilarity(a,b);
}
function expectedKickoff(candidate,at=Date.now()){
  const minute=finite(candidate?.minute);
  if(minute===null) return null;
  const elapsed=minute+(minute>45?15:0);
  return at-elapsed*60*1000;
}
function kickoffScore(candidate,row){
  const expected=expectedKickoff(candidate);
  const scheduled=parseBangkokTime(row?.matchTime);
  if(expected===null||scheduled===null) return .5;
  const d=Math.abs(expected-scheduled)/60000;
  if(d<=15) return 1;
  if(d<=30) return .75;
  if(d<=60) return .35;
  if(d<=90) return .1;
  return 0;
}
function liveStatus(row){return [1,2,3,4,5].includes(Number(row?.status));}
function scoreScore(candidate,row){
  const h=finite(candidate?.score?.[0]),a=finite(candidate?.score?.[1]);
  const rh=finite(row?.homeScore),ra=finite(row?.awayScore);
  if(h===null||a===null||rh===null||ra===null) return .5;
  return h===rh&&a===ra?1:0;
}
function mapperCandidate(candidate,row){
  if(!liveStatus(row)) return null;
  const h=teamSimilarity(candidate.home,row.homeName),a=teamSimilarity(candidate.away,row.awayName);
  if(h<.68||a<.68) return null;
  const swapped=(teamSimilarity(candidate.home,row.awayName)+teamSimilarity(candidate.away,row.homeName))/2;
  const direct=(h+a)/2;
  if(swapped>direct+.03) return null;
  const league=leagueSimilarity(candidate.league,row.leagueName||row.leagueShortName);
  const time=kickoffScore(candidate,row);
  const score=scoreScore(candidate,row);
  const confidence=h*30+a*30+league*10+time*15+score*15;
  return {row,confidence:Number(confidence.toFixed(1)),parts:{home:Number((h*100).toFixed(1)),away:Number((a*100).toFixed(1)),league:Number((league*100).toFixed(1)),kickoff:Number((time*100).toFixed(1)),score:Number((score*100).toFixed(1))}};
}
function mapThscoreMatch(candidate,scheduleRows){
  const ranked=scheduleRows.map(row=>mapperCandidate(candidate,row)).filter(Boolean).sort((a,b)=>b.confidence-a.confidence);
  const best=ranked[0],second=ranked[1];
  if(!best||best.confidence<THSCORE_MATCH_THRESHOLD) return {status:'MISMATCH',reason:'THSCORE MATCH NOT CONFIDENT',best:best||null,second:second||null};
  if(second&&best.confidence-second.confidence<THSCORE_AMBIGUITY_GAP) return {status:'AMBIGUOUS',reason:'THSCORE MATCH AMBIGUOUS',best,second};
  return {status:'VALID',reason:'THSCORE MATCH MAPPED',best,second};
}

function normalizeAsianOdds(homeRaw,awayRaw,env){
  const home=finite(homeRaw),away=finite(awayRaw);
  if(home===null||away===null||home<0||away<0) return {status:'MISMATCH',format:'UNKNOWN',homeDecimal:null,awayDecimal:null,reason:'THSCORE ODDS INVALID'};
  const forced=String(env?.THSCORE_ASIAN_ODDS_FORMAT||'AUTO').trim().toUpperCase();
  if(forced==='HK') return {status:'VALID',format:'HK',homeDecimal:Number((1+home).toFixed(3)),awayDecimal:Number((1+away).toFixed(3)),reason:'THSCORE HK ODDS'};
  if(forced==='DECIMAL'){
    if(home<1||away<1) return {status:'MISMATCH',format:'DECIMAL',homeDecimal:null,awayDecimal:null,reason:'THSCORE DECIMAL ODDS INVALID'};
    return {status:'VALID',format:'DECIMAL',homeDecimal:Number(home.toFixed(3)),awayDecimal:Number(away.toFixed(3)),reason:'THSCORE DECIMAL ODDS'};
  }
  if(home<1||away<1) return {status:'VALID',format:'HK',homeDecimal:Number((1+home).toFixed(3)),awayDecimal:Number((1+away).toFixed(3)),reason:'THSCORE HK ODDS INFERRED'};
  if(home>=1.5&&away>=1.5) return {status:'VALID',format:'DECIMAL',homeDecimal:Number(home.toFixed(3)),awayDecimal:Number(away.toFixed(3)),reason:'THSCORE DECIMAL ODDS INFERRED'};
  return {status:'UNKNOWN',format:'UNKNOWN',homeDecimal:null,awayDecimal:null,reason:'THSCORE ODDS FORMAT UNVERIFIED'};
}

function rowTime(row){return parseBangkokTime(row?.changeTime)??0;}
function selectHandicapRows(matchId,oddsRows){
  const rows=oddsRows.filter(x=>String(x.matchId)===String(matchId));
  for(const companyId of THSCORE_COMPANY_PRIORITY){
    const companyRows=rows.filter(x=>Number(x.companyId)===companyId);
    const prices=companyRows.filter(x=>Number(x.type)===1).sort((a,b)=>rowTime(b)-rowTime(a));
    if(!prices.length) continue;
    const price=prices[0];
    const closed=companyRows.filter(x=>[3,6].includes(Number(x.type))).sort((a,b)=>rowTime(b)-rowTime(a))[0];
    if(closed&&rowTime(closed)>=rowTime(price)) return {status:'UNAVAILABLE',reason:`${THSCORE_COMPANIES[companyId]||companyId} HANDICAP CLOSED`,price,companyId};
    return {status:'VALID',reason:'THSCORE HANDICAP FOUND',price,companyId};
  }
  return {status:'UNAVAILABLE',reason:'THSCORE LIVE HANDICAP UNAVAILABLE',price:null,companyId:null};
}

function blankJudge(candidate,status,reason,extra={}){
  return {
    totalCornerId:String(candidate?.id||''),
    source:THSCORE_SOURCE,
    status,
    reason,
    thscoreMatchId:extra.thscoreMatchId?String(extra.thscoreMatchId):'',
    matchConfidence:finite(extra.matchConfidence),
    bookmakerId:extra.bookmakerId??null,
    bookmaker:extra.bookmaker||'',
    observedAt:extra.observedAt??null,
    ageSeconds:extra.ageSeconds??null,
    rawHomeLine:extra.rawHomeLine??'',
    decodedHomeLine:extra.decodedHomeLine??null,
    homeOddsRaw:extra.homeOddsRaw??null,
    awayOddsRaw:extra.awayOddsRaw??null,
    oddsFormat:extra.oddsFormat||'UNKNOWN',
    homeOddsDecimal:extra.homeOddsDecimal??null,
    awayOddsDecimal:extra.awayOddsDecimal??null,
    transport:'THSCORE_API',
    mapper:extra.mapper||null,
  };
}

function buildJudge(candidate,mapped,oddsRows,env){
  if(mapped.status!=='VALID') return blankJudge(candidate,mapped.status,mapped.reason,{matchConfidence:mapped.best?.confidence,thscoreMatchId:mapped.best?.row?.matchId,mapper:mapped.best?.parts||null});
  const match=mapped.best.row;
  const picked=selectHandicapRows(match.matchId,oddsRows);
  if(picked.status!=='VALID') return blankJudge(candidate,picked.status,picked.reason,{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',mapper:mapped.best.parts});
  const row=picked.price;
  const ch=finite(candidate?.score?.[0]),ca=finite(candidate?.score?.[1]),rh=finite(row?.homeScore),ra=finite(row?.awayScore);
  if(ch===null||ca===null||rh===null||ra===null||ch!==rh||ca!==ra){
    return blankJudge(candidate,'MISMATCH','THSCORE LIVE SCORE MISMATCH — WAIT',{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',mapper:mapped.best.parts});
  }
  const rawHandicap=finite(row?.odds2);
  if(rawHandicap===null) return blankJudge(candidate,'MISMATCH','THSCORE HANDICAP INVALID',{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',mapper:mapped.best.parts});
  const decodedHomeLine=-rawHandicap;
  if(Math.abs(decodedHomeLine*4-Math.round(decodedHomeLine*4))>.001){
    return blankJudge(candidate,'MISMATCH','THSCORE HANDICAP NOT QUARTER LINE',{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',rawHomeLine:String(row.odds2),decodedHomeLine,mapper:mapped.best.parts});
  }
  const normalized=normalizeAsianOdds(row?.odds1,row?.odds3,env);
  const observedAt=parseBangkokTime(row?.changeTime);
  const ageSeconds=observedAt===null?null:Math.max(0,Math.round((Date.now()-observedAt)/1000));
  if(observedAt===null) return blankJudge(candidate,'UNKNOWN','THSCORE PRICE TIME UNKNOWN — WAIT',{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',rawHomeLine:String(row.odds2),decodedHomeLine,homeOddsRaw:finite(row.odds1),awayOddsRaw:finite(row.odds3),oddsFormat:normalized.format,homeOddsDecimal:normalized.homeDecimal,awayOddsDecimal:normalized.awayDecimal,mapper:mapped.best.parts});
  if(normalized.status!=='VALID') return blankJudge(candidate,normalized.status,`${normalized.reason} — WAIT`,{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',observedAt,ageSeconds,rawHomeLine:String(row.odds2),decodedHomeLine,homeOddsRaw:finite(row.odds1),awayOddsRaw:finite(row.odds3),oddsFormat:normalized.format,mapper:mapped.best.parts});
  return blankJudge(candidate,'VALID','THSCORE PRICE CONFIRMED',{matchConfidence:mapped.best.confidence,thscoreMatchId:match.matchId,bookmakerId:picked.companyId,bookmaker:THSCORE_COMPANIES[picked.companyId]||'',observedAt,ageSeconds,rawHomeLine:String(row.odds2),decodedHomeLine,homeOddsRaw:finite(row.odds1),awayOddsRaw:finite(row.odds3),oddsFormat:normalized.format,homeOddsDecimal:normalized.homeDecimal,awayOddsDecimal:normalized.awayDecimal,mapper:mapped.best.parts});
}

async function judgeThscore(candidates,env){
  const safe=Array.isArray(candidates)?candidates.slice(0,50).map(c=>({id:String(c?.id||''),home:String(c?.home||''),away:String(c?.away||''),league:String(c?.league||''),minute:finite(c?.minute),score:Array.isArray(c?.score)?[finite(c.score[0]),finite(c.score[1])]:[null,null]})).filter(c=>c.id&&c.home&&c.away):[];
  if(!safe.length) return {ok:true,version:VERSION,source:THSCORE_SOURCE,results:[],configured:Boolean(env?.THSCORE_API_KEY)};
  if(!env?.THSCORE_API_KEY) return {ok:true,version:VERSION,source:THSCORE_SOURCE,configured:false,results:safe.map(c=>blankJudge(c,'UNAVAILABLE','THSCORE API KEY MISSING — WAIT'))};
  try{
    const schedule=await thscoreSchedule(env);
    const mappings=safe.map(candidate=>({candidate,mapped:mapThscoreMatch(candidate,schedule)}));
    const ids=mappings.filter(x=>x.mapped.status==='VALID').map(x=>x.mapped.best.row.matchId);
    const odds=ids.length?await thscoreInplay(env,ids):[];
    return {ok:true,version:VERSION,source:THSCORE_SOURCE,configured:true,results:mappings.map(x=>buildJudge(x.candidate,x.mapped,odds,env))};
  }catch(error){
    const reason=String(error?.message||error).replace(/[^A-Za-z0-9_ -]/g,'').slice(0,120)||'THSCORE ERROR';
    return {ok:false,version:VERSION,source:THSCORE_SOURCE,configured:true,error:reason,results:safe.map(c=>blankJudge(c,'UNAVAILABLE',`${reason} — WAIT`))};
  }
}

function thscoreStatus(env){
  return {
    ok:true,
    version:VERSION,
    source:THSCORE_SOURCE,
    configured:Boolean(env?.THSCORE_API_KEY),
    host:THSCORE_HOST,
    schedulePath:THSCORE_SCHEDULE_PATH,
    inplayPath:THSCORE_INPLAY_PATH,
    mapper:{threshold:THSCORE_MATCH_THRESHOLD,ambiguityGap:THSCORE_AMBIGUITY_GAP,failClosed:true},
    bookmakerPriority:THSCORE_COMPANY_PRIORITY.map(id=>({id,name:THSCORE_COMPANIES[id]||String(id)})),
    oddsFormat:String(env?.THSCORE_ASIAN_ODDS_FORMAT||'AUTO').toUpperCase(),
  };
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);
    if(request.method==='GET'){
      if(url.pathname==='/'||url.pathname==='/health') return json(healthPayload());
      if(url.pathname==='/feed') return json(await scan(url.searchParams.get('force')==='1'));
      if(url.pathname==='/judge/thscore/status') return json(thscoreStatus(env));
      if(url.pathname==='/contract') return json({
        ok:true,
        version:VERSION,
        source:sourceMeta(),
        judge:{source:THSCORE_SOURCE,path:'/judge/thscore',statusPath:'/judge/thscore/status',method:'POST',batchMax:50,failClosed:true},
        match:{id:'string',league:'string|null',home:'string',away:'string',minute:'number',score:['home','away'],event:{snapshots:[{minute:'number',observedAt:'epoch-ms',attacks:['home','away'],dangerous:['home','away'],sot:[null,null],off:[null,null],corner:['home','away']}]},freshness:{changedAt:'epoch-ms',lastSeenAt:'epoch-ms',stale:'boolean'}},
      });
      return json({ok:false,error:'not_found'},404);
    }
    if(request.method==='POST'&&url.pathname==='/judge/thscore'){
      let body=null;
      try{body=await request.json();}catch{return json({ok:false,version:VERSION,source:THSCORE_SOURCE,error:'invalid_json',results:[]},400);}
      return json(await judgeThscore(body?.candidates,env));
    }
    return json({ok:false,error:'method_not_allowed'},405);
  },
};
