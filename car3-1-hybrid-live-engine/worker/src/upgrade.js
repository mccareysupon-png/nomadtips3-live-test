import baseWorker, { Car31State as BaseCar31State } from './index.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const SOURCE_ODDS='https://live10.goaloo28.com/gf/data/odds/en/runOddsData_8.txt';
const SOURCE_DETAIL='https://live10.goaloo28.com/gf/data/detail.js';
const SOURCE_DETAIL_IN='https://live10.goaloo28.com/gf/data/detailIn.js';
const ENRICH_SECONDS=15;
const CORE_STATS_KEYS=['possession','attacks','dangerous_attacks','shots','shots_on_target','corners'];
const DETAIL_IN_CORE_MAP={0:'corners',4:'shots',5:'shots_on_target',6:'attacks',7:'dangerous_attacks',11:'possession'};

const number=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...JSON_HEADERS,'cache-control':cache}});

function marketOdd(raw,market){
  const v=number(raw); if(v===null)return null;
  if(market==='1X2')return v;
  // AH/O-U public live feed uses HK-style prices in the common 0.xx-1.xx range.
  // Keep raw alongside decimal so runtime checks can detect a format change.
  return v>=0&&v<1.5?Number((1+v).toFixed(3)):v;
}

export function parseRunOdds(source){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw||!raw.includes('!'))continue;
    const parts=raw.split('!'),id=String(parts.shift()||'').trim();
    if(!/^\d+$/.test(id))continue;
    const rows=parts.map(p=>String(p).split(',').map(x=>number(x)));
    const ah=rows[0]||[],one=rows[1]||[],ou=rows[2]||[];
    const record={
      oneXtwo:one.length>=3?{home:marketOdd(one[0],'1X2'),draw:marketOdd(one[1],'1X2'),away:marketOdd(one[2],'1X2'),raw:{home:one[0],draw:one[1],away:one[2]}}:null,
      asianHandicap:ah.length>=3?{home:marketOdd(ah[0],'AH'),line:number(ah[1]),away:marketOdd(ah[2],'AH'),raw:{home:ah[0],away:ah[2]}}:null,
      overUnder:ou.length>=3?{over:marketOdd(ou[0],'OU'),line:number(ou[1]),under:marketOdd(ou[2],'OU'),raw:{over:ou[0],under:ou[2]}}:null,
      providerCompanyId:8
    };
    if(record.oneXtwo||record.asianHandicap||record.overUnder)out.set(id,record);
  }
  return out;
}

// Only codes confirmed from the public client are named. Other codes remain generic.
const DETAIL_TYPE={1:'GOAL',11:'SUBSTITUTION'};
export function parseDetailEvents(source,allowedIds=null){
  const out=new Map(),re=/rq\[\d+\]\s*=\s*["']([^"']*)["']\s*;?/g;
  for(const m of String(source||'').matchAll(re)){
    const p=m[1].split('^'),id=String(p[0]||'').trim();
    if(!id||(allowedIds&&!allowedIds.has(id)))continue;
    const side=String(p[1]||'0')==='1'?'AWAY':'HOME',code=number(p[2]),minute=number(String(p[3]||'').replace(/[^\d]/g,'')),detail=String(p[4]||'').trim();
    const event={minute,type:DETAIL_TYPE[code]||`EVENT ${code??'?'}`,code,team:side,detail};
    if(!out.has(id))out.set(id,[]); out.get(id).push(event);
  }
  for(const events of out.values())events.sort((a,b)=>(a.minute??999)-(b.minute??999));
  return out;
}

// Goaloo public eventdetail.js maps tT_f row[0] through T_Mul_TechKind.
// Confirmed core IDs: 0 corners, 4 shots, 5 shots on goal, 6 attacks,
// 7 dangerous attacks, 11 possession. Parse as data only; never eval source JS.
export function parseDetailInStats(source,allowedIds=null){
  const out=new Map(),assignment=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const m of String(source||'').matchAll(assignment)){
    const id=String(m[1]);
    if(allowedIds&&!allowedIds.has(id))continue;
    const stats={},rowRe=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const row of m[2].matchAll(rowRe)){
      const key=DETAIL_IN_CORE_MAP[Number(row[1])];
      if(!key)continue;
      const home=number(row[2]),away=number(row[3]);
      if(home!==null&&away!==null)stats[key]={home,away};
    }
    if(Object.keys(stats).length)out.set(id,stats);
  }
  return out;
}

