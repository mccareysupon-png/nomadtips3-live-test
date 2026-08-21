import baseWorker, { Car31State as BaseCar31State } from './index.js';
import {fetchLiveEvents,fetchMultiOdds,mapGoalooToOddsEvents,parseAsianHandicap,marketAgeSeconds} from './real-market.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const SOURCE_DETAIL_IN='https://live10.goaloo28.com/gf/data/detailIn.js';
const ENRICH_SECONDS=15;
const CORE_STATS_KEYS=['possession','attacks','dangerous_attacks','shots','shots_on_target','corners'];
const DETAIL_IN_CORE_MAP={0:'corners',4:'shots',5:'shots_on_target',6:'attacks',7:'dangerous_attacks',11:'possession'};
const REAL_BOOKMAKER_DEFAULT='1xbet';
const REAL_MARKET_MAX_EVENTS=10;
const MARKET_ONLY_GATES=new Set(['REAL MARKET','REAL PRICE AGE','MARKET / ODDS']);

const number=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...JSON_HEADERS,'cache-control':cache}});

// Kept only for CAR 3.1 parser-regression compatibility. CAR 3.4 never uses this
// Goaloo odds parser for signal creation; its AH/Odds must come from real-market.js.
function marketOdd(raw,market){const v=number(raw);if(v===null)return null;if(market==='1X2')return v;return v>=0&&v<1.5?Number((1+v).toFixed(3)):v;}
export function parseRunOdds(source){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw||!raw.includes('!'))continue;
    const parts=raw.split('!'),id=String(parts.shift()||'').trim();if(!/^\d+$/.test(id))continue;
    const rows=parts.map(p=>String(p).split(',').map(x=>number(x))),ah=rows[0]||[],one=rows[1]||[],ou=rows[2]||[];
    const record={oneXtwo:one.length>=3?{home:marketOdd(one[0],'1X2'),draw:marketOdd(one[1],'1X2'),away:marketOdd(one[2],'1X2'),raw:{home:one[0],draw:one[1],away:one[2]}}:null,asianHandicap:ah.length>=3?{home:marketOdd(ah[0],'AH'),line:number(ah[1]),away:marketOdd(ah[2],'AH'),raw:{home:ah[0],away:ah[2]}}:null,overUnder:ou.length>=3?{over:marketOdd(ou[0],'OU'),line:number(ou[1]),under:marketOdd(ou[2],'OU'),raw:{over:ou[0],under:ou[2]}}:null,providerCompanyId:8};
    if(record.oneXtwo||record.asianHandicap||record.overUnder)out.set(id,record);
  }
  return out;
}

const DETAIL_TYPE={1:'GOAL',11:'SUBSTITUTION'};
export function parseDetailEvents(source,allowedIds=null){
  const out=new Map(),re=/rq\[\d+\]\s*=\s*["']([^"']*)["']\s*;?/g;
  for(const m of String(source||'').matchAll(re)){
    const p=m[1].split('^'),id=String(p[0]||'').trim();if(!id||(allowedIds&&!allowedIds.has(id)))continue;
    const side=String(p[1]||'0')==='1'?'AWAY':'HOME',code=number(p[2]),minute=number(String(p[3]||'').replace(/[^\d]/g,'')),detail=String(p[4]||'').trim();
    const event={minute,type:DETAIL_TYPE[code]||`EVENT ${code??'?'}`,code,team:side,detail};if(!out.has(id))out.set(id,[]);out.get(id).push(event);
  }
  for(const events of out.values())events.sort((a,b)=>(a.minute??999)-(b.minute??999));return out;
}

export function parseDetailInStats(source,allowedIds=null){
  const out=new Map(),assignment=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const m of String(source||'').matchAll(assignment)){
    const id=String(m[1]);if(allowedIds&&!allowedIds.has(id))continue;const stats={},rowRe=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const row of m[2].matchAll(rowRe)){const key=DETAIL_IN_CORE_MAP[Number(row[1])];if(!key)continue;const home=number(row[2]),away=number(row[3]);if(home!==null&&away!==null)stats[key]={home,away};}
    if(Object.keys(stats).length)out.set(id,stats);
  }
  return out;
}

