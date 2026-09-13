import baseWorker,{EngineState as BaseEngineState} from './index.js';
import {FIVEUSD_CADENCE} from './fivedollar.js';
import {FiveUsdNativeRuntime} from './fivedollar-runtime.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const MIN_ALARM_DELAY_MS=250;
const now=()=>Date.now();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});

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
      await this.fiveUsdNative.tick();
      const [engineState,config]=await Promise.all([this.read(),this.currentConfig()]);
      if(legacyCycleDue(engineState,config,now())&&!this.running){
        this.running=true;
        try{await this.runCycle();}finally{this.running=false;}
      }
    }finally{
      await this.state.storage.setAlarm(nextNativeAlarmAt(cycleStartedAt,now()));
    }
  }

  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/fiveusd-native'&&request.method==='GET'){
      return json({ok:true,...await this.fiveUsdNative.health(),snapshot:await this.fiveUsdNative.snapshot()});
    }

    const response=await super.fetch(request);
    if(url.pathname!=='/health'||request.method!=='GET') return response;

    let body=null;
    try{body=await response.clone().json();}catch{body={ok:false,error:'health_decode_failed'};}
    return json({...body,fiveUsdNative:await this.fiveUsdNative.health()},response.status);
  }
}

export default baseWorker;