function coreStatsCompleteLocal(stats){return CORE_STATS_KEYS.every(k=>number(stats?.[k]?.home)!==null&&number(stats?.[k]?.away)!==null);}
export function mergeCoreStats(match,detailStats){
  if(!match||typeof match!=='object')return{match,filled:[],applied:[],structuredPairs:0,structuredComplete:false,complete:false};
  const stats={...(match.stats||{})},applied=[];
  for(const key of CORE_STATS_KEYS){
    const structured=detailStats?.[key];
    if(!structured)continue;
    const home=number(structured.home),away=number(structured.away);
    if(home===null||away===null)continue;
    stats[key]={home,away};
    applied.push(key);
  }
  match.stats=stats;
  match.coreStatsComplete=coreStatsCompleteLocal(stats);
  match.coreStatsProvenance=applied.length===CORE_STATS_KEYS.length?'DETAIL_IN_STRUCTURED':applied.length?'DETAIL_IN_PARTIAL':'BASE';
  match.coreStatsStructuredPairs=applied.length;
  if(match.coreStatsComplete&&Array.isArray(match.warnings))match.warnings=match.warnings.filter(w=>w!=='CORE_STATS_INCOMPLETE');
  const filled=applied.flatMap(key=>[`${key}.home`,`${key}.away`]);
  return{match,filled,applied,structuredPairs:applied.length,structuredComplete:applied.length===CORE_STATS_KEYS.length,complete:match.coreStatsComplete};
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
  const hp=number(current.stats?.possession?.home)||0,ap=number(current.stats?.possession?.away)||0;
  return{type:'POSSESSION',team:hp>=ap?'HOME':'AWAY',strength:Math.abs(hp-ap)};
}

