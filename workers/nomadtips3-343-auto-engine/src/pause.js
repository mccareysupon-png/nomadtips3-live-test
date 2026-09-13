import app, { Nomad343State } from './index.js';
export { Nomad343State };

const VERSION = 'nomad343-paused-20260913-hardstop';
const REASON = 'OWNER_UNUSED_HARD_PAUSE';
const STOPPED_RUN = {over:false,under:false,oneXtwo:false,ah:false,special341:false};
const headers = {
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
  'content-type':'application/json; charset=utf-8'
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
const readJson=async response=>response.json().catch(()=>({}));
const pausedMeta=()=>({version:VERSION,paused:true,reason:REASON,engineState:'STOPPED',run:{...STOPPED_RUN}});

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return app.fetch(request,env,ctx);

    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/health'||url.pathname==='/api/state')){
      const base=await readJson(await app.fetch(request,env,ctx));
      return json({
        ...base,
        ...pausedMeta(),
        ok:true,
        status:'PAUSED',
        lastRequestCount:0,
        provider:'5DollarFootballAPI',
        bookmaker:'Bet365'
      });
    }

    if(request.method==='GET'&&(url.pathname==='/api/engine/board'||url.pathname==='/board')){
      const base=await readJson(await app.fetch(request,env,ctx));
      return json({
        ...base,
        ...pausedMeta(),
        ok:true,
        observedAt:Date.now(),
        fixtures:[],
        candidates:[],
        newSignals:[],
        provider:{name:'5DollarFootballAPI',bookmaker:'Bet365',requests:0,requestBudget:0,liveCount:0}
      });
    }

    if(request.method==='GET'&&(url.pathname==='/api/signals'||url.pathname==='/signals')){
      const base=await readJson(await app.fetch(request,env,ctx));
      return json({...base,version:VERSION,paused:true,reason:REASON});
    }

    if(request.method==='POST'&&url.pathname==='/api/run'){
      const body=await request.clone().json().catch(()=>null);
      if(body?.market==='ALL'&&body?.running===false){
        const base=await readJson(await app.fetch(request,env,ctx));
        return json({...base,...pausedMeta(),ok:true,status:'PAUSED'});
      }
      return json({ok:false,...pausedMeta(),status:'PAUSED',error:'ENGINE_PAUSED_RUN_LOCKED'},423);
    }

    if(request.method==='POST'&&url.pathname==='/scan'){
      return json({
        ok:true,
        ...pausedMeta(),
        status:'PAUSED',
        observedAt:Date.now(),
        fixtures:[],
        candidates:[],
        newSignals:[],
        signals:[],
        provider:{name:'5DollarFootballAPI',bookmaker:'Bet365',requests:0,requestBudget:0,liveCount:0}
      });
    }

    if(request.method==='GET'&&url.pathname==='/api/referee'){
      return json({ok:false,version:VERSION,paused:true,reason:REASON,error:'ENGINE_PAUSED',providerRequests:0});
    }

    return app.fetch(request,env,ctx);
  },
  async scheduled(){
    // Intentional no-op. NOMAD 3.43 is unused and must not call 5DollarFootballAPI.
  }
};
