import {
  CONFIG_HISTORY_LIMIT,CONFIG_SCHEMA_VERSION,DEFAULT_CONFIG,editableConfig,engineConfig,validateEditableConfig
} from './config.js';
import {parseToday,parseLiveDetail,parseEnded,parseBet365Asian,handicapPanelUrl} from './parser.js';
import {buildRollingAnalysis,evaluate} from './detector.js';
import {settleAsian} from './settlement.js';
import {fetchLiveEvents,fetchMultiOdds,mapMatchesToOddsEvents,parseAsianHandicap,marketUpdatedAtMs} from './real-market.js';
import {buildPriceSourceSnapshots,publicPriceSourceSnapshot,selectPriceSource,selectPriceSourceWithFallback} from './price-sources.js';
import {buildTheOddsApiMarkets,fetchTheOddsApiLiveSoccer,theOddsApiUnavailable} from './the-odds-api.js';
import {apiFootballUnavailable,buildApiFootballMarkets,fetchApiFootballLiveAsianHandicaps} from './api-football.js';
import {fetchOddspediaBet365Markets,oddspediaUnavailable} from './oddspedia.js';
import {PUBLIC_STATS_EPOCH_VERSION,createPublicStatsEpoch,selectPublicStatsSignals,summarizePublicStats} from './public-statistics.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const SETTINGS_KEY_SHA256='1cc981355210634b60e5798eced35e7f441e9b8c8e6d4484b632986bcf31b1c2';
const REAL_BOOKMAKER='1xbet';
const COMPARE_BOOKMAKER='Bet365';
const ODDS_BOOKMAKER_QUERY=`${REAL_BOOKMAKER},${COMPARE_BOOKMAKER}`;
const ODDS_BATCH_SIZE=10;
const PUBLIC_STATS_EPOCH_KEY='publicStatsEpochV1';
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const now=()=>Date.now();
const iso=value=>value==null?null:new Date(value).toISOString();
const clone=value=>JSON.parse(JSON.stringify(value));
const safePair=pair=>({home:Number.isFinite(pair?.home)?pair.home:null,away:Number.isFinite(pair?.away)?pair.away:null});
const emptyState=()=>({lastCycle:null,lastSuccess:null,lastError:null,matches:[],signals:[],cycle:0,source:{today:false,ended:false,oddsApi:{status:'IDLE'},theOddsApi:{status:'IDLE'},apiFootball:{status:'IDLE'},oddspedia:{status:'IDLE'},totalCorner:{status:'IDLE'}}});
const sourceRequestUrl=(url,token=now())=>{const result=new URL(url);result.searchParams.set('_nomad_cycle',String(token));return result.toString();};
const bookmakerLabel=bookmaker=>String(bookmaker).toLowerCase()==='1xbet'?'1xBet':String(bookmaker);
const marketState=(bookmaker,status,reason,extra={})=>({status,reason,source:'Odds-API.io',bookmaker:bookmakerLabel(bookmaker),...extra});
const totalCornerMarketState=(status,reason,extra={})=>({status,reason,source:'TotalCorner',bookmaker:null,...extra});

function parsedBookmakerMarket(payload,bookmaker,preference,eventId,item){
  const label=bookmakerLabel(bookmaker);
  const ah=parseAsianHandicap(payload,bookmaker,preference);
  if(!ah) return marketState(bookmaker,'ODDS NOT READY',`${String(bookmaker).toLowerCase()}_live_ah_unavailable`,{eventId,mappingConfidence:item.matchConfidence});
  const sourceUpdatedAt=marketUpdatedAtMs(ah);
  if(sourceUpdatedAt==null) return marketState(bookmaker,'ODDS NOT READY','missing_source_updated_time',{eventId,mappingConfidence:item.matchConfidence});
  return {
    status:'AH READY',line:ah.line,homeOdds:ah.home,awayOdds:ah.away,bookmaker:label,market:'FULL MATCH LIVE AH',
    source:'Odds-API.io',sourceUpdatedAt,eventId,mappingConfidence:item.matchConfidence,mapping:item.matchBreakdown,
  };
}

const timeoutFetch=async(url,ms)=>{
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),ms);
  try{
    return await fetch(url,{signal:controller.signal,cache:'no-store',headers:{
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
      'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache, no-store','pragma':'no-cache'
    }});
  }finally{clearTimeout(timer);}
};

async function getDocument(url,config,token=now()){
  const response=await timeoutFetch(sourceRequestUrl(url,token),config.requestTimeoutMs);
  if(!response.ok) throw new Error(`source_http_${response.status}`);
  const html=await response.text();
  if(html.length<200) throw new Error('source_body_too_small');
  const fetchedAt=now();
  const responseDate=Date.parse(response.headers.get('date')||'');
  const sourceUpdatedAt=Number.isFinite(responseDate)&&responseDate<=fetchedAt+5000?responseDate:fetchedAt;
  return {html,fetchedAt,sourceUpdatedAt};
}
async function getHtml(url,config,token=now()){return (await getDocument(url,config,token)).html;}

