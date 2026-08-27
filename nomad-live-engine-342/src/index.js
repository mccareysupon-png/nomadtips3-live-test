import {parseToday,parseLiveDetail} from './totalcorner.js';
import {databaseHealth,listSignals,lockSignal,validateSignalPayload} from './signal-ledger.js';
import {statisticsSummary} from './statistics.js';

const VERSION='3.42';
const SOURCE_NAME='TotalCorner';
const SOURCE_HOST='https://www.totalcorner.com';
const TODAY_URL=`${SOURCE_HOST}/match/today/`;
const CACHE_MS=10000;
const SOURCE_STALE_MS=90000;
const HISTORY_MS=12*60*1000;
const DETAIL_MINUTE_FROM=45;
const DETAIL_MINUTE_TO=100;
const DETAIL_CONCURRENCY=6;
const REQUEST_TIMEOUT_MS=9000;

const state={scanning:null,lastScanAt:0,lastSuccessAt:0,lastError:null,cycle:0,matches:[],history:new Map(),freshness:new Map()};
const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','cache-control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const now=()=>Date.now();
const iso=t=>t?new Date(t).toISOString():null;
const finite=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean') return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const pairArray=p=>[finite(p?.home),finite(p?.away)];
const normName=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

function sourceUrl(url,token){const u=new URL(url);u.searchParams.set('_nomad342_cycle',String(token));return u.toString();}
async function fetchHtml(url,token){
  const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(sourceUrl(url,token),{signal:ac.signal,cache:'no-store',headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache, no-store','pragma':'no-cache'}});
    if(!response.ok) throw new Error(`source_http_${response.status}`);
    const text=await response.text();if(text.length<300) throw new Error('source_body_too_small');return text;
  }finally{clearTimeout(timer);}
}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let cursor=0;
  const runners=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const index=cursor++;if(index>=items.length)return;out[index]=await worker(items[index],index);}});
  await Promise.all(runners);return out;
}
function mergePair(primary,fallback){return {home:finite(primary?.home)??finite(fallback?.home),away:finite(primary?.away)??finite(fallback?.away)};}
function mergeMatch(row,detail,observedAt){
  const live=detail?.valid?detail:null;const score=live?.score||row.score;
  const stats={attacks:mergePair(live?.stats?.attacks,row.stats?.attacks),dangerous:mergePair(live?.stats?.dangerous,row.stats?.dangerous),sot:mergePair(live?.stats?.sot,row.stats?.sot),off:mergePair(live?.stats?.off,row.stats?.off),corner:mergePair(live?.stats?.corner,row.stats?.corner)};
  return {id:String(row.id),league:row.league||null,home:row.home||null,away:row.away||null,minute:finite(live?.minute)??finite(row.minute),score:{home:finite(score?.home),away:finite(score?.away)},stats,source:{name:SOURCE_NAME,observedAt,detail:Boolean(live)}};
}
function fingerprint(m){return JSON.stringify({minute:m.minute,score:m.score,stats:m.stats});}
function updateFreshness(m,observedAt){
  const fp=fingerprint(m);const prev=state.freshness.get(m.id);const changedAt=prev?.fingerprint===fp?prev.changedAt:observedAt;
  state.freshness.set(m.id,{fingerprint:fp,changedAt,lastSeenAt:observedAt});
  return {...m,freshness:{changedAt,lastSeenAt:observedAt,stale:observedAt-changedAt>SOURCE_STALE_MS}};
}
function snapshotFromMatch(m,observedAt){return {minute:m.minute,observedAt,attacks:pairArray(m.stats.attacks),dangerous:pairArray(m.stats.dangerous),sot:pairArray(m.stats.sot),off:pairArray(m.stats.off),corner:pairArray(m.stats.corner)};}
function sameSnapshot(a,b){return a&&b&&JSON.stringify({minute:a.minute,attacks:a.attacks,dangerous:a.dangerous,sot:a.sot,off:a.off,corner:a.corner})===JSON.stringify({minute:b.minute,attacks:b.attacks,dangerous:b.dangerous,sot:b.sot,off:b.off,corner:b.corner});}
function updateHistory(m,observedAt){
  const next=snapshotFromMatch(m,observedAt);const previous=state.history.get(m.id)||[];const cutoff=observedAt-HISTORY_MS;let rows=previous.filter(x=>x.observedAt>=cutoff);
  if(rows.length&&rows[rows.length-1].minute===next.minute){if(!sameSnapshot(rows[rows.length-1],next)) rows=[...rows.slice(0,-1),next];}else if(!sameSnapshot(rows[rows.length-1],next))rows.push(next);
  state.history.set(m.id,rows.slice(-40));return rows.slice(-40);
}
function cleanup(activeIds,observedAt){
  for(const [id,rows] of state.history){const recent=rows.filter(x=>x.observedAt>=observedAt-HISTORY_MS);if(!activeIds.has(id)&&!recent.length)state.history.delete(id);else state.history.set(id,recent);}
  for(const [id,meta] of state.freshness){if(!activeIds.has(id)&&observedAt-meta.lastSeenAt>HISTORY_MS)state.freshness.delete(id);}
}
async function performScan(){
  const started=now();state.cycle+=1;
  try{
    const todayHtml=await fetchHtml(TODAY_URL,started);
    const parsed=parseToday(todayHtml,SOURCE_HOST).filter(m=>Number.isFinite(m.minute)&&m.minute>=1&&m.minute<=130).filter(m=>Number.isFinite(m.score?.home)&&Number.isFinite(m.score?.away));
    const enriched=await mapLimit(parsed,DETAIL_CONCURRENCY,async row=>{
      let detail=null;
      if(row.minute>=DETAIL_MINUTE_FROM&&row.minute<=DETAIL_MINUTE_TO){for(const url of [row.urls?.stats,row.urls?.live].filter(Boolean)){try{const candidate=parseLiveDetail(await fetchHtml(url,started));if(candidate.valid){detail=candidate;break;}}catch{}}}
      const match=updateFreshness(mergeMatch(row,detail,started),started);const snapshots=updateHistory(match,started);
      return {id:match.id,league:match.league,home:match.home,away:match.away,minute:match.minute,score:[match.score.home,match.score.away],event:{snapshots},source:match.source,freshness:match.freshness};
    });
    cleanup(new Set(enriched.map(m=>m.id)),started);state.matches=enriched;state.lastScanAt=started;state.lastSuccessAt=now();state.lastError=null;
  }catch(error){state.lastScanAt=started;state.lastError=String(error?.message||error);}
  return feedPayload();
}
async function scan(force=false){if(!force&&state.lastScanAt&&now()-state.lastScanAt<CACHE_MS)return feedPayload();if(state.scanning)return state.scanning;state.scanning=performScan().finally(()=>{state.scanning=null;});return state.scanning;}
function feedPayload(){
  const matches=state.matches||[];
  return {ok:!state.lastError,version:VERSION,mode:'LIVE_EVENT_FEED',updatedAt:iso(state.lastSuccessAt),cycle:state.cycle,source:{name:SOURCE_NAME,host:SOURCE_HOST,scanUrl:TODAY_URL,cacheSeconds:CACHE_MS/1000,staleSeconds:SOURCE_STALE_MS/1000,detailWindow:`${DETAIL_MINUTE_FROM}-${DETAIL_MINUTE_TO}`,detailConcurrency:DETAIL_CONCURRENCY},counts:{live:matches.length,detailed:matches.filter(m=>m.source?.detail).length,stale:matches.filter(m=>m.freshness?.stale).length},matches,lastError:state.lastError};
}
function feedHealth(){return {ok:!state.lastError,version:VERSION,component:'totalcorner-inlet',source:SOURCE_NAME,cycle:state.cycle,lastScanAt:iso(state.lastScanAt),lastSuccessAt:iso(state.lastSuccessAt),lastError:state.lastError,liveMatches:state.matches.length,staleMatches:state.matches.filter(m=>m.freshness?.stale).length,historyMatches:state.history.size};}
function writeAuthorization(request,env){
  const expected=String(env?.SIGNAL_WRITE_TOKEN||'');if(!expected)return {ok:false,status:503,error:'signal_write_auth_not_configured'};
  const auth=String(request.headers.get('authorization')||'');if(auth!==`Bearer ${expected}`)return {ok:false,status:401,error:'unauthorized'};
  const allowedOrigin=String(env?.SIGNAL_WRITE_ORIGIN||'').trim();const origin=String(request.headers.get('origin')||'').trim();if(allowedOrigin&&origin&&origin!==allowedOrigin)return {ok:false,status:403,error:'write_origin_rejected'};return {ok:true};
}
function sourceMatchCheck(validated,feed){
  const match=(feed.matches||[]).find(m=>String(m.id)===String(validated.matchId));if(!match)return {ok:false,error:'totalcorner_match_not_in_live_feed'};if(match.freshness?.stale)return {ok:false,error:'totalcorner_match_stale'};
  if(normName(match.home)!==normName(validated.home)||normName(match.away)!==normName(validated.away))return {ok:false,error:'totalcorner_team_mismatch'};return {ok:true,match};
}
async function apiHealth(env){
  let dbStatus='NOT_BOUND',dbOk=false;
  if(env?.SIGNALS_DB){try{dbOk=await databaseHealth(env.SIGNALS_DB);dbStatus=dbOk?'OK':'ERROR';}catch(error){dbStatus=`ERROR:${String(error?.message||error)}`;}}
  return {ok:!state.lastError&&dbOk,version:VERSION,environment:String(env?.NOMAD_ENV||'unknown'),feed:feedHealth(),persistence:{type:'D1',binding:'SIGNALS_DB',status:dbStatus,authoritative:true},signalWrite:{authConfigured:Boolean(env?.SIGNAL_WRITE_TOKEN),originRestricted:Boolean(env?.SIGNAL_WRITE_ORIGIN)},settlement:{status:'NOT_WIRED',reason:'live_AH_entry_score_semantics_pending_verification'}};
}
async function handleSignalLock(request,env){
  const auth=writeAuthorization(request,env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);if(!env?.SIGNALS_DB)return json({ok:false,error:'signals_db_not_bound'},503);
  let body;try{body=await request.json();}catch{return json({ok:false,error:'invalid_json'},400);}
  const checked=validateSignalPayload(body,now());if(!checked.ok)return json({ok:false,error:'invalid_signal',errors:checked.errors},400);
  const feed=await scan(false);if(!feed.ok)return json({ok:false,error:'totalcorner_feed_unhealthy',lastError:feed.lastError},503);const sourceCheck=sourceMatchCheck(checked.value,feed);if(!sourceCheck.ok)return json({ok:false,error:sourceCheck.error},409);
  try{const result=await lockSignal(env.SIGNALS_DB,checked.value);return json({ok:true,locked:true,created:result.created,signal:result.row},result.created?201:200);}catch(error){return json({ok:false,error:'signal_lock_failed',detail:String(error?.message||error)},500);}
}
async function handleSignalsList(url,env){if(!env?.SIGNALS_DB)return json({ok:false,error:'signals_db_not_bound'},503);try{const data=await listSignals(env.SIGNALS_DB,{limit:url.searchParams.get('limit')||50,before:url.searchParams.get('before')||null});return json({ok:true,...data});}catch(error){return json({ok:false,error:'signals_read_failed',detail:String(error?.message||error)},500);}}
async function handleStatistics(env){if(!env?.SIGNALS_DB)return json({ok:false,error:'signals_db_not_bound'},503);try{return json({ok:true,version:VERSION,...await statisticsSummary(env.SIGNALS_DB)});}catch(error){return json({ok:false,error:'statistics_read_failed',detail:String(error?.message||error)},500);}}
function contractPayload(){return {ok:true,version:VERSION,flow:'TotalCorner -> NOMAD -> M88 -> SIGNAL LOCK -> Worker -> D1 -> Statistics/History',endpoints:{feed:'GET /feed',health:'GET /health',apiHealth:'GET /api/v1/health',signalLock:'POST /api/v1/signals/lock',signals:'GET /api/v1/signals?limit=50&before=<ISO>',statistics:'GET /api/v1/statistics/summary'},persistence:{authoritative:'D1 binding SIGNALS_DB',localStorage:'transition/cache only; never authoritative after cutover',idempotency:'signal_key UNIQUE; default 3.42:<matchId>:HOME'},signalLock:{auth:'Authorization: Bearer <SIGNAL_WRITE_TOKEN>',sources:['TotalCorner','M88'],failClosed:['stale source','match mismatch','M88 status not VALID','unsigned non-zero M88 HDP','stale evidence']},settlement:{grades:['WIN','HALF_WIN','PUSH','HALF_LOSS','LOSS','VOID'],automatic:false,reason:'entry-score live AH settlement semantics must be verified before wiring'}};}

export default {async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});const url=new URL(request.url);
  if(url.pathname==='/')return json({service:'nomadtips3-live-engine-342',version:VERSION,status:'git-blueprint',endpoints:['/feed','/health','/contract','/api/v1/health','/api/v1/signals','/api/v1/statistics/summary','/api/v1/signals/lock']});
  if(url.pathname==='/contract'&&request.method==='GET')return json(contractPayload());
  if(url.pathname==='/feed'&&request.method==='GET')return json(await scan(url.searchParams.get('force')==='1'));
  if(url.pathname==='/health'&&request.method==='GET')return json({...feedHealth(),centralLedger:await apiHealth(env)});
  if(url.pathname==='/api/v1/health'&&request.method==='GET')return json(await apiHealth(env));
  if(url.pathname==='/api/v1/signals'&&request.method==='GET')return handleSignalsList(url,env);
  if(url.pathname==='/api/v1/statistics/summary'&&request.method==='GET')return handleStatistics(env);
  if(url.pathname==='/api/v1/signals/lock'&&request.method==='POST')return handleSignalLock(request,env);
  if(url.pathname.startsWith('/api/')&&request.method!=='GET'&&request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  return json({ok:false,error:'not_found'},404);
}};
