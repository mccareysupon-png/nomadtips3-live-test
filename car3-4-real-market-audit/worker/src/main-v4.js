import mainV3Worker,{Car31State as MainV3Car31State} from './main-v3.js';
import {applyGoalooBet365Fallback,countGoalooBet365FallbackCandidates,fetchGoalooBet365RunOdds,GOALOO_BET365_COMPANY_ID,GOALOO_BET365_FEED} from './goaloo-bet365-fallback.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});

function fallbackMeta(overrides={}){
  return{source:'Goaloo',bookmaker:'Bet365',companyId:GOALOO_BET365_COMPANY_ID,feed:GOALOO_BET365_FEED,mode:'FALLBACK_ONLY',status:'IDLE',attempted:0,quoteMatched:0,pricePassed:0,newSignals:0,error:null,at:new Date().toISOString(),...overrides};
}

export class Car31State extends MainV3Car31State{
  async saveFallbackState(latest,meta){
    const pipe={...(latest.realMarketPipe||{}),fallback:meta};
    latest.realMarketPipe=pipe;
    await this.state.storage.put('latest',latest);
    await this.state.storage.put('realMarketPipe',pipe);
    await this.state.storage.put('goalooBet365FallbackPipe',meta);
    return pipe;
  }

  async scan(trigger='cron'){
    const primaryResponse=await super.scan(trigger);
    if(!primaryResponse.ok)return primaryResponse;
    const primaryPayload=await primaryResponse.clone().json().catch(()=>null);
    const latest=await this.state.storage.get('latest');
    if(!latest||typeof latest!=='object')return primaryResponse;

    const savedConfig=await this.state.storage.get('config');
    const config={...(savedConfig?.config||{}),market:'AH',engineEnabled:savedConfig?.config?.engineEnabled!==false,confirmationRounds:1};
    const history=await this.state.storage.get('history')||[];
    const fallbackStreaks=await this.state.storage.get('goalooBet365FallbackStreaksV1')||{};
    const candidateCount=config.engineEnabled?countGoalooBet365FallbackCandidates(latest,history,config):0;

    if(!candidateCount){
      const meta=fallbackMeta({status:config.engineEnabled?'IDLE':'PAUSED',at:latest.generatedAt||new Date().toISOString()});
      const pipe=await this.saveFallbackState(latest,meta);
      if(!primaryPayload)return primaryResponse;
      return json({...primaryPayload,matches:latest.matches,realMarketPipe:pipe,goalooBet365Fallback:meta},primaryResponse.status);
    }

    try{
      const fetched=await fetchGoalooBet365RunOdds();
      const applied=applyGoalooBet365Fallback({latest,config,history,fallbackStreaks,quotes:fetched.quotes,at:fetched.observedAt});
      while(history.length>5000)history.shift();
      const meta=fallbackMeta({...applied,status:applied.newSignals?'USED':applied.pricePassed?'READY':'NO_USABLE_PRICE',quotesAvailable:fetched.quotes.size,at:fetched.observedAt});
      const pipe=await this.saveFallbackState(latest,meta);
      await this.state.storage.put('history',history);
      await this.state.storage.put('goalooBet365FallbackStreaksV1',fallbackStreaks);
      if(!primaryPayload)return primaryResponse;
      return json({...primaryPayload,matches:latest.matches,historyTotal:history.length,newSignals:(Number(primaryPayload.newSignals)||0)+applied.newSignals,realMarketPipe:pipe,goalooBet365Fallback:meta},primaryResponse.status);
    }catch(error){
      const meta=fallbackMeta({status:'ERROR',attempted:candidateCount,error:String(error?.message||error),at:new Date().toISOString()});
      const pipe=await this.saveFallbackState(latest,meta);
      if(!primaryPayload)return primaryResponse;
      // Fallback is deliberately non-blocking: the working primary scan stays valid.
      return json({...primaryPayload,matches:latest.matches,realMarketPipe:pipe,goalooBet365Fallback:meta},primaryResponse.status);
    }
  }
}

export default mainV3Worker;