function mergePair(primary,fallback){
  return {home:Number.isFinite(primary?.home)?primary.home:(Number.isFinite(fallback?.home)?fallback.home:null),away:Number.isFinite(primary?.away)?primary.away:(Number.isFinite(fallback?.away)?fallback.away:null)};
}
const sourceFingerprint=match=>JSON.stringify({minute:match.minute,score:match.score,stats:match.stats});
export function trackSourceFreshness(match,previous,observedAt,staleAfterMs){
  const fingerprint=sourceFingerprint(match);
  const previousFreshness=previous?.freshness||{};
  const unchanged=previousFreshness.sourceFingerprint===fingerprint;
  const sourceChangedAt=unchanged&&Number.isFinite(previousFreshness.sourceChangedAt)?previousFreshness.sourceChangedAt:observedAt;
  return {...match,freshness:{...match.freshness,sourceFingerprint:fingerprint,sourceChangedAt,sourceStale:observedAt-sourceChangedAt>staleAfterMs}};
}

export function appendMatchSnapshot(previousSnapshots=[],match,observedAt){
  if(!Number.isFinite(match?.minute)) return [...previousSnapshots];
  const snapshot={observedAt,minute:match.minute,stats:clone(match.stats)};
  const kept=previousSnapshots.filter(item=>Number.isFinite(item?.minute)&&item.minute<match.minute);
  kept.push(snapshot);
  return kept.slice(-40);
}

export function canLockSignal(signals,match,config){
  if(match?.state!=='SIGNAL'||match?.freshness?.sourceStale) return false;
  return config.oneSignalPerMatch===false||!signals.some(signal=>signal.matchId===match.id);
}

export function createLockedSignal(match,activeEnvelope,config,lockedAt){
  const selectedMarket=match.market||{};
  return {
    matchId:match.id,league:match.league,home:match.home,away:match.away,selection:'home',line:match.selectionLine,odds:match.selectionOdds,
    bookmaker:selectedMarket.bookmaker||'1xBet',oddsSource:selectedMarket.source||'Odds-API.io',priceSourceId:match.selectedPrice?.id||'source1',
    market:selectedMarket.market||'FULL MATCH LIVE AH',minute:match.minute,entryScore:match.score,stats:match.stats,
    hunger:match.hunger,rolling:match.rolling,lockedAt,sourceUpdatedAt:selectedMarket.sourceUpdatedAt??null,
    priceAgeSeconds:Number.isFinite(selectedMarket.sourceUpdatedAt)?Math.max(0,(lockedAt-selectedMarket.sourceUpdatedAt)/1000):null,settlement:null,
    configSnapshot:{schemaVersion:activeEnvelope.schemaVersion,version:activeEnvelope.version,updatedAt:iso(activeEnvelope.updatedAt),appliesFromCycle:activeEnvelope.appliesFromCycle,values:editableConfig(config)}
  };
}

export function summarizeApiFootballRecovery(matches=[],marketsByMatchId=new Map()){
  const sourceStatus=(match,id)=>match.priceSources?.find(source=>source.id===id)?.status;
  const recoveryCandidates=matches.filter(match=>match.detectionPassed&&sourceStatus(match,'source1')!=='PASS'&&sourceStatus(match,'source2')!=='PASS');
  return {
    ready:matches.filter(match=>sourceStatus(match,'source3')==='PASS').length,
    recoveryCandidates:recoveryCandidates.length,
    recoveredSignals:recoveryCandidates.filter(match=>match.state==='SIGNAL'&&match.selectedPrice?.id==='source3').length,
    selected:matches.filter(match=>match.selectedPrice?.id==='source3').length,
    bookmakerUnverified:matches.filter(match=>sourceStatus(match,'source3')==='PASS'&&marketsByMatchId.get(match.id)?.bookmakerVerified===false).length,
  };
}

function priority(state){return {'SIGNAL':0,'NEAR SIGNAL':1,'WATCHING':2,'LIVE':3,'STALE':4}[state]??9;}
async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function settingsAuthorized(request){
  const key=request.headers.get('x-settings-key')||'';
  return key.length>0&&await sha256Hex(key)===SETTINGS_KEY_SHA256;
}
function defaultEnvelope(cycle=0,createdAt=now()){
  return {schemaVersion:CONFIG_SCHEMA_VERSION,version:1,updatedAt:createdAt,appliesFromCycle:cycle,reason:'default',config:editableConfig(DEFAULT_CONFIG)};
}
function publicEnvelope(envelope){
  if(!envelope) return null;
  return {schemaVersion:envelope.schemaVersion,version:envelope.version,updatedAt:iso(envelope.updatedAt),appliesFromCycle:envelope.appliesFromCycle,reason:envelope.reason,config:clone(envelope.config)};
}

