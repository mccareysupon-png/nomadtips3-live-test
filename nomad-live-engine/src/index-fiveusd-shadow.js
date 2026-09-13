import baseWorker,{EngineState as BaseEngineState} from './index.js';
import {FIVEUSD_CADENCE} from './fivedollar.js';
import {FiveUsdNativeRuntime} from './fivedollar-runtime.js';
import {buildNativeCandidateShadow} from './fivedollar-candidate-shadow.js';
import {summarizeFiveUsdFreshness} from './fivedollar-freshness.js';
import {selectFiveUsdRefereeConsensus} from './fivedollar-referee-consensus.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const MIN_ALARM_DELAY_MS=250;
const CANDIDATE_HISTORY_KEY='fiveUsdNativeCandidateHistoryV1';
const CANDIDATE_STATE_KEY='fiveUsdNativeCandidateShadowV1';
const REFEREE_PREFIX='fiveUsdNativeReferee:';
const now=()=>Date.now();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

export function legacyCycleDue(state,config,at=now()){
  const every=Math.max(1000,Number(config?.cycleEveryMs)||55_000);
  return !Number.isFinite(Number(state?.lastCycle))||at-Number(state.lastCycle)>=every;
}

export function nextNativeAlarmAt(cycleStartedAt,at=now(),cycleMs=FIVEUSD_CADENCE.liveRefreshMs){
  return Math.max(at+MIN_ALARM_DELAY_MS,Number(cycleStartedAt)+Math.max(1000,Number(cycleMs)||FIVEUSD_CADENCE.liveRefreshMs));
}

export function refereeFreshnessView(snapshot,config,at=now()){
  if(!snapshot) return null;
  const maxAgeSeconds=finite(config?.maximumPriceAgeSeconds)?Math.max(1,Number(config.maximumPriceAgeSeconds)):90;
  const summary=summarizeFiveUsdFreshness(snapshot.referees,{at,maxAgeMs:maxAgeSeconds*1000});
  return {
    checkedAt:summary.checkedAt,
    maxAgeSeconds,
    total:summary.total,
    ready:summary.ready,
    fresh:summary.fresh,
    stale:summary.stale,
    invalid:summary.invalid,
    basisCounts:summary.rows.reduce((counts,row)=>{
      const basis=row?.freshness?.freshnessBasis||'UNKNOWN';
      counts[basis]=(counts[basis]||0)+1;
      return counts;
    },{}),
  };
}

export function refereeDecisionShadow(snapshot,config,side='home',at=now()){
  if(!snapshot) return null;
  const decision=selectFiveUsdRefereeConsensus(snapshot.referees,config,side,at);
  return {
    ok:decision.ok,
    status:decision.status,
    reason:decision.reason??null,
    side:decision.side,
    line:decision.line??null,
    odds:decision.odds??null,
    homeLine:decision.homeLine??null,
    homeOdds:decision.homeOdds??null,
    awayOdds:decision.awayOdds??null,
    selectedSourceId:decision.selectedSourceId??null,
    selectedBookmaker:decision.selectedBookmaker??null,
    consensusCount:decision.consensusCount??0,
    eligibleCount:decision.eligibleCount??0,
    total:decision.total??0,
    consensusMedianOdds:decision.consensusMedianOdds??null,
    consensusBookmakers:decision.consensusBookmakers??[],
    freshnessBasis:decision.freshnessBasis??'OBSERVED',
    sourceUpdatedAt:null,
    observedAt:decision.observedAt??at,
    votingEnabled:false,
    signalAuthority:false,
  };
}

export class EngineState extends BaseEngineState{
  constructor(state,env){
    super(state,env);
    this.fiveUsdNative=new FiveUsdNativeRuntime(state.storage,env);
  }

  legacyShadowDisabled(){return String(this.env?.FIVEUSD_SHADOW_LEGACY_DISABLED||'false').toLowerCase()==='true';}

  maxRefereeStartsPerTick(){
    const raw=Number(this.env?.FIVEUSD_MAX_REFEREE_STARTS_PER_TICK);
    if(!Number.isFinite(raw)||raw<0) return 1;
    if(raw===0) return Infinity;
    return Math.max(1,Math.min(100,Math.floor(raw)));
  }

  async candidateShadow(){return await this.state.storage.get(CANDIDATE_STATE_KEY)||null;}