function coreStatsCompleteLocal(stats){return CORE_STATS_KEYS.every(k=>number(stats?.[k]?.home)!==null&&number(stats?.[k]?.away)!==null);}
export function mergeCoreStats(match,detailStats){
  if(!match||typeof match!=='object')return{match,filled:[],applied:[],structuredPairs:0,structuredComplete:false,complete:false};
  const stats={...(match.stats||{})},applied=[];
  for(const key of CORE_STATS_KEYS){const structured=detailStats?.[key];if(!structured)continue;const home=number(structured.home),away=number(structured.away);if(home===null||away===null)continue;stats[key]={home,away};applied.push(key);}
  match.stats=stats;match.coreStatsComplete=coreStatsCompleteLocal(stats);match.coreStatsProvenance=applied.length===CORE_STATS_KEYS.length?'DETAIL_IN_STRUCTURED':applied.length?'DETAIL_IN_PARTIAL':'BASE';match.coreStatsStructuredPairs=applied.length;
  if(match.coreStatsComplete&&Array.isArray(match.warnings))match.warnings=match.warnings.filter(w=>w!=='CORE_STATS_INCOMPLETE');
  const filled=applied.flatMap(key=>[`${key}.home`,`${key}.away`]);return{match,filled,applied,structuredPairs:applied.length,structuredComplete:applied.length===CORE_STATS_KEYS.length,complete:match.coreStatsComplete};
}
export function isStructuredCoreBaseline(match){return Boolean(match&&match.coreStatsProvenance==='DETAIL_IN_STRUCTURED'&&coreStatsCompleteLocal(match.stats));}

const pair=(obj,key)=>({home:number(obj?.[key]?.home)||0,away:number(obj?.[key]?.away)||0});
const delta=(cur,prev,key)=>{const c=pair(cur.stats,key),p=pair(prev?.stats,key);return{home:c.home-p.home,away:c.away-p.away};};
const sideOf=d=>d.home>d.away?'HOME':d.away>d.home?'AWAY':null;
export function deriveActivity(current,previous){
  if(!previous)return{type:'POSSESSION',team:(number(current.stats?.possession?.home)||0)>=(number(current.stats?.possession?.away)||0)?'HOME':'AWAY',strength:0};
  const goal={home:(number(current.score?.home)||0)-(number(previous.score?.home)||0),away:(number(current.score?.away)||0)-(number(previous.score?.away)||0)};
  const checks=[['GOAL',goal],['RED CARD',delta(current,previous,'red_cards')],['YELLOW CARD',delta(current,previous,'yellow_cards')],['CORNER',delta(current,previous,'corners')],['SHOT ON TARGET',delta(current,previous,'shots_on_target')],['SHOT',delta(current,previous,'shots')],['DANGEROUS ATTACK',delta(current,previous,'dangerous_attacks')],['ATTACK',delta(current,previous,'attacks')]];
  for(const [type,d] of checks){const team=sideOf(d);if(team)return{type,team,strength:Math.max(d.home,d.away)};}
  const hp=number(current.stats?.possession?.home)||0,ap=number(current.stats?.possession?.away)||0;return{type:'POSSESSION',team:hp>=ap?'HOME':'AWAY',strength:Math.abs(hp-ap)};
}