export class EngineState {
  constructor(state,env){this.state=state;this.env=env;this.running=false;}
  continuousCycles(){return String(this.env?.ENGINE_CYCLE_MODE||'continuous').trim().toLowerCase()!=='on_demand';}
  async read(){return (await this.state.storage.get('state'))||emptyState();}
  async write(value){await this.state.storage.put('state',value);}

  async configState(){
    const storage=this.state.storage;
    let active=await storage.get('configActive');
    if(!active||active.schemaVersion!==CONFIG_SCHEMA_VERSION){
      const state=await this.read();
      active=defaultEnvelope(state.cycle||0);
      await storage.transaction(async transaction=>{
        await transaction.put('configActive',active);
        await transaction.put('configHistory',[active]);
        await transaction.delete('configPending');
      });
    }
    const pending=await storage.get('configPending')||null;
    const history=(await storage.get('configHistory'))||[active];
    return {active,pending,history};
  }

  async stageConfig(config,cycle,reason='saved'){
    await this.configState();
    let staged;
    await this.state.storage.transaction(async transaction=>{
      const active=await transaction.get('configActive');
      const pending=await transaction.get('configPending');
      const history=(await transaction.get('configHistory'))||[];
      const highest=Math.max(active?.version||0,pending?.version||0,...history.map(item=>item.version||0));
      staged={schemaVersion:CONFIG_SCHEMA_VERSION,version:highest+1,updatedAt:now(),appliesFromCycle:cycle+1,reason,config:clone(config)};
      await transaction.put('configPending',staged);
      await transaction.put('configHistory',[staged,...history].slice(0,CONFIG_HISTORY_LIMIT));
    });
    if(this.continuousCycles()) await this.state.storage.setAlarm(now()+100);
    return staged;
  }

  async activateConfigForCycle(cycle){
    await this.configState();
    let active;
    await this.state.storage.transaction(async transaction=>{
      active=await transaction.get('configActive');
      const pending=await transaction.get('configPending');
      if(pending&&pending.appliesFromCycle<=cycle){
        active=pending;
        await transaction.put('configActive',active);
        await transaction.delete('configPending');
      }
    });
    return active;
  }

  async currentConfig(){return engineConfig((await this.configState()).active.config);}
  async armAlarm(delay=1500){if(this.continuousCycles()&&await this.state.storage.getAlarm()==null) await this.state.storage.setAlarm(now()+delay);}
  async alarm(){
    if(!this.continuousCycles()) return;
    const config=await this.currentConfig();
    if(this.running){await this.state.storage.setAlarm(now()+config.cycleEveryMs);return;}
    this.running=true;
    try{await this.runCycle();}
    finally{this.running=false;await this.state.storage.setAlarm(now()+(await this.currentConfig()).cycleEveryMs);}
  }
  wakeCycle(){
    if(this.running) return;
    this.running=true;
    this.state.waitUntil(this.runCycle().finally(()=>{this.running=false;}));
  }

  async handleConfig(request){
    const state=await this.read();
    const configState=await this.configState();
    const activeConfig=editableConfig(engineConfig(configState.active.config));
    if(request.method==='GET') return j({
      ok:true,activeConfig:clone(activeConfig),defaultConfig:editableConfig(DEFAULT_CONFIG),
      version:configState.active.version,updatedAt:iso(configState.active.updatedAt),appliesFromCycle:configState.active.appliesFromCycle,
      pending:publicEnvelope(configState.pending),history:configState.history.slice(0,10).map(publicEnvelope),
      config:clone(activeConfig),defaults:editableConfig(DEFAULT_CONFIG)
    });
    if(request.method!=='POST') return j({ok:false,error:'method_not_allowed'},405);
    if(!await settingsAuthorized(request)) return j({ok:false,error:'unauthorized'},401);
    let body;
    try{body=await request.json();}catch{return j({ok:false,error:'invalid_json'},400);}
    const restoring=body?.action==='restore_default';
    const result=restoring?{ok:true,config:editableConfig(DEFAULT_CONFIG),errors:[]}:validateEditableConfig(body?.config,{requireAll:true});
    if(!result.ok) return j({ok:false,error:'invalid_config',errors:result.errors},400);
    const staged=await this.stageConfig(result.config,state.cycle||0,restoring?'restore_default':'saved');
    this.wakeCycle();
    return j({ok:true,saved:true,pending:publicEnvelope(staged),active:publicEnvelope(configState.active),applies:'next_cycle'},202);
  }
  async fetch(request){
    const url=new URL(request.url);
    await this.armAlarm(1500);
    if(!this.continuousCycles()&&url.pathname==='/health'){
      const state=await this.read();
      const active=await this.state.storage.get('configActive');
      const pending=await this.state.storage.get('configPending')||null;
      return j(this.health(state,engineConfig(active?.config||DEFAULT_CONFIG),active||null,pending));
    }
    if(url.pathname==='/config') return this.handleConfig(request);
    if(url.pathname==='/cycle'){
      if(this.running) return j({ok:true,running:true});
      this.running=true;
      try{return j(await this.runCycle());}finally{this.running=false;}
    }
    const state=await this.read();
    const configState=await this.configState();
    const config=engineConfig(configState.active.config);
    if((this.continuousCycles()||url.pathname==='/feed')&&(!state.lastCycle||now()-state.lastCycle>config.cycleEveryMs*1.2)&&!this.running) this.wakeCycle();
    if(url.pathname==='/feed') return j(this.feed(state,configState.active));
    if(url.pathname==='/statistics') return j(await this.statistics(state));
    if(url.pathname==='/health') return j(this.health(state,config,configState.active,configState.pending));
    return j({error:'not_found'},404);
  }