  async updateFiveUsdCandidateShadow(config,at=now()){
    const snapshot=await this.fiveUsdNative.snapshot();
    const liveFixtures=Array.isArray(snapshot?.live?.fixtures)?snapshot.live.fixtures:[];
    const history=await this.state.storage.get(CANDIDATE_HISTORY_KEY)||{};
    const evaluation=buildNativeCandidateShadow(liveFixtures,history,config,at);
    await this.state.storage.put(CANDIDATE_HISTORY_KEY,evaluation.history);

    const maxStarts=this.maxRefereeStartsPerTick();
    const refereeRefreshMs=this.fiveUsdNative.refereeRefreshMs();
    const maximumPriceAgeSeconds=finite(config?.maximumPriceAgeSeconds)?Math.max(1,Number(config.maximumPriceAgeSeconds)):90;
    let starts=0;
    let consensusReady=0;
    const refereeAttempts=[];
    const candidateRows=[];
    let rateBlocked=false;

    for(const candidate of evaluation.candidates){
      const key=`${REFEREE_PREFIX}${candidate.fixtureId}`;
      const previous=await this.state.storage.get(key)||null;
      const ageMs=finite(previous?.observedAt)?Math.max(0,at-Number(previous.observedAt)):null;
      const freshForRefresh=ageMs!==null&&ageMs<refereeRefreshMs;
      const canStart=!rateBlocked&&!freshForRefresh&&(maxStarts===Infinity||starts<maxStarts);

      if(canStart){
        starts+=1;
        try{
          const result=await this.fiveUsdNative.refreshReferee(candidate.fixtureId);
          const freshness=refereeFreshnessView(result,config,now());
          const decision=refereeDecisionShadow(result,config,candidate.side,now());
          refereeAttempts.push({
            fixtureId:candidate.fixtureId,ok:true,readyCount:result?.readyCount??0,observedAt:result?.observedAt??null,
            freshCount:freshness?.fresh??0,staleCount:freshness?.stale??0,invalidCount:freshness?.invalid??0,
            consensusOk:decision?.ok===true,consensusCount:decision?.consensusCount??0,
          });
        }catch(error){
          const message=String(error?.message||error);
          refereeAttempts.push({fixtureId:candidate.fixtureId,ok:false,error:message});
          if(message.includes('RATE_GUARD')) rateBlocked=true;
        }
      }

      const current=await this.state.storage.get(key)||previous;
      const freshness=refereeFreshnessView(current,config,at);
      const decisionShadow=refereeDecisionShadow(current,config,candidate.side,at);
      if(decisionShadow?.ok===true) consensusReady+=1;
      candidateRows.push({...candidate,referee:current?{
        mode:current.mode??'SHADOW_ONLY',shadowOnly:current.shadowOnly!==false,votingEnabled:false,
        observedAt:current.observedAt??null,readyCount:current.readyCount??0,
        freshness,
        freshReadyCount:freshness?.fresh??0,
        staleCount:freshness?.stale??0,
        invalidCount:freshness?.invalid??0,
      }:null,decisionShadow});
    }

    const state={
      updatedAt:at,
      source:'5DollarFootballAPI',
      sourceOfTruth:true,
      shadowOnly:true,
      signalAuthority:false,
      liveCount:evaluation.summary.live,
      candidateCount:evaluation.summary.candidates,
      consensusReady,
      refereeStarts:starts,
      refereeRefreshMs,
      maximumPriceAgeSeconds,
      maxRefereeStartsPerTick:maxStarts===Infinity?0:maxStarts,
      refereeAttempts,
      rows:candidateRows,
    };
    await this.state.storage.put(CANDIDATE_STATE_KEY,state);
    return state;
  }

  async armAlarm(delay=1500){
    if(!this.continuousCycles()) return;
    if(await this.state.storage.getAlarm()!=null) return;
    const firstDelay=this.fiveUsdNative.enabled()?MIN_ALARM_DELAY_MS:delay;
    await this.state.storage.setAlarm(now()+firstDelay);
  }

  async alarm(){
    if(!this.continuousCycles()) return;
    if(!this.fiveUsdNative.enabled()) return super.alarm();

    const cycleStartedAt=now();
    try{
      const config=await this.currentConfig();
      await this.fiveUsdNative.tick();
      await this.updateFiveUsdCandidateShadow(config,now());
      if(!this.legacyShadowDisabled()){
        const engineState=await this.read();
        if(legacyCycleDue(engineState,config,now())&&!this.running){
          this.running=true;
          try{await this.runCycle();}finally{this.running=false;}
        }
      }
    }finally{
      await this.state.storage.setAlarm(nextNativeAlarmAt(cycleStartedAt,now(),this.fiveUsdNative.liveRefreshMs()));
    }
  }

  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/fiveusd-native'&&request.method==='GET'){
      return json({
        ok:true,
        ...await this.fiveUsdNative.health(),
        legacyShadowDisabled:this.legacyShadowDisabled(),
        candidateShadow:await this.candidateShadow(),
        snapshot:await this.fiveUsdNative.snapshot(),
      });
    }

    const response=await super.fetch(request);
    if(url.pathname!=='/health'||request.method!=='GET') return response;

    let body=null;
    try{body=await response.clone().json();}catch{body={ok:false,error:'health_decode_failed'};}
    const candidateShadow=await this.candidateShadow();
    return json({...body,fiveUsdNative:{
      ...await this.fiveUsdNative.health(),
      legacyShadowDisabled:this.legacyShadowDisabled(),
      candidateShadow:candidateShadow?{
        updatedAt:candidateShadow.updatedAt,
        sourceOfTruth:candidateShadow.sourceOfTruth,
        shadowOnly:candidateShadow.shadowOnly,
        signalAuthority:candidateShadow.signalAuthority,
        liveCount:candidateShadow.liveCount,
        candidateCount:candidateShadow.candidateCount,
        consensusReady:candidateShadow.consensusReady,
        refereeStarts:candidateShadow.refereeStarts,
        refereeRefreshMs:candidateShadow.refereeRefreshMs,
        maximumPriceAgeSeconds:candidateShadow.maximumPriceAgeSeconds,
        maxRefereeStartsPerTick:candidateShadow.maxRefereeStartsPerTick,
      }:null,
    }},response.status);
  }
}

export default baseWorker;
