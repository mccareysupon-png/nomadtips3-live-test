// Separate private cache, never writes to the Receiver or public website.
export {MonitorRateCache} from './monitor.mjs';
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(req.method!=='GET'||u.hostname!=='monitor.internal'||!['/cached','/refresh'].includes(u.pathname))return new Response(null,{status:403});
 return env.B46_MONITOR_CACHE.getByName('receiver-rates-v1').fetch(req);
}};