  feed(state,activeConfig){
    const counts={live:0,watching:0,near:0,signal:0};
    const priceStatuses={};
    const matches=(state.matches||[]).filter(match=>!match.freshness?.sourceStale);
    for(const match of matches){
      counts.live++;
      if(match.state==='WATCHING') counts.watching++;
      if(match.state==='NEAR SIGNAL') counts.near++;
      if(match.state==='SIGNAL') counts.signal++;
      priceStatuses[match.priceStatus]=(priceStatuses[match.priceStatus]||0)+1;
    }
    return {ok:!state.lastError,updatedAt:iso(state.lastSuccess),cycle:state.cycle||0,configVersion:activeConfig?.version||null,counts,priceStatuses,matches:[...matches].sort((a,b)=>priority(a.state)-priority(b.state)||((b.rolling?.recent?.homePressure||0)-(a.rolling?.recent?.homePressure||0))),lastError:state.lastError};
  }

  async statistics(state){
    let epoch=await this.state.storage.get(PUBLIC_STATS_EPOCH_KEY);
    if(!epoch||epoch.version!==PUBLIC_STATS_EPOCH_VERSION){
      await this.state.storage.transaction(async transaction=>{
        const existing=await transaction.get(PUBLIC_STATS_EPOCH_KEY);
        if(existing?.version===PUBLIC_STATS_EPOCH_VERSION){
          epoch=existing;
          return;
        }
        epoch=createPublicStatsEpoch(state.signals||[],now());
        await transaction.put(PUBLIC_STATS_EPOCH_KEY,epoch);
      });
    }
    const scopedSignals=selectPublicStatsSignals(state.signals||[],epoch);
    const summary=summarizePublicStats(scopedSignals);
    return {
      updatedAt:iso(state.lastSuccess),
      scope:'PUBLIC_STATS_EPOCH',
      epochVersion:epoch.version,
      epochStartedAt:iso(epoch.startedAt),
      epochSeedCount:Array.isArray(epoch.seedKeys)?epoch.seedKeys.length:0,
      ...summary,
    };
  }

  health(state,config=DEFAULT_CONFIG,active=null,pending=null){
    const allMatches=state.matches||[];
    const matches=allMatches.filter(match=>!match.freshness?.sourceStale);
    const counts={
      matches:matches.length,watching:matches.filter(match=>match.state==='WATCHING').length,
      near:matches.filter(match=>match.state==='NEAR SIGNAL').length,liveStats:matches.filter(match=>match.freshness?.liveAt).length,
      market:matches.filter(match=>match.market?.status==='AH READY').length,
      signals:state.signals?.length||0,pendingSignals:(state.signals||[]).filter(item=>!item.settlement).length,
      settledSignals:(state.signals||[]).filter(item=>item.settlement).length,stale:allMatches.length-matches.length,
    };
    return {
      ok:!state.lastError,lastCycle:iso(state.lastCycle),lastSuccess:iso(state.lastSuccess),lastError:state.lastError,
      cycle:state.cycle||0,source:state.source||{},counts,configVersion:active?.version||null,pendingConfigVersion:pending?.version||null,
      config:{minute:`${config.minuteFrom}-${config.minuteTo}`,rollingWindowMinutes:config.rollingWindowMinutes,side:'HOME',market:'FULL MATCH LIVE AH',bookmaker:'1xBet via Odds-API.io · Bet365 compare · Bet365 via Oddspedia',oddsSource:'Odds-API.io · The Odds API · API-Football · Oddspedia · TotalCorner fallback',scoreFilter:config.scoreDifferenceFilterEnabled?'ON':'OFF',hunger:`${config.trendConditionsRequired}/3`,oddsMaximum:config.oddsMaximumEnabled?config.oddsMaximum:'DISABLED',oddsMinimum:config.oddsMinimum,allowedLines:config.allowedLinesMode==='ANY'?'ANY':config.allowedSelectionLines,freshnessSec:config.maximumPriceAgeSeconds,pollSec:Math.round(config.cycleEveryMs/1000)}
    };
  }

