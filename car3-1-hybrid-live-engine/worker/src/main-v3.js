import settlementWorker,{Car31State} from './settlement-v2.js';
import {handleAnimationRequest} from './animation-v3-source.js';
import {enrichLiveResponseWithGoalooClock} from './goaloo-clock.js';

export{Car31State};

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if((request.method==='GET'||request.method==='OPTIONS')&&url.pathname==='/animation'){
      return handleAnimationRequest(request,env,settlementWorker);
    }
    if(request.method==='GET'&&url.pathname==='/live'){
      const response=await settlementWorker.fetch(request,env,ctx);
      return enrichLiveResponseWithGoalooClock(response);
    }
    return settlementWorker.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return settlementWorker.scheduled(event,env,ctx);
  }
};
