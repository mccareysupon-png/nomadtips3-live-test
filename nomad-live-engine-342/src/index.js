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

export default {
  async fetch(request){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='GET') return json({ok:false,error:'method_not_allowed'},405);
    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health') return json(healthPayload());
    if(url.pathname==='/feed') return json(await scan(url.searchParams.get('force')==='1'));
    if(url.pathname==='/contract') return json({
      ok:true,
      version:VERSION,
      source:sourceMeta(),
      match:{id:'string',league:'string|null',home:'string',away:'string',minute:'number',score:['home','away'],event:{snapshots:[{minute:'number',observedAt:'epoch-ms',attacks:['home','away'],dangerous:['home','away'],sot:[null,null],off:[null,null],corner:['home','away']}]},freshness:{changedAt:'epoch-ms',lastSeenAt:'epoch-ms',stale:'boolean'}},
    });
    return json({ok:false,error:'not_found'},404);
  },
};