async function sourceText(url,seconds){
  const bucket=Math.floor(Date.now()/(seconds*1000));const response=await fetch(`${url}?t=${bucket}`,{headers:{'user-agent':'NOMADTIPS3-CAR3.4-RealMarketAudit/1.0','accept':'*/*','accept-language':'en-US,en;q=0.8'},cf:{cacheTtl:seconds,cacheEverything:true}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.text();
}
function pressure(stats,w){let h=0,a=0;for(const [k,wt] of Object.entries(w||{})){h+=(number(stats?.[k]?.home)||0)*wt;a+=(number(stats?.[k]?.away)||0)*wt;}const t=Math.max(.0001,h+a);return{home:Math.round(h/t*100),away:Math.round(a/t*100)};}
function selectedSide(match,config,p){if(config.side==='HOME')return'HOME';if(config.side==='AWAY')return'AWAY';return p.away>p.home?'AWAY':'HOME';}
function engineSidePair(obj,side){return side==='AWAY'?{selected:number(obj?.away)||0,opponent:number(obj?.home)||0}:{selected:number(obj?.home)||0,opponent:number(obj?.away)||0};}
function selectedMetric(obj,side){const home=number(obj?.home),away=number(obj?.away);if(home===null||away===null)return null;return side==='AWAY'?away:home;}
export function baselineFor(matchId,side,snapshots,config,current){
  const map={dangerous:'dangerous_attacks',shots:'shots',sot:'shots_on_target',corners:'corners'};
  const baseline={dangerous:null,shots:null,sot:null,corners:null};
  for(const snap of snapshots){
    const f=(snap.matches||[]).find(m=>String(m.id)===String(matchId));
    if(!f||Number(f.minute)<config.minuteMin)continue;
    for(const [target,key] of Object.entries(map)){
      if(baseline[target]!==null)continue;
      const value=selectedMetric(f.stats?.[key],side);
      if(value!==null)baseline[target]=value;
    }
    if(Object.values(baseline).every(v=>v!==null))break;
  }
  for(const [target,key] of Object.entries(map)){
    if(baseline[target]!==null)continue;
    const value=selectedMetric(current?.[key],side);
    baseline[target]=value===null?0:value;
  }
  return baseline;
}

function evaluateWithRealAh(match,config,snapshots){
  const p=pressure(match.stats,config.momentumWeights),side=selectedSide(match,config,p),selMomentum=side==='AWAY'?p.away:p.home;
  const base=baselineFor(match.sourceMatchId,side,snapshots,config,match.stats),cur={dangerous:engineSidePair(match.stats.dangerous_attacks,side).selected,shots:engineSidePair(match.stats.shots,side).selected,sot:engineSidePair(match.stats.shots_on_target,side).selected,corners:engineSidePair(match.stats.corners,side).selected};
  const evidence={dangerous:cur.dangerous-base.dangerous,shots:cur.shots-base.shots,sot:cur.sot-base.sot,corners:cur.corners-base.corners};
  const evRules=[[config.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,config.attackEvidenceDangerousAttacksMin],[config.attackEvidenceShotsEnabled,evidence.shots,config.attackEvidenceShotsMin],[config.attackEvidenceShotsOnTargetEnabled,evidence.sot,config.attackEvidenceShotsOnTargetMin],[config.attackEvidenceCornersEnabled,evidence.corners,config.attackEvidenceCornersMin]].filter(r=>r[0]);
  const passed=evRules.filter(r=>r[1]>=r[2]).length,required=config.attackEvidenceRequirement==='ALL'?evRules.length:Number(config.attackEvidenceRequirement),score=engineSidePair(match.score,side),red=engineSidePair(match.stats.red_cards,side),goalGap=Math.abs(score.selected-score.opponent);
  const rawHomeLine=number(match.odds?.asianHandicap?.line),selectedLine=rawHomeLine===null?null:(side==='AWAY'?-rawHomeLine:rawHomeLine),odds=number(match.odds?.asianHandicap?.[side==='AWAY'?'away':'home']);
  const oddsOk=odds!==null&&odds>=config.oddsMin&&(config.oddsMax===null||odds<=config.oddsMax),ahOk=selectedLine!==null&&selectedLine>=config.ahMin&&(config.ahMax===null||selectedLine<=config.ahMax),redOk=config.redCardPolicy==='ALLOW'||(config.redCardPolicy==='REJECT_SELECTED'?red.selected===0:(red.selected===0&&red.opponent===0));
  const marketState=match.realMarket?.status||'NOT_FOUND',marketAge=number(match.realMarket?.marketAgeSeconds),ageOk=marketAge===null||marketAge<=config.realMarketMaxAgeSeconds;
  const gates=[['MINUTE',match.minute>=config.minuteMin&&match.minute<=config.minuteMax,`${config.minuteMin}-${config.minuteMax}'`],['CORE STATS',!config.requireCoreStats||match.coreStatsComplete,match.coreStatsComplete?'complete':'partial'],['REAL MARKET',marketState==='MATCH',marketState],['REAL PRICE AGE',ageOk,marketAge===null?'n/a':`${marketAge}s / ≤${config.realMarketMaxAgeSeconds}s`],['MARKET / ODDS',oddsOk&&ahOk,odds===null?'waiting 1xBet AH':`AH ${selectedLine>=0?'+':''}${selectedLine} @ ${odds}`],['MOMENTUM',selMomentum>=config.momentumMin,`${selMomentum}% / ≥${config.momentumMin}%`],['EVIDENCE',!config.attackEvidenceEnabled||passed>=required,`${passed}/${evRules.length} · need ${config.attackEvidenceRequirement}`],['GOAL GAP',!config.goalGapLimited||goalGap<=config.maxGoalGap,`${goalGap} / max ${config.maxGoalGap}`],['RED CARD',redOk,`${red.selected}-${red.opponent}`],['SOURCE',match.coreStatsComplete?100>=config.matchConfidenceMin:70>=config.matchConfidenceMin,match.coreStatsComplete?'100%':'70%']];
  const pass=gates.every(g=>g[1]);return{decision:pass?'SHADOW SIGNAL':selMomentum>=Math.max(1,config.momentumMin-7)?'NEAR':'WATCH',reason:pass?`confirmation ${config.confirmationRounds} rounds required`:'one or more gates not ready',side,momentum:selMomentum,evidence,gates,line:selectedLine,rawLine:rawHomeLine,selectedLine,odds,entryScore:{home:match.score.home,away:match.score.away}};
}

function bangkokDate(iso){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}catch{return String(iso).slice(0,10)}}
export function advanceConfirmationStreak(streaks,key,passed){const next=passed?(Number(streaks[key])||0)+1:0;streaks[key]=next;return next;}

// Price/API calls are expensive. Reuse the exact final evaluator with a synthetic
// valid market, then ignore the three market-only gates. This keeps the Goaloo-side
// logic identical while calling 1xBet only when every non-price condition is ready.
function marketCandidate(match,config,snapshots){
  const dummyLine=number(config.ahMin)??1,dummyOdds=Math.max(1.01,number(config.oddsMin)??1.7);
  const probe={...match,odds:{...(match.odds||{}),asianHandicap:{line:dummyLine,home:dummyOdds,away:dummyOdds}},realMarket:{source:'PRECHECK',status:'MATCH',marketAgeSeconds:0}};
  const evaluation=evaluateWithRealAh(probe,config,snapshots);
  return evaluation.gates.filter(([name])=>!MARKET_ONLY_GATES.has(name)).every(([,ok])=>Boolean(ok));
}

export class Car31State extends BaseCar31State{
  async scan(trigger='cron'){
    const baseResponse=await super.scan(trigger);if(!baseResponse.ok)return baseResponse;
    const basePayload=await baseResponse.clone().json().catch(()=>({})),at=basePayload.generatedAt||new Date().toISOString(),bookmaker=String(this.env.REAL_MARKET_BOOKMAKER||REAL_BOOKMAKER_DEFAULT).toLowerCase();
    try{
      const [detailInResult,configResponse]=await Promise.all([sourceText(SOURCE_DETAIL_IN,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)})),super.fetch(new Request('https://car34.internal/config'))]);
      const configPayload=await configResponse.json(),config={...configPayload.config,market:'AH',engineEnabled:configPayload.config?.engineEnabled!==false,realMarketMaxAgeSeconds:Math.max(15,Math.min(600,Number(configPayload.config?.realMarketMaxAgeSeconds||this.env.REAL_MARKET_MAX_AGE_SECONDS||120)))};
      const latest=await this.state.storage.get('latest')||{generatedAt:at,matches:[]},snapshots=await this.state.storage.get('snapshots')||[],confirmationStreaks=await this.state.storage.get('confirmationStreaksV34')||{},history=await this.state.storage.get('history')||[];
      const ids=new Set((latest.matches||[]).map(m=>String(m.sourceMatchId))),detailStatsMap=detailInResult.ok?parseDetailInStats(detailInResult.value,ids):new Map();
      let detailMatched=0,detailAppliedMatches=0,structuredCompleteMatches=0;
      for(const match of latest.matches||[]){const detailStats=detailStatsMap.get(String(match.sourceMatchId));if(detailStats)detailMatched++;const merged=mergeCoreStats(match,detailStats);if(merged.applied.length)detailAppliedMatches++;if(merged.structuredComplete)structuredCompleteMatches++;match.odds={...(match.odds||{}),asianHandicap:null};match.realMarket={source:bookmaker,status:'WAITING',checkedAt:at};}

      // Persist the enriched current snapshot. Evidence baseline is metric-level,
      // so any available structured pair can be used without waiting for all stats.
      const currentSnapshot=snapshots.at(-1);
      if(currentSnapshot&&String(currentSnapshot.at||'')===String(at)){
        for(const snapMatch of currentSnapshot.matches||[])mergeCoreStats(snapMatch,detailStatsMap.get(String(snapMatch.id)));
        await this.state.storage.put('snapshots',snapshots);
      }

      let realStatus=config.engineEnabled?'OK':'PAUSED',realError=null,events=[],oddsPayloads=[],mappedCount=0,ahMatched=0;
      const eligible=config.engineEnabled?(latest.matches||[]).filter(m=>marketCandidate(m,config,snapshots)):[];
      if(!config.engineEnabled){realError=null;}
      else if(!this.env.ODDS_API_KEY){realStatus='KEY_MISSING';realError='ODDS_API_KEY_MISSING';}
      else if(eligible.length){
        try{
          events=await fetchLiveEvents(this.env.ODDS_API_KEY,bookmaker);
          const mapped=mapGoalooToOddsEvents(eligible,events),selected=mapped.filter(x=>x.event).sort((a,b)=>b.matchConfidence-a.matchConfidence).slice(0,REAL_MARKET_MAX_EVENTS),eventIds=selected.map(x=>x.event.id);
          mappedCount=selected.length;oddsPayloads=await fetchMultiOdds(this.env.ODDS_API_KEY,eventIds,bookmaker);
          const oddsById=new Map(oddsPayloads.map(x=>[String(x?.id),x])),selectedByMatch=new Map(selected.map(x=>[String(x.match.sourceMatchId),x]));
          for(const match of latest.matches||[]){
            const mappedItem=selectedByMatch.get(String(match.sourceMatchId));if(!mappedItem){if(marketCandidate(match,config,snapshots))match.realMarket={source:bookmaker,status:'NOT_FOUND',checkedAt:at};continue;}
            const payload=oddsById.get(String(mappedItem.event.id)),marketPressure=pressure(match.stats,config.momentumWeights),marketSide=selectedSide(match,config,marketPressure),ah=parseAsianHandicap(payload,bookmaker,{side:marketSide,ahMin:config.ahMin,ahMax:config.ahMax,oddsMin:config.oddsMin,oddsMax:config.oddsMax}),age=marketAgeSeconds(ah);
            match.realMarket={source:bookmaker,status:ah?'MATCH':'NO_AH',checkedAt:at,eventId:mappedItem.event.id,eventHome:mappedItem.event.home,eventAway:mappedItem.event.away,mappingConfidence:mappedItem.matchConfidence,mapping:mappedItem.matchBreakdown,oddsUpdatedAt:ah?.updatedAt||null,marketAgeSeconds:age,alternatives:ah?.alternatives??0,matchedPreference:ah?.matchedPreference??false,matchedOdds:ah?.matchedOdds??false};
            if(ah){match.odds.asianHandicap={line:ah.line,home:ah.home,away:ah.away,updatedAt:ah.updatedAt,provider:bookmaker};ahMatched++;}
          }
        }catch(error){realStatus='ERROR';realError=String(error?.message||error);for(const match of latest.matches||[])if(marketCandidate(match,config,snapshots))match.realMarket={source:bookmaker,status:'ERROR',error:realError,checkedAt:at};}
      }

      const today=bangkokDate(at),todayCount=history.filter(r=>r.selectionDate===today).length;let newCount=0;
      for(const match of latest.matches||[]){
        const engine=evaluateWithRealAh(match,config,snapshots),key=`${match.sourceMatchId}:${engine.side}:AH`;
        advanceConfirmationStreak(confirmationStreaks,key,engine.decision==='SHADOW SIGNAL');
        const dailyBlocked=config.signalLimitEnabled&&todayCount+newCount>=config.maxSignalsPerDay,existing=history.some(r=>r.key===key);
        if(!existing&&!dailyBlocked&&confirmationStreaks[key]>=config.confirmationRounds){
          const selectedTeam=engine.side==='AWAY'?match.away:match.home;
          history.push({key,id:match.sourceMatchId,selectionDate:today,selectedAt:at,league:match.league,home:match.home,away:match.away,selectedSide:engine.side,selectedTeam,entryMinute:match.minute,entryScore:{...match.score},market:'AH',line:engine.selectedLine,rawLine:engine.rawLine,selectedLine:engine.selectedLine,linePerspective:'SELECTED',odds:engine.odds,bookmaker,pricingSource:'REAL_MARKET_1XBET',oddsEventId:match.realMarket?.eventId||null,oddsUpdatedAt:match.realMarket?.oddsUpdatedAt||null,marketAgeSeconds:match.realMarket?.marketAgeSeconds??null,mappingConfidence:match.realMarket?.mappingConfidence??null,momentum:engine.momentum,evidence:engine.evidence,kickoffUtc:match.kickoffUtc,status:'PENDING',ftStatus:null,settledAt:null,finalScore:null,result:'PENDING'});newCount++;
        }
        match.engine={...engine,market:'AH',streak:confirmationStreaks[key]||0,dailyBlocked};
        match.enrichment={...(match.enrichment||{}),odds:match.realMarket?.status==='MATCH'?'REAL_1XBET':'NONE',coreStats:match.coreStatsProvenance||'BASE'};
      }
      while(history.length>5000)history.shift();
      const matchCount=(latest.matches||[]).length,coreStatsReady=(latest.matches||[]).filter(m=>m.coreStatsComplete).length;
      latest.sourceMode='GOALOO_STATS_PLUS_REAL_1XBET_AH';latest.market='AH';latest.engineEnabled=config.engineEnabled;latest.realMarketPipe={status:realStatus,source:bookmaker,api:'Odds-API.io',eventsAvailable:events.length,eligibleMatches:eligible.length,mappedMatches:mappedCount,ahMatched,matchCount,maxOddsEventsPerCycle:REAL_MARKET_MAX_EVENTS,keyConfigured:Boolean(this.env.ODDS_API_KEY),engineEnabled:config.engineEnabled,maxMarketAgeSeconds:config.realMarketMaxAgeSeconds,error:realError,at};
      latest.coreStatsPipe={status:detailInResult.ok?'DIRECT':'ERROR',feed:'detailIn.js',detailMatched,filledMatches:detailAppliedMatches,structuredCompleteMatches,coreStatsReady,matchCount,error:detailInResult.ok?null:detailInResult.error,at};
      await this.state.storage.put('latest',latest);await this.state.storage.put('history',history);await this.state.storage.put('confirmationStreaksV34',confirmationStreaks);await this.state.storage.put('realMarketPipe',latest.realMarketPipe);await this.state.storage.put('coreStatsPipe',latest.coreStatsPipe);
      return json({ok:true,...latest,cycleMs:basePayload.cycleMs??null,historyTotal:history.length,newSignals:newCount,realMarketPipe:latest.realMarketPipe,coreStatsPipe:latest.coreStatsPipe});
    }catch(error){const pipe={status:'ERROR',source:String(this.env.REAL_MARKET_BOOKMAKER||REAL_BOOKMAKER_DEFAULT),error:String(error?.message||error),at};await this.state.storage.put('realMarketPipe',pipe);return json({ok:false,error:pipe.error,realMarketPipe:pipe},502);}
  }
  async health(){const base=await super.health(),realMarketPipe=await this.state.storage.get('realMarketPipe')||null,coreStatsPipe=await this.state.storage.get('coreStatsPipe')||null;return{...base,engine:'CAR 3.4 REAL MARKET AUDIT',sourceMode:'GOALOO_STATS_PLUS_REAL_1XBET_AH',market:'AH',cron:'EVERY_2_MINUTES',realMarketPipe,coreStatsPipe};}
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/debug/source-status'){const latest=await this.live(),samples=(latest.matches||[]).filter(m=>m.realMarket?.status!=='WAITING').slice(0,12).map(m=>({id:m.sourceMatchId,home:m.home,away:m.away,minute:m.minute,score:m.score,realMarket:m.realMarket,asianHandicap:m.odds?.asianHandicap,engine:{side:m.engine?.side,line:m.engine?.line,odds:m.engine?.odds,decision:m.engine?.decision,streak:m.engine?.streak,gates:m.engine?.gates,evidence:m.engine?.evidence}}));return json({ok:true,engine:'CAR 3.4',generatedAt:new Date().toISOString(),realMarketPipe:await this.state.storage.get('realMarketPipe')||null,samples});}
    return super.fetch(request);
  }
}

function forceAhConfigRequest(request){return request.clone().json().then(body=>new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({...body,market:'AH'})}));}
export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/config'&&request.method==='POST'){const forced=await forceAhConfigRequest(request);return baseWorker.fetch(forced,env,ctx);}
    const response=await baseWorker.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/config'){
      const payload=await response.json().catch(()=>({ok:false}));return json({...payload,config:{...(payload.config||{}),market:'AH'},marketLocked:'AH',realMarketBookmaker:String(env.REAL_MARKET_BOOKMAKER||REAL_BOOKMAKER_DEFAULT).toLowerCase()});
    }
    return response;
  },
  async scheduled(event,env,ctx){return baseWorker.scheduled(event,env,ctx);}
};