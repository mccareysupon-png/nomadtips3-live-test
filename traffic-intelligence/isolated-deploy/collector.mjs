// Standalone public beacon endpoint; never serves the private dashboard.
import monitor from './worker.mjs';
export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path!=='/api/collect' && path!=='/health')return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
  return monitor.fetch(request,env,ctx);
 }
};
