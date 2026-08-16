import core,{Car33State} from './index.js';
import {handleAnimationRequest} from './animation-source.js';

export {Car33State};

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/animation'&&(request.method==='GET'||request.method==='OPTIONS')){
      return handleAnimationRequest(request,env);
    }
    return core.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return core.scheduled(event,env,ctx);
  }
};
