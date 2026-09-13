import baseWorker,{EngineState as BaseEngineState} from './index.js';
import {FIVEUSD_CADENCE} from './fivedollar.js';
import {FiveUsdNativeRuntime} from './fivedollar-runtime.js';
import {buildNativeCandidateShadow} from './fivedollar-candidate-shadow.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const MIN_ALARM_DELAY_MS=250;
const CANDIDATE_HISTORY_KEY='fiveUsdNativeCandidateHistoryV1';
const CANDIDATE_STATE_KEY='fiveUsdNativeCandidateShadowV1';
const REFEREE_PREFIX='fiveUsdNativeReferee:';
const REFEREE_REFRESH_MS=60_000;
const MAX_REFEREE_STARTS_PER_TICK=1;
const now=()=>Date.now();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

export function legacyCycleDue(state,config,at=now()){
  const every=Math.max(1000,Number(config?.cycleEveryMs)||55_000);
  return !Number.isFinite(Number(state?.lastCycle))||at-Number(state.lastCycle)>=every;
}

export function nextNativeAlarmAt(cycleStartedAt,at=now()){
  return Math.max(at+MIN_ALARM_DELAY_MS,Number(cycleStartedAt)+FIVEUSD_CADENCE.liveRefreshMs);
}

export class EngineState extends BaseEngineState{
  constructor(state,env){
    super(state,env);
    this.fiveUsdNative=new FiveUsdNativeRuntime(state.storage,env);
  }

  legacyShadowDisabled(){return String(this.env?.FIVEUSD_SHADOW_LEGACY_DISABLED||'false').toLowerCase()==='true';}

  async candidateShadow(){return await this.state.storage.get(CANDIDATE_STATE_KEY)||null;}

  async updateFiveUsdCandidateShadow(config,at=now()){
    const snapshot=await this.fiveUsdNative.snapshot();
    const liveFixtures=Array.isArray(snapshot?.live?.fixtures)?snapshot.live.fixtures:[];
    const history=await this.state.storage.get(CANDIDATE_HISTORY_KEY)||{};
    const evaluation=buildNativeCandidateShadow(liveFixtures,history,config,at);
    await this.state.storage.put(CANDIDATE_HISTORY_KEY,evaluation.history);

    const refereeRate=await this.fiveUsdNative.refereeRate();
    let starts=0;
    const refereeAttempts=[];
    const candidateRows=[];
    for(const candidate of evaluation.candidates){
      const key=`${REFEREE_PREFIX}${candidate.fixtureId}`;
      const previous=await this.state.storage.get(key)||null;
      const ageMs=finite(previous?.observedAt)?Math.max(0,at-Number(previous.observedAt)):null;
      const fresh=ageMs!==null&&ageMs<REFEREE_REFRESH_MS;
      if(!fresh&&starts<MAX_REFEREE_STARTS_PER_TICK&&Number(refereeRate.usedLast60s||0)+starts<Number(refereeRate.internalCeiling||FIVEUSD_CADENCE.refereeRequestBudgetPer60s)){
        starts+=1;
        try{
          const result=await this.fiveUsdNative.refreshReferee(candidate.fixtureId);
          refereeAttempts.push({fixtureId:candidate.fixtureId,ok:true,readyCount:result?.readyCount??0,observedAt:result?.observedAt??null});
        }catch(error){
          refereeAttempts.push({fixtureId:candidate.fixtureId,ok:false,error:String(error?.message||error)});
        }
      }
      const current=await this.state.storage.get(key)||previous;
      candidateRows.push({...candidate,referee:current?{
        mode:current.mode??'SHADOW_ONLY',shadowOnly:current.shadowOnly!==false,votingEnabled:current.votingEnabled===true,
        observedAt:current.observedAt??null,readyCount:current.readyCount??0,
      }:null});
    }

    const state={
      updatedAt:at,
      source:'5DollarFootballAPI',
      sourceOfTruth:true,
      shadowOnly:true,
      signalAuthority:false,
      liveCount:evaluation.summary.live,
      candidateCount:evaluation.summary.candidates,
      refereeStarts:starts,
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
      await this.state.storage.setAlarm(nextNativeAlarmAt(cycleStartedAt,now()));
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
        refereeStarts:candidateShadow.refereeStarts,
      }:null,
    }},response.status);
  }
}

export default baseWorker;
