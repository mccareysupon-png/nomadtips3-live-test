import {parseToday} from './totalcorner.js';

const VERSION='3.42';
const COMPONENT='totalcorner-live-score-v2';
const TRANSPORT='DIRECT_WORKER_V2';
const SOURCE_NAME='TotalCorner';
const SOURCE_HOST='https://www.totalcorner.com';
const TODAY_URL=`${SOURCE_HOST}/match/today/`;
const CACHE_MS=10000;
const SOURCE_STALE_MS=90000;
const HISTORY_MS=12*60*1000;
const REQUEST_TIMEOUT_MS=9000;

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
};

const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const now=()=>Date.now();
const iso=t=>t?new Date(t).toISOString():null;
const finite=v=>{
  if(v===null||v===undefined||v===''||typeof v==='boolean')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};
const pairArray=p=>[finite(p?.home),finite(p?.away)];

function sourceUrl(token){
  const u=new URL(TODAY_URL);
  u.searchParams.set('_nomad_live_score_v2',String(token));
  return u.toString();
}

async function fetchToday(token){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(sourceUrl(token),{
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
    if(!response.ok)throw new Error(`source_http_${response.status}`);
    const text=await response.text();
    if(text.length<300)throw new Error('source_body_too_small');
    return text;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('source_timeout');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

function mergePair(value){
  return {home:finite(value?.home),away:finite(value?.away)};
}

function normalizeMatch(row,observedAt){
  return {
    id:String(row.id),
    league:row.league||null,
    home:row.home||null,
    away:row.away||null,
    minute:finite(row.minute),
    score:{home:finite(row.score?.home),away:finite(row.score?.away)},
    stats:{
      attacks:mergePair(row.stats?.attacks),
      dangerous:mergePair(row.stats?.dangerous),
      sot:{home:null,away:null},
      off:{home:null,away:null},
      corner:mergePair(row.stats?.corner),
    },
    source:{name:SOURCE_NAME,observedAt,detail:false,mode:'TODAY_ONLY',transport:TRANSPORT},
  };
}

function fingerprint(m){
  return JSON.stringify({minute:m.minute,score:m.score,stats:m.stats});
}

function withFreshness(m,observedAt){
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
  return Boolean(a&&b&&JSON.stringify({minute:a.minute,attacks:a.attacks,dangerous:a.dangerous,sot:a.sot,off:a.off,corner:a.corner})===JSON.stringify({minute:b.minute,attacks:b.attacks,dangerous:b.dangerous,sot:b.sot,off:b.off,corner:b.corner}));
}

function updateHistory(m,observedAt){
  const next=snapshotFromMatch(m,observedAt);
  const cutoff=observedAt-HISTORY_MS;
  let rows=(state.history.get(m.id)||[]).filter(x=>x.observedAt>=cutoff);
  if(rows.length&&rows[rows.length-1].minute===next.minute){
    if(!sameSnapshot(rows[rows.length-1],next))rows=[...rows.slice(0,-1),next];
  }else if(!sameSnapshot(rows[rows.length-1],next)){
    rows.push(next);
  }
  rows=rows.slice(-40);
  state.history.set(m.id,rows);
  return rows;
}

function cleanup(activeIds,observedAt){
  for(const [id,rows] of state.history){
    const recent=rows.filter(x=>x.observedAt>=observedAt-HISTORY_MS);
    if(!activeIds.has(id)&&!recent.length)state.history.delete(id);
    else state.history.set(id,recent);
  }
  for(const [id,meta] of state.freshness){
    if(!activeIds.has(id)&&observedAt-meta.lastSeenAt>HISTORY_MS)state.freshness.delete(id);
  }
}

async function performScan(){
  const started=now();
  state.cycle+=1;
  state.lastScanAt=started;
  try{
    const html=await fetchToday(started);
    const parsed=parseToday(html,SOURCE_HOST)
      .filter(m=>Number.isFinite(m.minute)&&m.minute>=1&&m.minute<=130)
      .filter(m=>Number.isFinite(m.score?.home)&&Number.isFinite(m.score?.away));

    const matches=parsed.map(row=>{
      const match=withFreshness(normalizeMatch(row,started),started);
      return {
        id:match.id,
        league:match.league,
        home:match.home,
        away:match.away,
        minute:match.minute,
        score:[match.score.home,match.score.away],
        event:{snapshots:updateHistory(match,started)},
        source:match.source,
        freshness:match.freshness,
      };
    });

    cleanup(new Set(matches.map(m=>m.id)),started);
    state.matches=matches;
    state.lastSuccessAt=now();
    state.lastError=null;
  }catch(error){
    state.lastError=String(error?.message||error||'source_fetch_failed');
  }
  return feedPayload();
}

async function scan(force=false){
  if(!force&&state.lastScanAt&&now()-state.lastScanAt<CACHE_MS)return feedPayload();
  if(state.scanning)return state.scanning;
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
    detailMode:'TODAY_ONLY',
    detailUnavailableReason:'not_requested',
    capabilities:CAPABILITIES,
  };
}

function feedPayload(){
  const matches=state.matches||[];
  const sourceAgeMs=state.lastSuccessAt?Math.max(0,now()-state.lastSuccessAt):null;
  return {
    ok:!state.lastError,
    version:VERSION,
    component:COMPONENT,
    transport:TRANSPORT,
    mode:'LIVE_EVENT_FEED',
    updatedAt:iso(state.lastSuccessAt),
    cycle:state.cycle,
    source:sourceMeta(),
    sourceAgeMs,
    sourceStale:sourceAgeMs!==null&&sourceAgeMs>SOURCE_STALE_MS,
    counts:{
      live:matches.length,
      detailed:0,
      stale:matches.filter(m=>m.freshness?.stale).length,
      detailEligible:0,
      detailAttempts:0,
      detailFetchErrors:0,
      detailParseInvalid:0,
      detailSuccess:0,
      detailSkipped:0,
    },
    detailErrors:{},
    matches,
    lastError:state.lastError,
  };
}

function healthPayload(){
  const sourceAgeMs=state.lastSuccessAt?Math.max(0,now()-state.lastSuccessAt):null;
  return {
    ok:!state.lastError,
    version:VERSION,
    component:COMPONENT,
    transport:TRANSPORT,
    source:sourceMeta(),
    cycle:state.cycle,
    lastScanAt:iso(state.lastScanAt),
    lastSuccessAt:iso(state.lastSuccessAt),
    sourceAgeMs,
    sourceStale:sourceAgeMs!==null&&sourceAgeMs>SOURCE_STALE_MS,
    lastError:state.lastError,
    liveMatches:state.matches.length,
    historyMatches:state.history.size,
  };
}

const contract=Object.freeze({
  ok:true,
  version:VERSION,
  component:COMPONENT,
  transport:TRANSPORT,
  mode:'LIVE_EVENT_FEED',
  source:sourceMeta(),
  match:{
    id:'string',
    league:'string|null',
    home:'string',
    away:'string',
    minute:'number',
    score:['home','away'],
    event:{snapshots:[{minute:'number',observedAt:'epoch-ms',attacks:['home','away'],dangerous:['home','away'],sot:[null,null],off:[null,null],corner:['home','away']}]},
    freshness:{changedAt:'epoch-ms',lastSeenAt:'epoch-ms',stale:'boolean'},
  },
});

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health')return json(healthPayload());
    if(url.pathname==='/feed')return json(await scan(url.searchParams.get('force')==='1'));
    if(url.pathname==='/contract')return json(contract);
    return json({ok:false,error:'not_found'},404);
  },
};
