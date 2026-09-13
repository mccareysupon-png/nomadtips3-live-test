import app, { Nomad343State } from './index.js';
export { Nomad343State };

const VERSION = 'nomad343-paused-20260913';
const headers = {
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
  'content-type':'application/json; charset=utf-8'
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return app.fetch(request,env,ctx);
    if(request.method==='POST'&&url.pathname==='/scan'){
      return json({
        ok:true,
        version:VERSION,
        engineState:'STOPPED',
        paused:true,
        reason:'OWNER_API_PAUSE',
        observedAt:Date.now(),
        fixtures:[],
        candidates:[],
        newSignals:[],
        signals:[],
        run:{over:false,under:false,oneXtwo:false,ah:false},
        provider:{name:'5DollarFootballAPI',bookmaker:'Bet365',requests:0,requestBudget:0,liveCount:0}
      });
    }
    if(request.method==='GET'&&url.pathname==='/api/referee'){
      return json({ok:false,version:VERSION,paused:true,error:'ENGINE_PAUSED',providerRequests:0});
    }
    return app.fetch(request,env,ctx);
  },
  async scheduled(){
    // Intentional no-op while NOMAD 3.43 is paused by owner.
  }
};