async function sourceText(url,seconds){
  const bucket=Math.floor(Date.now()/(seconds*1000));
  const response=await fetch(`${url}?t=${bucket}`,{headers:{'user-agent':'NOMADTIPS3-CAR3.1-Live/2.2 (+public live monitor)','accept':'*/*','accept-language':'en-US,en;q=0.8'},cf:{cacheTtl:seconds,cacheEverything:true}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function pressure(stats,w){let h=0,a=0;for(const [k,wt] of Object.entries(w||{})){h+=(number(stats?.[k]?.home)||0)*wt;a+=(number(stats?.[k]?.away)||0)*wt;}const t=Math.max(.0001,h+a);return{home:Math.round(h/t*100),away:Math.round(a/t*100)};}
function selectedSide(match,config,p){if(config.side==='HOME')return'HOME';if(config.side==='AWAY')return'AWAY';return p.away>p.home?'AWAY':'HOME';}
function engineSidePair(obj,side){return side==='AWAY'?{selected:number(obj?.away)||0,opponent:number(obj?.home)||0}:{selected:number(obj?.home)||0,opponent:number(obj?.away)||0};}
function baselineFor(matchId,side,snapshots,config,current){for(const snap of snapshots){const f=(snap.matches||[]).find(m=>String(m.id)===String(matchId));if(!f||Number(f.minute)<config.minuteMin||!isStructuredCoreBaseline(f))continue;return{dangerous:engineSidePair(f.stats?.dangerous_attacks,side).selected,shots:engineSidePair(f.stats?.shots,side).selected,sot:engineSidePair(f.stats?.shots_on_target,side).selected,corners:engineSidePair(f.stats?.corners,side).selected};}return{dangerous:engineSidePair(current.dangerous_attacks,side).selected,shots:engineSidePair(current.shots,side).selected,sot:engineSidePair(current.shots_on_target,side).selected,corners:engineSidePair(current.corners,side).selected};}
function evaluateWithLiveOdds(match,config,snapshots){
  const p=pressure(match.stats,config.momentumWeights),side=selectedSide(match,config,p),selMomentum=side==='AWAY'?p.away:p.home;
  const base=baselineFor(match.sourceMatchId,side,snapshots,config,match.stats),cur={dangerous:engineSidePair(match.stats.dangerous_attacks,side).selected,shots:engineSidePair(match.stats.shots,side).selected,sot:engineSidePair(match.stats.shots_on_target,side).selected,corners:engineSidePair(match.stats.corners,side).selected};
  const evidence={dangerous:cur.dangerous-base.dangerous,shots:cur.shots-base.shots,sot:cur.sot-base.sot,corners:cur.corners-base.corners};
  const evRules=[[config.attackEvidenceDangerousAttacksEnabled,evidence.dangerous,config.attackEvidenceDangerousAttacksMin],[config.attackEvidenceShotsEnabled,evidence.shots,config.attackEvidenceShotsMin],[config.attackEvidenceShotsOnTargetEnabled,evidence.sot,config.attackEvidenceShotsOnTargetMin],[config.attackEvidenceCornersEnabled,evidence.corners,config.attackEvidenceCornersMin]].filter(r=>r[0]);
  const passed=evRules.filter(r=>r[1]>=r[2]).length,required=config.attackEvidenceRequirement==='ALL'?evRules.length:Number(config.attackEvidenceRequirement),score=engineSidePair(match.score,side),red=engineSidePair(match.stats.red_cards,side),goalGap=Math.abs(score.selected-score.opponent);
  let line=null,odds=null;
  if(config.market==='WIN')odds=match.odds?.oneXtwo?.[side==='AWAY'?'away':'home']??null;
  else if(config.market==='AH'){line=match.odds?.asianHandicap?.line??null;odds=match.odds?.asianHandicap?.[side==='AWAY'?'away':'home']??null;}
  else{line=match.odds?.overUnder?.line??config.ouLine;odds=match.odds?.overUnder?.[config.ouDirection==='OVER'?'over':'under']??null;}
  const oddsOk=number(odds)!==null&&number(odds)>=config.oddsMin&&(config.oddsMax===null||number(odds)<=config.oddsMax);
  const ahOk=config.market!=='AH'||(line!==null&&line>=config.ahMin&&(config.ahMax===null||line<=config.ahMax));
  const redOk=config.redCardPolicy==='ALLOW'||(config.redCardPolicy==='REJECT_SELECTED'?red.selected===0:(red.selected===0&&red.opponent===0));
  const gates=[['MINUTE',match.minute>=config.minuteMin&&match.minute<=config.minuteMax,`${config.minuteMin}-${config.minuteMax}'`],['CORE STATS',!config.requireCoreStats||match.coreStatsComplete,match.coreStatsComplete?'complete':'partial'],['MARKET / ODDS',oddsOk&&ahOk,odds===null?'waiting live odds':`${config.market} @ ${odds}`],['MOMENTUM',selMomentum>=config.momentumMin,`${selMomentum}% / ≥${config.momentumMin}%`],['EVIDENCE',!config.attackEvidenceEnabled||passed>=required,`${passed}/${evRules.length} · need ${config.attackEvidenceRequirement}`],['GOAL GAP',!config.goalGapLimited||goalGap<=config.maxGoalGap,`${goalGap} / max ${config.maxGoalGap}`],['RED CARD',redOk,`${red.selected}-${red.opponent}`],['SOURCE',match.coreStatsComplete?100>=config.matchConfidenceMin:70>=config.matchConfidenceMin,match.coreStatsComplete?'100%':'70%']];
  const pass=gates.every(g=>g[1]);
  return{decision:pass?'SHADOW SIGNAL':selMomentum>=Math.max(1,config.momentumMin-7)?'NEAR':'WATCH',reason:pass?`confirmation ${config.confirmationRounds} rounds required`:'one or more gates not ready',side,momentum:selMomentum,evidence,gates,line,odds,entryScore:{home:match.score.home,away:match.score.away}};
}
function bangkokDate(iso){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}catch{return String(iso).slice(0,10)}}

export function advanceConfirmationStreak(streaks,key,passed){
  const next=passed?(Number(streaks[key])||0)+1:0;
  streaks[key]=next;
  return next;
}

export class Car31State extends BaseCar31State{
  async scan(trigger='cron'){
    const baseResponse=await super.scan(trigger);
    if(!baseResponse.ok)return baseResponse;
    const basePayload=await baseResponse.clone().json().catch(()=>({}));
    const at=basePayload.generatedAt||new Date().toISOString();
    try{
      const [oddsSource,detailInResult,configResponse]=await Promise.all([
        sourceText(SOURCE_ODDS,ENRICH_SECONDS),
        sourceText(SOURCE_DETAIL_IN,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)})),
        super.fetch(new Request('https://car31.internal/config'))
      ]);
      const configPayload=await configResponse.json(),config=configPayload.config;
      const latest=await this.state.storage.get('latest')||{generatedAt:at,matches:[]},snapshots=await this.state.storage.get('snapshots')||[],confirmationStreaks=await this.state.storage.get('confirmationStreaksV2')||{},history=await this.state.storage.get('history')||[];
      const ids=new Set((latest.matches||[]).map(m=>String(m.sourceMatchId))),oddsMap=parseRunOdds(oddsSource),detailStatsMap=detailInResult.ok?parseDetailInStats(detailInResult.value,ids):new Map();
      const today=bangkokDate(at),todayCount=history.filter(r=>r.selectionDate===today).length;
      let newCount=0,oddsMatched=0,detailMatched=0,detailAppliedMatches=0,structuredCompleteMatches=0;
      for(const match of latest.matches||[]){
        const id=String(match.sourceMatchId),detailStats=detailStatsMap.get(id);
        if(detailStats)detailMatched++;
        const merged=mergeCoreStats(match,detailStats);
        if(merged.applied.length)detailAppliedMatches++;
        if(merged.structuredComplete)structuredCompleteMatches++;
        const liveOdds=oddsMap.get(id);
        if(liveOdds){match.odds=liveOdds;oddsMatched++;}
        const engine=evaluateWithLiveOdds(match,config,snapshots),key=`${match.sourceMatchId}:${engine.side}:${config.market}`;
        advanceConfirmationStreak(confirmationStreaks,key,engine.decision==='SHADOW SIGNAL');
        const dailyBlocked=config.signalLimitEnabled&&todayCount+newCount>=config.maxSignalsPerDay,existing=history.some(r=>r.key===key);
        if(!existing&&!dailyBlocked&&confirmationStreaks[key]>=config.confirmationRounds){
          const selectedTeam=engine.side==='AWAY'?match.away:match.home;
          history.push({key,id:match.sourceMatchId,selectionDate:today,selectedAt:at,league:match.league,home:match.home,away:match.away,selectedSide:engine.side,selectedTeam,entryMinute:match.minute,entryScore:{...match.score},market:config.market,line:engine.line,odds:engine.odds,ouDirection:config.ouDirection,momentum:engine.momentum,evidence:engine.evidence,kickoffUtc:match.kickoffUtc,status:'PENDING',ftStatus:null,settledAt:null,finalScore:null,result:'PENDING'});
          newCount++;
        }
        match.engine={...engine,streak:confirmationStreaks[key]||0,dailyBlocked};
        match.enrichment={...(match.enrichment||{}),odds:liveOdds?'LIVE':'BASE',coreStats:merged.applied.length?'DETAIL_IN':match.coreStatsComplete?'BASE':'PARTIAL'};
      }
      const currentSnapshot=snapshots.at(-1);
      if(currentSnapshot&&String(currentSnapshot.at||'')===String(at)){
        for(const snapMatch of currentSnapshot.matches||[])mergeCoreStats(snapMatch,detailStatsMap.get(String(snapMatch.id)));
        await this.state.storage.put('snapshots',snapshots);
      }
      while(history.length>5000)history.shift();
      const matchCount=(latest.matches||[]).length,coreStatsReady=(latest.matches||[]).filter(m=>m.coreStatsComplete).length;
      latest.oddsPipe={status:'DIRECT',feed:'runOddsData_8',oddsMatched,matchCount,evaluatedAfterOdds:true,at};
      latest.coreStatsPipe={status:detailInResult.ok?'DIRECT':'ERROR',feed:'detailIn.js',detailMatched,filledMatches:detailAppliedMatches,structuredMatches:detailAppliedMatches,structuredCompleteMatches,coreStatsReady,matchCount,error:detailInResult.ok?null:detailInResult.error,at};
      await this.state.storage.put('latest',latest);
      await this.state.storage.put('history',history);
      await this.state.storage.put('confirmationStreaksV2',confirmationStreaks);
      await this.state.storage.put('oddsPipe',latest.oddsPipe);
      await this.state.storage.put('coreStatsPipe',latest.coreStatsPipe);
      return json({ok:true,...latest,cycleMs:basePayload.cycleMs??null,historyTotal:history.length,newSignals:newCount,oddsPipe:latest.oddsPipe,coreStatsPipe:latest.coreStatsPipe});
    }catch(error){
      const pipe={status:'ERROR',error:String(error?.message||error),evaluatedAfterOdds:false,at};
      await this.state.storage.put('oddsPipe',pipe);
      return baseResponse;
    }
  }
  async health(){
    const base=await super.health(),oddsPipe=await this.state.storage.get('oddsPipe')||null,coreStatsPipe=await this.state.storage.get('coreStatsPipe')||null;
    return{...base,oddsPipe,coreStatsPipe};
  }
}

