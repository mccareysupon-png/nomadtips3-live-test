import {
  CONFIG_HISTORY_LIMIT,CONFIG_SCHEMA_VERSION,DEFAULT_CONFIG,editableConfig,engineConfig,validateEditableConfig
} from './config.js';
import {parseToday,parseLiveDetail,parseBet365Asian,parseEnded,handicapPanelUrl} from './parser.js';
import {buildRollingAnalysis,evaluate} from './detector.js';
import {settleAsian} from './settlement.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const SETTINGS_KEY_SHA256='1cc981355210634b60e5798eced35e7f441e9b8c8e6d4484b632986bcf31b1c2';
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const now=()=>Date.now();
const iso=value=>value==null?null:new Date(value).toISOString();
const clone=value=>JSON.parse(JSON.stringify(value));
const safePair=pair=>({home:Number.isFinite(pair?.home)?pair.home:null,away:Number.isFinite(pair?.away)?pair.away:null});
const emptyState=()=>({lastCycle:null,lastSuccess:null,lastError:null,matches:[],signals:[],cycle:0,source:{today:false,ended:false}});
const sourceRequestUrl=(url,token=now())=>{const result=new URL(url);result.searchParams.set('_nomad_cycle',String(token));return result.toString();};

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
  return {
    matchId:match.id,league:match.league,home:match.home,away:match.away,selection:'home',line:match.selectionLine,odds:match.selectionOdds,
    bookmaker:'Bet365',market:'FULL MATCH LIVE AH',minute:match.minute,entryScore:match.score,stats:match.stats,
    hunger:match.hunger,rolling:match.rolling,lockedAt,sourceUpdatedAt:match.market.sourceUpdatedAt,settlement:null,
    configSnapshot:{schemaVersion:activeEnvelope.schemaVersion,version:activeEnvelope.version,updatedAt:iso(activeEnvelope.updatedAt),appliesFromCycle:activeEnvelope.appliesFromCycle,values:editableConfig(config)}
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
    await this.state.storage.setAlarm(now()+100);
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
  async armAlarm(delay=1500){if(await this.state.storage.getAlarm()==null) await this.state.storage.setAlarm(now()+delay);}
  async alarm(){
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
    if(request.method==='GET') return j({
      ok:true,activeConfig:clone(configState.active.config),defaultConfig:editableConfig(DEFAULT_CONFIG),
      version:configState.active.version,updatedAt:iso(configState.active.updatedAt),appliesFromCycle:configState.active.appliesFromCycle,
      pending:publicEnvelope(configState.pending),history:configState.history.slice(0,10).map(publicEnvelope),
      config:clone(configState.active.config),defaults:editableConfig(DEFAULT_CONFIG)
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
    if(url.pathname==='/config') return this.handleConfig(request);
    if(url.pathname==='/cycle'){
      if(this.running) return j({ok:true,running:true});
      this.running=true;
      try{return j(await this.runCycle());}finally{this.running=false;}
    }
    const state=await this.read();
    const configState=await this.configState();
    const config=engineConfig(configState.active.config);
    if((!state.lastCycle||now()-state.lastCycle>config.cycleEveryMs*1.2)&&!this.running) this.wakeCycle();
    if(url.pathname==='/feed') return j(this.feed(state,configState.active));
    if(url.pathname==='/statistics') return j(this.statistics(state));
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

  statistics(state){
    const signals=state.signals||[];
    const settled=signals.filter(item=>item.settlement);
    const wins=settled.filter(item=>/WIN/.test(item.settlement.result)).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement.result)).length;
    const pushes=settled.filter(item=>item.settlement.result==='PUSH').length;
    const profit=settled.reduce((total,item)=>total+(item.settlement.profit||0),0);
    const avgOdds=signals.length?signals.reduce((total,item)=>total+item.odds,0)/signals.length:0;
    return {updatedAt:iso(state.lastSuccess),totalSignals:signals.length,settled:settled.length,wins,losses,pushes,winRate:settled.length?wins/settled.length*100:0,avgOdds,profit,roi:settled.length?profit/settled.length*100:0,records:[...signals].sort((a,b)=>b.lockedAt-a.lockedAt).slice(0,200)};
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
      config:{minute:`${config.minuteFrom}-${config.minuteTo}`,rollingWindowMinutes:config.rollingWindowMinutes,side:'HOME',market:'FULL MATCH LIVE AH',bookmaker:'Bet365 via TotalCorner',scoreFilter:config.scoreDifferenceFilterEnabled?'ON':'OFF',hunger:`${config.trendConditionsRequired}/3`,oddsMaximum:config.oddsMaximumEnabled?config.oddsMaximum:'DISABLED',oddsMinimum:config.oddsMinimum,allowedLines:config.allowedLinesMode==='ANY'?'ANY':config.allowedSelectionLines,freshnessSec:config.maximumPriceAgeSeconds,pollSec:Math.round(config.cycleEveryMs/1000)}
    };
  }

  async runCycle(){
    const previous=await this.read();
    const upcomingCycle=(previous.cycle||0)+1;
    const activeEnvelope=await this.activateConfigForCycle(upcomingCycle);
    const config=engineConfig(activeEnvelope.config);
    const started=now();
    const next={...previous,lastCycle:started,cycle:upcomingCycle,lastError:null,source:{today:false,ended:false},configVersion:activeEnvelope.version};
    try{
      const todayHtml=await getHtml(config.scanUrl,config,started); next.source.today=true;
      const watchMinuteFrom=Math.max(0,config.minuteFrom-(2*config.rollingWindowMinutes)-2);
      let rows=parseToday(todayHtml,config.sourceHost).filter(match=>Number.isFinite(match.minute)&&match.minute>=watchMinuteFrom&&match.minute<=config.minuteTo&&match.score.home!=null&&match.score.away!=null);
      const previousMatches=new Map((previous.matches||[]).map(match=>[match.id,match]));
      const enriched=await Promise.all(rows.map(async match=>{
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
        let decision=evaluate(base,config,null,started);
        if(decision.detectionPassed){
          let market;
          try{
            const document=await getDocument(handicapPanelUrl(match.urls.odds),config,started);
            market=parseBet365Asian(document.html,document.sourceUpdatedAt);
          }catch(error){
            market=previousMatch?.market?.status==='AH READY'?previousMatch.market:{status:'AH UNAVAILABLE',reason:`price_fetch_failed:${String(error?.message||error)}`};
          }
          base.market=market;
          if(market.status==='AH READY') base.freshness.oddsAt=market.sourceUpdatedAt;
          decision=evaluate(base,config,market,started);
        }
        return {...base,...decision};
      }));

      const signals=[...(previous.signals||[])];
      for(const match of enriched){
        if(canLockSignal(signals,match,config)) signals.push(createLockedSignal(match,activeEnvelope,config,started));
      }

      try{
        const endedHtml=await getHtml(config.endedUrl,config,started); next.source.ended=true;
        const ended=new Map(parseEnded(endedHtml,config.sourceHost).map(match=>[match.id,match]));
        for(const signal of signals){
          if(signal.settlement) continue;
          const final=ended.get(signal.matchId);
          if(!final||final.score.home==null) continue;
          signal.settlement={...settleAsian(signal,final.score),finalScore:final.score,settledAt:started};
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