  async runCycle(){
    const previous=await this.read();
    const upcomingCycle=(previous.cycle||0)+1;
    const activeEnvelope=await this.activateConfigForCycle(upcomingCycle);
    const config=engineConfig(activeEnvelope.config);
    const started=now();
    const next={...previous,lastCycle:started,cycle:upcomingCycle,lastError:null,source:{today:false,ended:false,oddsApi:{status:'IDLE',checked:0,eligible:0,mapped:0,ready:0,readyByBookmaker:{'1xBet':0,'Bet365':0}},theOddsApi:{status:'IDLE',checked:0,mapped:0,ready:0},apiFootball:{status:'IDLE',checked:0,eligible:0,fixtureMapped:0,mapped:0,ready:0,recoveryCandidates:0,recoveredSignals:0},oddspedia:{status:'IDLE',checked:0,mapped:0,ready:0,selected:0},totalCorner:{status:'IDLE',checked:0,ready:0,selected:0}},configVersion:activeEnvelope.version};
    try{
      const todayHtml=await getHtml(config.scanUrl,config,started); next.source.today=true;
      const watchMinuteFrom=Math.max(0,config.minuteFrom-(2*config.rollingWindowMinutes)-2);
      const rows=parseToday(todayHtml,config.sourceHost).filter(match=>Number.isFinite(match.minute)&&match.minute>=watchMinuteFrom&&match.minute<=config.minuteTo&&match.score.home!=null&&match.score.away!=null);
      const previousMatches=new Map((previous.matches||[]).map(match=>[match.id,match]));

      const baseMatches=await Promise.all(rows.map(async match=>{
        let live={}; let liveOk=false;
        try{const parsed=parseLiveDetail(await getHtml(match.urls.stats,config,started));if(parsed.valid){live=parsed;liveOk=true;}}catch{}
        if(!liveOk){try{const parsed=parseLiveDetail(await getHtml(match.urls.live,config,started));if(parsed.valid){live=parsed;liveOk=true;}}catch{}}
        const stats={
          attacks:mergePair(live.attacks,match.attack),dangerousAttack:mergePair(live.dangerousAttack,match.dangerousAttack),
          shotsOn:safePair(live.shotsOn),shotsOff:safePair(live.shotsOff),corners:mergePair(live.corners,match.corner),possession:safePair(live.possession),
        };
        const score=live.score?.home!=null&&live.score?.away!=null?live.score:match.score;
        const minute=Number.isFinite(live.minute)?live.minute:match.minute;
        const previousMatch=previousMatches.get(match.id);
        let base=trackSourceFreshness({id:match.id,league:match.league,home:match.home,away:match.away,minute,score,stats,urls:match.urls,freshness:{todayAt:started,liveAt:liveOk?started:null,oddsAt:null},market:null},previousMatch,started,config.sourceStaleAfterMs);
        base.snapshots=appendMatchSnapshot(previousMatch?.snapshots||[],base,started);
        base.rolling=buildRollingAnalysis(base.snapshots,config);
        if(base.freshness.sourceStale) return {...base,state:'STALE',side:'home',priceStatus:'AH WAIT',checks:{},passed:0,total:6};
        return {...base,...evaluate(base,config,null,started)};
      }));

      const eligible=baseMatches.filter(match=>match.detectionPassed&&!match.freshness?.sourceStale);
      const priceCandidates=baseMatches.filter(match=>!match.freshness?.sourceStale);
      next.source.oddsApi.eligible=eligible.length;
      next.source.oddsApi.checked=priceCandidates.length;
      const marketById=new Map();
      const marketComparisonById=new Map();
      const source2FetchPromise=priceCandidates.length&&this.env.THE_ODDS_API_KEY
        ?fetchTheOddsApiLiveSoccer(this.env.THE_ODDS_API_KEY,started).then(value=>({value,error:null}),error=>({value:null,error}))
        :null;
      const [cachedApiFootballBet,cachedApiFootballFixtures]=priceCandidates.length&&this.env.API_FOOTBALL_KEY
        ?await Promise.all([
          this.state.storage.get('apiFootballAsianHandicapBet'),
          this.state.storage.get('apiFootballLiveFixtures'),
        ])
        :[null,null];
      const source3FetchPromise=priceCandidates.length&&this.env.API_FOOTBALL_KEY
        ?fetchApiFootballLiveAsianHandicaps(
          this.env.API_FOOTBALL_KEY,cachedApiFootballBet,9000,
          bet=>this.state.storage.put('apiFootballAsianHandicapBet',bet).catch(()=>{}),
          cachedApiFootballFixtures,
          fixtures=>this.state.storage.put('apiFootballLiveFixtures',fixtures).catch(()=>{}),
          started,
        ).then(value=>({value,error:null}),error=>({value:null,error}))
        :null;

      if(priceCandidates.length){
        if(!this.env.ODDS_API_KEY){
          next.source.oddsApi.status='KEY_MISSING';
          for(const match of priceCandidates){
            const oneXBet=marketState(REAL_BOOKMAKER,'ODDS NOT READY','odds_api_key_missing');
            const bet365=marketState(COMPARE_BOOKMAKER,'ODDS NOT READY','odds_api_key_missing');
            marketById.set(match.id,oneXBet);
            marketComparisonById.set(match.id,{oneXBet,bet365});
          }
        }else{
          try{
            const events=await fetchLiveEvents(this.env.ODDS_API_KEY);
            const mapped=mapMatchesToOddsEvents(priceCandidates,events);
            const selected=mapped.filter(item=>item.event);
            const selectedIds=new Set(selected.map(item=>String(item.event.id)));
            const eventIds=[...selectedIds];
            const payloads=[];
            for(let i=0;i<eventIds.length;i+=ODDS_BATCH_SIZE){
              const batch=await fetchMultiOdds(this.env.ODDS_API_KEY,eventIds.slice(i,i+ODDS_BATCH_SIZE),ODDS_BOOKMAKER_QUERY);
              payloads.push(...batch);
            }
            const oddsById=new Map(payloads.map(payload=>[String(payload?.id),payload]));
            let mappedCount=0,readyCount=0,bet365ReadyCount=0,readyAnyCount=0;
            for(const item of mapped){
              const match=item.match;
              if(!item.event){
                const oneXBet=marketState(REAL_BOOKMAKER,'ODDS NOT MATCHED','match_mapper_no_event');
                const bet365=marketState(COMPARE_BOOKMAKER,'ODDS NOT MATCHED','match_mapper_no_event');
                marketById.set(match.id,oneXBet);
                marketComparisonById.set(match.id,{oneXBet,bet365});
                continue;
              }
              mappedCount++;
              const eventId=String(item.event.id);
              const payload=oddsById.get(eventId);
              const preference={
                allowedLines:config.allowedLinesMode==='SELECTED'?config.allowedSelectionLines:[],
                oddsMin:config.oddsMinimum,
                oddsMax:config.oddsMaximumEnabled?config.oddsMaximum:null,
              };
              const oneXBet=parsedBookmakerMarket(payload,REAL_BOOKMAKER,preference,eventId,item);
              const bet365=parsedBookmakerMarket(payload,COMPARE_BOOKMAKER,preference,eventId,item);
              marketById.set(match.id,oneXBet);
              marketComparisonById.set(match.id,{oneXBet,bet365});
              if(oneXBet.status==='AH READY') readyCount++;
              if(bet365.status==='AH READY') bet365ReadyCount++;
              if(oneXBet.status==='AH READY'||bet365.status==='AH READY') readyAnyCount++;
            }
            next.source.oddsApi={status:'READY',checked:priceCandidates.length,eligible:eligible.length,mapped:mappedCount,ready:readyCount,readyAny:readyAnyCount,readyByBookmaker:{'1xBet':readyCount,'Bet365':bet365ReadyCount},events:events.length,checkedAt:started};
          }catch(error){
            const reason=`price_fetch_failed:${String(error?.message||error)}`;
            next.source.oddsApi={status:'ERROR',checked:priceCandidates.length,eligible:eligible.length,mapped:0,ready:0,readyAny:0,readyByBookmaker:{'1xBet':0,'Bet365':0},error:reason,checkedAt:started};
            for(const match of priceCandidates){
              const oneXBet=marketState(REAL_BOOKMAKER,'ODDS NOT READY',reason);
              const bet365=marketState(COMPARE_BOOKMAKER,'ODDS NOT READY',reason);
              marketById.set(match.id,oneXBet);
              marketComparisonById.set(match.id,{oneXBet,bet365});
            }
          }
        }
      }

      const theOddsMarketById=new Map();
      if(priceCandidates.length){
        if(!this.env.THE_ODDS_API_KEY){
          next.source.theOddsApi={status:'KEY_MISSING',checked:priceCandidates.length,mapped:0,ready:0,checkedAt:started};
          for(const match of priceCandidates) theOddsMarketById.set(match.id,theOddsApiUnavailable('the_odds_api_key_missing'));
        }else{
          try{
            const source2Fetch=await source2FetchPromise;
            if(source2Fetch.error) throw source2Fetch.error;
            const response=source2Fetch.value;
            const built=buildTheOddsApiMarkets(priceCandidates,response.events,config,started);
            for(const item of built.results) theOddsMarketById.set(item.matchId,item.market);
            next.source.theOddsApi={
              status:'READY',checked:priceCandidates.length,mapped:built.mapped,ready:0,events:response.events.length,
              received:response.received,quota:response.quota,checkedAt:started,
            };
          }catch(error){
            const reason=`price_fetch_failed:${String(error?.message||error)}`;
            next.source.theOddsApi={status:'ERROR',checked:priceCandidates.length,mapped:0,ready:0,error:reason,checkedAt:started};
            for(const match of priceCandidates) theOddsMarketById.set(match.id,theOddsApiUnavailable(reason));
          }
        }
      }

      const apiFootballMarketById=new Map();
      if(priceCandidates.length){
        if(!this.env.API_FOOTBALL_KEY){
          next.source.apiFootball={status:'KEY_MISSING',checked:priceCandidates.length,eligible:eligible.length,fixtureMapped:0,mapped:0,ready:0,recoveryCandidates:0,recoveredSignals:0,checkedAt:started};
          for(const match of priceCandidates) apiFootballMarketById.set(match.id,apiFootballUnavailable('api_football_key_missing'));
        }else{
          try{
            const source3Fetch=await source3FetchPromise;
            if(source3Fetch.error) throw source3Fetch.error;
            const response=source3Fetch.value;
            const built=buildApiFootballMarkets(priceCandidates,response.events,config,started,response.bet,response.fixtures);
            for(const item of built.results) apiFootballMarketById.set(item.matchId,item.market);
            if(!cachedApiFootballBet||Number(cachedApiFootballBet.id)!==Number(response.bet.id)){
              await this.state.storage.put('apiFootballAsianHandicapBet',response.bet);
            }
            next.source.apiFootball={
              status:'READY',checked:priceCandidates.length,eligible:eligible.length,fixtureMapped:built.fixtureMapped,mapped:built.mapped,ready:0,
              recoveryCandidates:0,recoveredSignals:0,selected:0,bookmakerUnverified:0,
              events:response.events.length,received:response.received,fixtures:response.fixturesReceived,
              fixturesError:response.fixturesError,fixtureCache:response.fixtureCache,fixtureCacheAgeSeconds:response.fixtureCacheAgeSeconds,
              pages:response.pages,requests:response.requests,
              bet:response.bet,quota:response.quota,checkedAt:started,
            };
          }catch(error){
            const reason=`price_fetch_failed:${String(error?.message||error)}`;
            next.source.apiFootball={status:'ERROR',checked:priceCandidates.length,eligible:eligible.length,fixtureMapped:0,mapped:0,ready:0,recoveryCandidates:0,recoveredSignals:0,error:reason,checkedAt:started};
            for(const match of priceCandidates) apiFootballMarketById.set(match.id,apiFootballUnavailable(reason));
          }
        }
      }

      const oddspediaMarketById=new Map();
      if(!eligible.length){
        next.source.oddspedia={status:'NOT_NEEDED',checked:0,mapped:0,ready:0,selected:0,checkedAt:started};
      }else{
        try{
          const built=await fetchOddspediaBet365Markets(eligible,config,started);
          for(const item of built.results||[]) oddspediaMarketById.set(item.matchId,item.market);
          next.source.oddspedia={
            status:built.status,checked:built.checked,mapped:built.mapped,ready:built.ready,selected:0,
            events:built.events??0,error:built.error??null,checkedAt:started,
          };
        }catch(error){
          const reason=`price_fetch_failed:${String(error?.message||error)}`;
          next.source.oddspedia={status:'ERROR',checked:eligible.length,mapped:0,ready:0,selected:0,error:reason,checkedAt:started};
          for(const match of eligible) oddspediaMarketById.set(match.id,oddspediaUnavailable(reason));
        }
      }

      const totalCornerMarketById=new Map();
      // Pinnacle via TotalCorner is a main judge for every detector-eligible match.
      // Keep the existing one-request-per-match behavior and do not expand this to all WATCHING cards.
      const totalCornerCandidates=eligible;
      next.source.totalCorner.checked=totalCornerCandidates.length;
      if(!totalCornerCandidates.length){
        next.source.totalCorner.status='NOT_NEEDED';
      }else{
        const fetched=await Promise.all(totalCornerCandidates.map(async match=>{
          try{
            const document=await getDocument(handicapPanelUrl(match.urls.odds),config,started);
            return [match.id,parseBet365Asian(document.html,document.sourceUpdatedAt)];
          }catch(error){
            return [match.id,totalCornerMarketState('AH UNAVAILABLE',`price_fetch_failed:${String(error?.message||error)}`)];
          }
        }));
        for(const [matchId,market] of fetched) totalCornerMarketById.set(matchId,market);
        next.source.totalCorner.status='READY';
        next.source.totalCorner.checkedAt=started;
      }

      const enriched=baseMatches.map(match=>{
        if(match.freshness?.sourceStale) return match;
        const source1Market=marketById.get(match.id)||marketState(REAL_BOOKMAKER,'ODDS NOT READY','price_not_checked');
        const source2Market=theOddsMarketById.get(match.id)||theOddsApiUnavailable('price_not_checked');
        const source3Market=apiFootballMarketById.get(match.id)||apiFootballUnavailable('price_not_checked');
        const source5Market=oddspediaMarketById.get(match.id)||oddspediaUnavailable(match.detectionPassed?'price_not_checked':'detection_not_ready');
        const source4Market=totalCornerMarketById.get(match.id)||totalCornerMarketState('AH UNAVAILABLE',match.detectionPassed?'judge_not_available':'judge_not_needed');
        const marketComparison=marketComparisonById.get(match.id)||{oneXBet:source1Market,bet365:marketState(COMPARE_BOOKMAKER,'ODDS NOT READY','price_not_checked')};
        const priceSourceSnapshots=buildPriceSourceSnapshots(new Map([['source1',source1Market],['source2',source2Market],['source3',source3Market],['source5',source5Market],['source4',source4Market]]),config,started);
        const selectedPriceSnapshot=selectPriceSourceWithFallback(priceSourceSnapshots);
        const market=selectedPriceSnapshot?.market||source1Market;
        // Keep provider plumbing hidden: SOURCE 4 is the internal TotalCorner Bet365 carrier and SOURCE 25 is duplicate Pinnacle/Nowgoal.
        const priceSources=priceSourceSnapshots.filter(source=>source.id!=='source4'&&source.id!=='source25').map(publicPriceSourceSnapshot);
        const selectedPrice=publicPriceSourceSnapshot(selectedPriceSnapshot);
        const base={...match,market,marketComparison,priceSources,selectedPrice,freshness:{...match.freshness,oddsAt:selectedPrice?.sourceUpdatedAt??null}};
        return {...base,...evaluate(base,config,market,started)};
      });

      if(next.source.theOddsApi.status==='READY'){
        next.source.theOddsApi.ready=enriched.filter(match=>match.priceSources?.find(source=>source.id==='source2')?.status==='PASS').length;
      }
      next.source.oddspedia.ready=enriched.filter(match=>match.priceSources?.find(source=>source.id==='source5')?.status==='PASS').length;
      next.source.oddspedia.selected=enriched.filter(match=>match.selectedPrice?.id==='source5').length;
      next.source.totalCorner.ready=enriched.filter(match=>match.priceSources?.find(source=>source.id==='source26')?.status==='PASS').length;
      next.source.totalCorner.selected=enriched.filter(match=>match.selectedPrice?.id==='source26').length;
      const source3Summary=summarizeApiFootballRecovery(enriched,apiFootballMarketById);
      next.source.apiFootball.recoveryCandidates=source3Summary.recoveryCandidates;
      if(next.source.apiFootball.status==='READY'){
        Object.assign(next.source.apiFootball,source3Summary);
      }

      const signals=[...(previous.signals||[])];
      for(const match of enriched){
        if(canLockSignal(signals,match,config)) signals.push(createLockedSignal(match,activeEnvelope,config,started));
      }

      try{
        const endedHtml=await getHtml(config.endedUrl,config,started); next.source.ended=true;
        const ended=new Map(parseEnded(endedHtml,config.sourceHost).map(match=>[match.id,match]));
        for(const signal of signals){
          const endedFinal=ended.get(signal.matchId)?.score||null;
          const storedFinal=signal.settlement?.finalScore||null;
          const finalScore=endedFinal||storedFinal;
          if(!finalScore||finalScore.home==null||finalScore.away==null) continue;
          if(signal.settlement?.settlementRuleVersion===2) continue;
          const previousSettledAt=signal.settlement?.settledAt??null;
          const corrected=settleAsian(signal,finalScore);
          signal.settlement={...corrected,finalScore,settledAt:previousSettledAt??started,...(previousSettledAt?{correctedAt:started}:{})};
        }
      }catch(error){next.source.ended=false;next.source.endedError=String(error?.message||error);}
      next.matches=enriched; next.signals=signals; next.lastSuccess=now();
      await this.write(next);
      return this.health(next,config,activeEnvelope,null);
    }catch(error){
      next.lastError=String(error?.message||error); await this.write(next);
      return this.health(next,config,activeEnvelope,null);
    }
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,x-settings-key','access-control-max-age':'86400'}});
    if(url.pathname==='/') return j({service:'nomadtips3-live-engine',status:'running',endpoints:['/feed','/statistics','/health','/config']});
    const id=env.ENGINE.idFromName('primary');
    return env.ENGINE.get(id).fetch(new Request(`https://engine.local${url.pathname}${url.search}`,request));
  },
  async scheduled(event,env,context){
    const id=env.ENGINE.idFromName('primary');
    context.waitUntil(env.ENGINE.get(id).fetch('https://engine.local/cycle'));
  }
};