async function baseJson(path,request,env){
  const u=new URL(request.url);u.pathname=path;u.search='';
  const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);
  const data=await r.json().catch(()=>null);if(!r.ok||!data)throw new Error(`base ${path} HTTP ${r.status}`);return data;
}

async function enrichedLive(request,env){
  const bucket=Math.floor(Date.now()/(ENRICH_SECONDS*1000));
  const cache=typeof caches!=='undefined'?caches.default:null;
  const cacheKey=new Request(`https://car31-cache.invalid/live-enriched?b=${bucket}`);
  const hit=cache?await cache.match(cacheKey):null;if(hit)return hit;
  const [base,snapshotPayload,oddsResult,detailResult]=await Promise.all([
    baseJson('/live',request,env),
    baseJson('/snapshots',request,env).catch(()=>({snapshots:[]})),
    sourceText(SOURCE_ODDS,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)})),
    sourceText(SOURCE_DETAIL,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)}))
  ]);
  const ids=new Set((base.matches||[]).map(m=>String(m.sourceMatchId)));
  const oddsMap=oddsResult.ok?parseRunOdds(oddsResult.value):new Map();
  const eventMap=detailResult.ok?parseDetailEvents(detailResult.value,ids):new Map();
  const snaps=snapshotPayload.snapshots||[],prev=snaps.at(-2)||snaps.at(-1)||{matches:[]};
  let oddsMatched=0,eventMatches=0;
  const matches=(base.matches||[]).map(match=>{
    const id=String(match.sourceMatchId),odds=oddsMap.get(id)||match.odds,events=eventMap.get(id)||match.events||[];
    if(oddsMap.has(id))oddsMatched++;if(events.length)eventMatches++;
    const old=(prev.matches||[]).find(x=>String(x.id)===id);
    return{...match,odds,events,activity:deriveActivity(match,old?{...old,stats:old.stats||{}}:null),enrichment:{...(match.enrichment||{}),odds:oddsMap.has(id)?'LIVE':match.enrichment?.odds||'BASE',events:events.length?'LIVE':'SNAPSHOT'}};
  });
  const payload={...base,matches,enrichedAt:new Date().toISOString(),enrichment:{oddsFeed:oddsResult.ok?'OK':'ERROR',eventFeed:detailResult.ok?'OK':'ERROR',oddsMatched,eventMatches,matchCount:matches.length,oddsError:oddsResult.ok?null:oddsResult.error,eventError:detailResult.ok?null:detailResult.error}};
  const response=json(payload,200,'public, max-age=8');if(cache)await cache.put(cacheKey,response.clone());return response;
}

