import baseWorker,{EngineState as ShadowEngineState} from './index-fiveusd-shadow.js';
import {selectFiveUsdRefereeConsensus} from './fivedollar-referee-consensus.js';
import {lockFiveUsdTestSignals} from './fivedollar-test-signals.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const CANDIDATE_STATE_KEY='fiveUsdNativeCandidateShadowV1';
const TEST_SIGNAL_KEY='fiveUsdNativeTestSignalsV1';
const REFEREE_PREFIX='fiveUsdNativeReferee:';
const RUNTIME_CONTRACT_VERSION='341-5usd-test-authority-v1';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const now=()=>Date.now();

export function refereeDecisionTest(snapshot,config,side='home',at=now()){
  if(!snapshot) return null;
  const decision=selectFiveUsdRefereeConsensus(snapshot.referees,config,side,at,{includeSource25:true});
  return {
    ok:decision.ok,
    status:decision.ok?'CONSENSUS TEST':'NO CONSENSUS',
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
    votingEnabled:decision.ok===true,
    signalAuthority:decision.ok===true,
    testOnly:true,
  };
}

export class EngineState extends ShadowEngineState{
  async testSignals(){return await this.state.storage.get(TEST_SIGNAL_KEY)||[];}

  async updateFiveUsdCandidateShadow(config,at=now()){
    const base=await super.updateFiveUsdCandidateShadow(config,at);
    const rows=[];
    let consensusReady=0;

    for(const candidate of base.rows||[]){
      const refereeSnapshot=await this.state.storage.get(`${REFEREE_PREFIX}${candidate.fixtureId}`)||null;
      const decisionShadow=refereeDecisionTest(refereeSnapshot,config,candidate.side,at);
      if(decisionShadow?.ok===true) consensusReady+=1;
      rows.push({
        ...candidate,
        referee:candidate.referee?{...candidate.referee,mode:'TEST_AUTHORITY',shadowOnly:false,votingEnabled:true}:candidate.referee,
        decisionShadow,
      });
    }

    const activeEnvelope=(await this.configState()).active;
    const existing=await this.testSignals();
    const locked=lockFiveUsdTestSignals(existing,rows,activeEnvelope,config,at);
    const signals=locked.signals.slice(-500);
    await this.state.storage.put(TEST_SIGNAL_KEY,signals);

    const state={
      ...base,
      runtimeMode:'TEST_AUTHORITY',
      source:'5DollarFootballAPI',
      sourceOfTruth:true,
      shadowOnly:false,
      votingEnabled:true,
      signalAuthority:true,
      consensusReady,
      testSignalCount:signals.length,
      newlyLockedCount:locked.newlyLocked.length,
      newlyLocked:locked.newlyLocked.map(signal=>({
        matchId:signal.matchId,home:signal.home,away:signal.away,minute:signal.minute,
        line:signal.line,odds:signal.odds,bookmaker:signal.bookmaker,lockedAt:signal.lockedAt,
        consensusCount:signal.refereeConsensus?.consensusCount??0,
      })),
      rows,
    };
    await this.state.storage.put(CANDIDATE_STATE_KEY,state);
    return state;
  }

  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/fiveusd-test-signals'&&request.method==='GET'){
      const signals=await this.testSignals();
      return json({
        ok:true,
        runtimeContract:RUNTIME_CONTRACT_VERSION,
        source:'5DollarFootballAPI',
        sourceOfTruth:true,
        testOnly:true,
        votingEnabled:true,
        signalAuthority:true,
        count:signals.length,
        signals,
      });
    }

    const response=await super.fetch(request);
    if(!['/fiveusd-native','/health'].includes(url.pathname)||request.method!=='GET') return response;
    let body=null;
    try{body=await response.clone().json();}catch{body={ok:false,error:'response_decode_failed'};}
    const signals=await this.testSignals();
    return json({
      ...body,
      runtimeContract:RUNTIME_CONTRACT_VERSION,
      testAuthority:{
        enabled:true,
        isolated:true,
        votingEnabled:true,
        signalAuthority:true,
        bookmakerPanel:10,
        testSignalCount:signals.length,
      },
    },response.status);
  }
}

export default baseWorker;
