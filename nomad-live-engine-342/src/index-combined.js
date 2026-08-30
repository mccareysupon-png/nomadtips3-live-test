import thscoreWorker from './index.js';
import fiveDollarWorker from './index-5dollar.js';
import totalCornerDetailWorker from './index-totalcorner-detail.js';

const VERSION='3.42';
const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});

function childRequest(request,pathname){
  const url=new URL(request.url);
  url.pathname=pathname;
  url.search='';
  return new Request(url.toString(),{method:'GET',headers:request.headers});
}

async function readJson(response){
  try{return await response.clone().json();}catch{return null;}
}

async function combinedContract(request,env){
  const [coreResponse,priceResponse,refereeResponse]=await Promise.all([
    totalCornerDetailWorker.fetch(childRequest(request,'/contract'),env),
    fiveDollarWorker.fetch(childRequest(request,'/contract'),env),
    thscoreWorker.fetch(childRequest(request,'/contract'),env),
  ]);
  const core=await readJson(coreResponse)||{};
  const price=await readJson(priceResponse)||{};
  const referee=await readJson(refereeResponse)||{};
  return json({
    ok:core.ok!==false&&price.ok!==false&&referee.ok!==false,
    version:VERSION,
    mode:'COMBINED_342_RAILS',
    source:core.source||null,
    priceSource:price.judge||price.priceJudge||null,
    priceReferee:referee.judge||null,
    routes:{
      feed:'/feed',
      price:'/judge/5dollar',
      priceStatus:'/judge/5dollar/status',
      referee:'/judge/thscore',
      refereeStatus:'/judge/thscore/status',
    },
    match:core.match||price.match||referee.match||null,
  });
}

async function combinedHealth(request,env){
  const [coreResponse,priceResponse,refereeResponse]=await Promise.all([
    totalCornerDetailWorker.fetch(childRequest(request,'/health'),env),
    fiveDollarWorker.fetch(childRequest(request,'/judge/5dollar/status'),env),
    thscoreWorker.fetch(childRequest(request,'/judge/thscore/status'),env),
  ]);
  const core=await readJson(coreResponse)||{};
  const price=await readJson(priceResponse)||{};
  const referee=await readJson(refereeResponse)||{};
  return json({
    ...core,
    version:VERSION,
    combined:true,
    rails:{
      liveFeed:{ok:core.ok!==false,source:core.source||null},
      fiveDollar:{ok:price.ok!==false,ready:Boolean(price.ready),source:price.source||'5DollarFootballAPI'},
      thscore:{ok:referee.ok!==false,source:referee.source||'THScore',configured:Boolean(referee.configured)},
    },
  },coreResponse.status||200);
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);

    // TotalCorner owns Live Score + Event + detail/graph evidence.
    if(url.pathname==='/'||url.pathname==='/health'||url.pathname==='/feed'){
      return totalCornerDetailWorker.fetch(request,env);
    }
    if(url.pathname==='/health/combined')return combinedHealth(request,env);
    if(url.pathname==='/contract')return combinedContract(request,env);

    // Primary odds source: 5DollarFootballAPI / Bet365.
    if(url.pathname==='/judge/5dollar'||url.pathname==='/judge/5dollar/status'){
      return fiveDollarWorker.fetch(request,env);
    }

    // Price referee: THScore stays a separate validation rail.
    if(url.pathname==='/judge/thscore'||url.pathname==='/judge/thscore/status'){
      return thscoreWorker.fetch(request,env);
    }

    return json({ok:false,version:VERSION,error:'not_found'},404);
  },
};
