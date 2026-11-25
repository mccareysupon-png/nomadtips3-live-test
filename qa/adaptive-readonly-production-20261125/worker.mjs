import {serveAdaptiveReadOnly} from './b46-adaptive-readonly-page-20261125.mjs';
export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/research/adaptive-ou'||path==='/research/adaptive-ou/'||path==='/research/adaptive-ou/data')
    return serveAdaptiveReadOnly(request,env,ctx);
  return env.B46_PRODUCTION_READ.fetch(request);
 }
};
