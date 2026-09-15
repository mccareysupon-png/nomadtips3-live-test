import { DurableObject } from 'cloudflare:workers';

const VERSION='nomad343-rich-odds-v1-quarantined';
const REASON='DUPLICATE_PROVIDER_CALLER_DISABLED_USE_5USD_HUB_V5';

function response(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

export class RichOddsCache extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env}
  async fetch(request){
    const u=new URL(request.url);
    if(request.method==='GET'&&(u.pathname==='/health'||u.pathname==='/status'||u.pathname==='/snapshot')){
      return response({ok:true,component:'NOMAD343_RICH_ODDS',version:VERSION,enabled:false,quarantined:true,reason:REASON,providerRequests:0,providerRequestsAddedByRead:0,clickDriven:false,sourceOfTruth:'nomadtips3-5usd-hub-343'});
    }
    if(request.method==='POST'&&u.pathname==='/_internal/refresh'){
      return response({ok:true,version:VERSION,enabled:false,quarantined:true,reason:REASON,providerRequests:0});
    }
    return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
  }
}

function stub(env){return env.CACHE.get(env.CACHE.idFromName('global'))}

export default{
  async fetch(request,env){
    const u=new URL(request.url),s=stub(env);
    if(request.method==='GET'&&['/snapshot','/health','/status'].includes(u.pathname)){
      const r=await s.fetch(`https://rich.internal${u.pathname}`);return response(await r.json(),r.status);
    }
    return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
  },
  async scheduled(){
    // Intentionally no-op. Provider ownership moved to the 5USD HUB central scheduler.
  }
};