async function sourceStatus(request,env){
  const r=await enrichedLive(request,env),p=await r.clone().json();
  const samples=(p.matches||[]).filter(m=>m.enrichment?.odds==='LIVE').slice(0,5).map(m=>({id:m.sourceMatchId,home:m.home,away:m.away,oneXtwo:m.odds?.oneXtwo,asianHandicap:m.odds?.asianHandicap,overUnder:m.odds?.overUnder,engineOdds:m.engine?.odds,engineMarketGate:m.engine?.gates?.find(g=>g[0]==='MARKET / ODDS')||null,coreStatsComplete:m.coreStatsComplete,coreStatsSource:m.enrichment?.coreStats||null,eventCount:m.events?.length||0,activity:m.activity}));
  return json({ok:true,brand:'NOMADTIPS3',generatedAt:p.enrichedAt,enrichment:p.enrichment,oddsPipe:p.oddsPipe||null,coreStatsPipe:p.coreStatsPipe||null,samples});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/live')return enrichedLive(request,env);
    if(request.method==='GET'&&url.pathname==='/debug/source-status')return sourceStatus(request,env);
    if(request.method==='GET'&&url.pathname==='/health'){
      const r=await baseWorker.fetch(request,env,ctx),p=await r.json().catch(()=>({ok:false}));
      return json({...p,enrichmentLayer:'V3_DIRECT_ODDS_PIPE',enrichmentRefreshSeconds:ENRICH_SECONDS});
    }
    return baseWorker.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return baseWorker.scheduled(event,env,ctx);}
};