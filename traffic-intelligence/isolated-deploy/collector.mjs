// Public, write-only consented presence endpoint. No Admin code or Analytics secrets.
import {collectPresence} from './presence.mjs';
import {TRACKER,PRIVACY} from './tracker-assets.mjs';
const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
export default {
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/api/collect')return collectPresence(request,env);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers});
  if(path==='/health')return new Response(JSON.stringify({ok:true,service:'BALL46 VISITOR MONITOR COLLECTOR',collectionEnabled:env.COLLECT_ENABLED==='true',storageReady:!!env.EVENTS_KV,privacy:'explicit_opt_in',retentionHours:26}),{headers:{...headers,'content-type':'application/json'}});
  if(path==='/tracker.js')return new Response(request.method==='HEAD'?null:TRACKER,{headers:{...headers,'content-type':'application/javascript; charset=utf-8','cross-origin-resource-policy':'cross-origin'}});
  if(path==='/privacy')return new Response(request.method==='HEAD'?null:PRIVACY,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'x-frame-options':'DENY','x-robots-tag':'noindex,nofollow'}});
  return new Response('Not Found',{status:404,headers});
 }
};
