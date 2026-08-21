import mainV3Worker,{Car31State as MainV3Car31State} from './main-v3.js';
import {Car31State as BaseCar31State} from './index.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const SOURCE_DETAIL_IN='https://live10.goaloo28.com/gf/data/detailIn.js';
const SOURCE_ODDS_BASE='https://live10.goaloo28.com/gf/data/odds/en';
const ENRICH_SECONDS=15;
const CORE_STATS_KEYS=['possession','attacks','dangerous_attacks','shots','shots_on_target','corners'];
const DETAIL_IN_CORE_MAP={0:'corners',4:'shots',5:'shots_on_target',6:'attacks',7:'dangerous_attacks',11:'possession'};
const BOOKMAKERS={8:'Bet365',50:'1xBet'};

const number=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});
function bookmakerCompanyId(env){const explicit=Number(env.GOALOO_BOOKMAKER_COMPANY_ID);if(Object.prototype.hasOwnProperty.call(BOOKMAKERS,explicit))return explicit;return String(env.REAL_MARKET_BOOKMAKER||'1xbet').toLowerCase()==='bet365'?8:50;}
function bookmakerName(id){return BOOKMAKERS[id]||`Company ${id}`;}
function oddsSource(id){return `${SOURCE_ODDS_BASE}/runOddsData_${id}.txt`;}
function marketOdd(raw,market){const v=number(raw);if(v===null)return null;if(market==='1X2')return v;return v>=0&&v<1.5?Number((1+v).toFixed(3)):v;}
export function parseGoalooRunOdds(source,providerCompanyId=50){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw||!raw.includes('!'))continue;
    const parts=raw.split('!'),id=String(parts.shift()||'').trim();if(!/^\d+$/.test(id))continue;
    const rows=parts.map(p=>String(p).split(',').map(x=>number(x))),ah=rows[0]||[],one=rows[1]||[],ou=rows[2]||[];
    const record={oneXtwo:one.length>=3?{home:marketOdd(one[0],'1X2'),draw:marketOdd(one[1],'1X2'),away:marketOdd(one[2],'1X2'),raw:{home:one[0],draw:one[1],away:one[2]}}:null,asianHandicap:ah.length>=3&&number(ah[1])!==null?{home:marketOdd(ah[0],'AH'),line:number(ah[1]),away:marketOdd(ah[2],'AH'),linePerspective:'HOME',raw:{home:ah[0],line:ah[1],away:ah[2]}}:null,overUnder:ou.length>=3?{over:marketOdd(ou[0],'OU'),line:number(ou[1]),under:marketOdd(ou[2],'OU'),raw:{over:ou[0],line:ou[1],under:ou[2]}}:null,providerCompanyId:Number(providerCompanyId)||50,providerName:bookmakerName(Number(providerCompanyId)||50)};
    if(record.oneXtwo||record.asianHandicap||record.overUnder)out.set(id,record);
  }
  return out;
}
function parseDetailInStats(source,allowedIds=null){
  const out=new Map(),assignment=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const m of String(source||'').matchAll(assignment)){
    const id=String(m[1]);if(allowedIds&&!allowedIds.has(id))continue;const stats={},rowRe=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const row of m[2].matchAll(rowRe)){const key=DETAIL_IN_CORE_MAP[Number(row[1])];if(!key)continue;const home=number(row[2]),away=number(row[3]);if(home!==null&&away!==null)stats[key]={home,away};}
    if(Object.keys(stats).length)out.set(id,stats);
  }
  return out;
}
function coreStatsComplete(stats){return CORE_STATS_KEYS.every(k=>number(stats?.[k]?.home)!==null&&number(stats?.[k]?.away)!==null);}
function mergeCoreStats(match,detailStats){const stats={...(match?.stats||{})},applied=[];for(const key of CORE_STATS_KEYS){const pair=detailStats?.[key];if(!pair)continue;const home=number(pair.home),away=number(pair.away);if(home===null||away===null)continue;stats[key]={home,away};applied.push(key);}match.stats=stats;match.coreStatsComplete=coreStatsComplete(stats);match.coreStatsProvenance=applied.length===CORE_STATS_KEYS.length?'DETAIL_IN_STRUCTURED':applied.length?'DETAIL_IN_PARTIAL':'BASE';match.coreStatsStructuredPairs=applied.length;if(match.coreStatsComplete&&Array.isArray(match.warnings))match.warnings=match.warnings.filter(w=>w!=='CORE_STATS_INCOMPLETE');return{applied,structuredComplete:applied.length===CORE_STATS_KEYS.length};}
async function sourceText(url,seconds){const bucket=Math.floor(Date.now()/(seconds*1000));const response=await fetch(`${url}?t=${bucket}`,{headers:{'user-agent':'NOMADTIPS3-CAR3.4-GoalooOnly/1.0','accept':'*/*','accept-language':'en-US,en;q=0.8'},cf:{cacheTtl:seconds,cacheEverything:true}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.text();}
function pressure(stats,w){let h=0,a=0;for(const [k,wt] of Object.entries(w||{})){h+=(number(stats?.[k]?.home)||0)*wt;a+=(number(stats?.[k]?.away)||0)*wt;}const t=Math.max(.0001,h+a);return{home:Math.round(h/t*100),away:Math.round(a/t*100)};}
function selectedSide(match,config,p){if(config.side==='HOME')return'HOME';if(config.side==='AWAY')return'AWAY';return p.away>p.home?'AWAY':'HOME';}
function sidePair(obj,side){return side==='AWAY'?{selected:number(obj?.away)||0,opponent:number(obj?.home)||0}:{selected:number(obj?.home)||0,opponent:number(obj?.away)||0};}
function selectedMetric(obj,side){const home=number(obj?.home),away=number(obj?.away);if(home===null||away===null)return null;return side==='AWAY'?away:home;}
function baselineFor(matchId,side,snapshots,config,current){const map={dangerous:'dangerous_attacks',shots:'shots',sot:'shots_on_target',corners:'corners'},baseline={dangerous:null,shots:null,sot:null,corners:null};for(const snap of snapshots){const f=(snap.matches||[]).find(m=>String(m.id)===String(matchId));if(!f||Number(f.minute)<config.minuteMin)continue;for(const [target,key] of Object.entries(map)){if(baseline[target]!==null)continue;const value=selectedMetric(f.stats?.[key],side);if(value!==null)baseline[target]=value;}if(Object.values(baseline).every(v=>v!==null))break;}for(const [target,key] of Object.entries(map)){if(baseline[target]!==null)continue;const value=selectedMetric(current?.[key],side);baseline[target]=value===null?0:value;}return baseline;}
function evaluateGoalooAh(match,config,snapshots){
  const p=pressure(match.stats,config.momentumWeights),side=selectedSide(match,config,p),selMomentum=side==='AWAY'?p.away:p.home;
  const base=baselineFor(match.sourceMatchId,side,snapshots,config,match.stats),cur={dangerous:sidePair(match.stats?.dangerous_attacks,side).selected,shots:sidePair(match.stats?.shots,side).selected,sot:sidePair(match.stats?.shots_on_target,side).selected,corners:sidePair(match.stats?.corners,side).selected};
  const evidence={dangerous:cur.dangerous-base.dangerous,shots:cur.shots-base.shots,sot:cur.sot-base.sot,corners:cur.corners-base.corners};
  const evRules=[[config.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,config.attackEvidenceDangerousAttacksMin],[config.attackEvidenceShotsEnabled,evidence.shots,config.attackEvidenceShotsMin],[config.attackEvidenceShotsOnTargetEnabled,evidence.sot,config.attackEvidenceShotsOnTargetMin],[config.attackEvidenceCornersEnabled,evidence.corners,config.attackEvidenceCornersMin]].filter(r=>r[0]);
  const passed=evRules.filter(r=>r[1]>=r[2]).length,required=config.attackEvidenceRequirement==='ALL'?evRules.length:Number(config.attackEvidenceRequirement),score=sidePair(match.score,side),red=sidePair(match.stats?.red_cards,side),goalGap=Math.abs(score.selected-score.opponent);
  const rawHomeLine=number(match.odds?.asianHandicap?.line),selectedLine=rawHomeLine===null?null:(side==='AWAY'?-rawHomeLine:rawHomeLine),odds=number(match.odds?.asianHandicap?.[side==='AWAY'?'away':'home']);
  const oddsOk=odds!==null&&odds>=config.oddsMin&&(config.oddsMax===null||odds<=config.oddsMax),ahOk=selectedLine!==null&&selectedLine>=config.ahMin&&(config.ahMax===null||selectedLine<=config.ahMax),redOk=config.redCardPolicy==='ALLOW'||(config.redCardPolicy==='REJECT_SELECTED'?red.selected===0:(red.selected===0&&red.opponent===0)),marketState=match.realMarket?.status||'NO_AH';
  const gates=[['MINUTE',match.minute>=config.minuteMin&&match.minute<=config.minuteMax,`${config.minuteMin}-${config.minuteMax}'`],['CORE STATS',!config.requireCoreStats||match.coreStatsComplete,match.coreStatsComplete?'complete':'partial'],['REAL MARKET',marketState==='MATCH',marketState],['REAL PRICE AGE',marketState==='MATCH',marketState==='MATCH'?'Goaloo current cycle':'n/a'],['MARKET / ODDS',oddsOk&&ahOk,odds===null?'waiting Goaloo AH':`AH ${selectedLine>=0?'+':''}${selectedLine} @ ${odds}`],['MOMENTUM',selMomentum>=config.momentumMin,`${selMomentum}% / ≥${config.momentumMin}%`],['EVIDENCE',!config.attackEvidenceEnabled||passed>=required,`${passed}/${evRules.length} · need ${config.attackEvidenceRequirement}`],['GOAL GAP',!config.goalGapLimited||goalGap<=config.maxGoalGap,`${goalGap} / max ${config.maxGoalGap}`],['RED CARD',redOk,`${red.selected}-${red.opponent}`],['SOURCE',match.coreStatsComplete?100>=config.matchConfidenceMin:70>=config.matchConfidenceMin,match.coreStatsComplete?'100%':'70%']];
  const pass=gates.every(g=>g[1]);return{decision:pass?'SHADOW SIGNAL':selMomentum>=Math.max(1,config.momentumMin-7)?'NEAR':'WATCH',reason:pass?`confirmation ${config.confirmationRounds} rounds required`:'one or more gates not ready',side,momentum:selMomentum,evidence,gates,line:selectedLine,rawLine:rawHomeLine,selectedLine,odds,entryScore:{home:match.score.home,away:match.score.away}};
}
function advanceConfirmationStreak(streaks,key,passed){const next=passed?(Number(streaks[key])||0)+1:0;streaks[key]=next;return next;}
function bangkokDate(iso){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}catch{return String(iso).slice(0,10);}}

export class Car31State extends MainV3Car31State{
  async scan(trigger='cron'){
    await this.lockSingleConfirmationRound();
    const baseResponse=await BaseCar31State.prototype.scan.call(this,trigger);if(!baseResponse.ok)return baseResponse;
    const basePayload=await baseResponse.clone().json().catch(()=>({})),at=basePayload.generatedAt||new Date().toISOString(),companyId=bookmakerCompanyId(this.env),bookmaker=bookmakerName(companyId),providerSource=oddsSource(companyId);
    try{
      const [oddsResult,detailResult,configResponse]=await Promise.all([sourceText(providerSource,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)})),sourceText(SOURCE_DETAIL_IN,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)})),BaseCar31State.prototype.fetch.call(this,new Request('https://car34.internal/config'))]);
      const configPayload=await configResponse.json(),config={...configPayload.config,market:'AH',engineEnabled:configPayload.config?.engineEnabled!==false,confirmationRounds:1};
      const latest=await this.state.storage.get('latest')||{generatedAt:at,matches:[]},snapshots=await this.state.storage.get('snapshots')||[],confirmationStreaks=await this.state.storage.get('confirmationStreaksV34')||{},history=await this.state.storage.get('history')||[];
      const ids=new Set((latest.matches||[]).map(m=>String(m.sourceMatchId))),oddsMap=oddsResult.ok?parseGoalooRunOdds(oddsResult.value,companyId):new Map(),detailStatsMap=detailResult.ok?parseDetailInStats(detailResult.value,ids):new Map();
      let oddsMatched=0,ahMatched=0,detailMatched=0,detailAppliedMatches=0,structuredCompleteMatches=0;
      for(const match of latest.matches||[]){
        const id=String(match.sourceMatchId),detailStats=detailStatsMap.get(id);if(detailStats)detailMatched++;const merged=mergeCoreStats(match,detailStats);if(merged.applied.length)detailAppliedMatches++;if(merged.structuredComplete)structuredCompleteMatches++;
        const liveOdds=oddsMap.get(id),ah=liveOdds?.asianHandicap||null;if(liveOdds)oddsMatched++;
        if(ah&&number(ah.line)!==null&&number(ah.home)!==null&&number(ah.away)!==null){ahMatched++;match.odds={...(match.odds||{}),asianHandicap:{...ah,updatedAt:at,provider:bookmaker,providerCompanyId:companyId,linePerspective:'HOME'}};match.realMarket={source:'Goaloo',bookmaker,status:'MATCH',checkedAt:at,oddsUpdatedAt:at,marketAgeSeconds:0,feed:`runOddsData_${companyId}`,linePerspective:'HOME',mapping:'GOALOO_MATCH_ID'};match.currentAh={status:'MATCH',line:ah.line,homeOdds:ah.home,awayOdds:ah.away,updatedAt:at,provider:`${bookmaker} · Goaloo`,marketAgeSeconds:0,linePerspective:'HOME'};}
        else{match.odds={...(match.odds||{}),asianHandicap:null};match.realMarket={source:'Goaloo',bookmaker,status:oddsResult.ok?'NO_AH':'ERROR',checkedAt:at,oddsUpdatedAt:null,marketAgeSeconds:null,feed:`runOddsData_${companyId}`,linePerspective:'HOME',mapping:'GOALOO_MATCH_ID',error:oddsResult.ok?null:oddsResult.error};match.currentAh={status:oddsResult.ok?'NO_AH':'ERROR',provider:`${bookmaker} · Goaloo`,updatedAt:null,marketAgeSeconds:null,linePerspective:'HOME'};}
      }
      const currentSnapshot=snapshots.at(-1);if(currentSnapshot&&String(currentSnapshot.at||'')===String(at)){for(const snapMatch of currentSnapshot.matches||[])mergeCoreStats(snapMatch,detailStatsMap.get(String(snapMatch.id)));await this.state.storage.put('snapshots',snapshots);}
      const today=bangkokDate(at),todayCount=history.filter(r=>r.selectionDate===today).length;let newCount=0;
      for(const match of latest.matches||[]){const engine=evaluateGoalooAh(match,config,snapshots),key=`${match.sourceMatchId}:${engine.side}:AH`;advanceConfirmationStreak(confirmationStreaks,key,engine.decision==='SHADOW SIGNAL');const dailyBlocked=config.signalLimitEnabled&&todayCount+newCount>=config.maxSignalsPerDay,existing=history.some(r=>r.key===key);if(!existing&&!dailyBlocked&&confirmationStreaks[key]>=config.confirmationRounds){const selectedTeam=engine.side==='AWAY'?match.away:match.home;history.push({key,id:match.sourceMatchId,selectionDate:today,selectedAt:at,league:match.league,home:match.home,away:match.away,selectedSide:engine.side,selectedTeam,entryMinute:match.minute,entryScore:{...match.score},market:'AH',line:engine.selectedLine,rawLine:engine.rawLine,selectedLine:engine.selectedLine,linePerspective:'SELECTED',odds:engine.odds,bookmaker,bookmakerCompanyId:companyId,pricingSource:`GOALOO_RUNODDS_${companyId}`,oddsUpdatedAt:at,marketAgeSeconds:0,goalooLinePerspective:'HOME',momentum:engine.momentum,evidence:engine.evidence,kickoffUtc:match.kickoffUtc,status:'PENDING',ftStatus:null,settledAt:null,finalScore:null,result:'PENDING'});newCount++;}match.engine={...engine,market:'AH',streak:confirmationStreaks[key]||0,dailyBlocked,bookmaker,bookmakerCompanyId:companyId};match.enrichment={...(match.enrichment||{}),odds:match.realMarket?.status==='MATCH'?'GOALOO_DIRECT':'NONE',bookmaker,bookmakerCompanyId:companyId,coreStats:match.coreStatsProvenance||'BASE'};}
      while(history.length>5000)history.shift();
      const matchCount=(latest.matches||[]).length,coreStatsReady=(latest.matches||[]).filter(m=>m.coreStatsComplete).length;
      latest.sourceMode='GOALOO_ONLY_STATS_PLUS_AH';latest.market='AH';latest.engineEnabled=config.engineEnabled;latest.realMarketPipe={status:config.engineEnabled?(oddsResult.ok?'DIRECT':'ERROR'):'PAUSED',source:'Goaloo',bookmaker,bookmakerCompanyId:companyId,feed:`runOddsData_${companyId}`,transport:'GOALOO_DIRECT',api:'NONE',oddsMatched,ahMatched,matchCount,engineEnabled:config.engineEnabled,linePerspective:'HOME',error:oddsResult.ok?null:oddsResult.error,at};latest.coreStatsPipe={status:detailResult.ok?'DIRECT':'ERROR',source:'Goaloo',feed:'detailIn.js',detailMatched,filledMatches:detailAppliedMatches,structuredCompleteMatches,coreStatsReady,matchCount,error:detailResult.ok?null:detailResult.error,at};latest.cardAhPipe={source:'Goaloo',bookmaker,feed:`runOddsData_${companyId}`,transport:'GOALOO_DIRECT',visibleCards:(latest.matches||[]).filter(m=>m.realMarket?.status==='MATCH'||m.engine?.decision==='NEAR'||Number(m.engine?.streak||0)>0).length,at};
      await this.state.storage.put('latest',latest);await this.state.storage.put('history',history);await this.state.storage.put('confirmationStreaksV34',confirmationStreaks);await this.state.storage.put('realMarketPipe',latest.realMarketPipe);await this.state.storage.put('coreStatsPipe',latest.coreStatsPipe);await this.state.storage.put('settlementContract',{version:'BET365_V4',reference:'BET365_FOOTBALL_RULES',settlement:'market_aware_live',asianHandicap:'post_entry_score',asianHandicapLinePerspective:'selected_team',quarterLines:'split_stake_50_50',updatedAt:at});
      return json({ok:true,...latest,cycleMs:basePayload.cycleMs??null,historyTotal:history.length,newSignals:newCount,realMarketPipe:latest.realMarketPipe,coreStatsPipe:latest.coreStatsPipe});
    }catch(error){const pipe={status:'ERROR',source:'Goaloo',transport:'GOALOO_DIRECT',api:'NONE',error:String(error?.message||error),at};await this.state.storage.put('realMarketPipe',pipe);return json({ok:false,error:pipe.error,realMarketPipe:pipe},502);}
  }
  async health(){const base=await BaseCar31State.prototype.health.call(this),realMarketPipe=await this.state.storage.get('realMarketPipe')||null,coreStatsPipe=await this.state.storage.get('coreStatsPipe')||null;return{...base,engine:'CAR 3.4 REAL MARKET AUDIT',sourceMode:'GOALOO_ONLY_STATS_PLUS_AH',market:'AH',cron:'EVERY_2_MINUTES',realMarketPipe,coreStatsPipe};}
}
export default mainV3Worker;
