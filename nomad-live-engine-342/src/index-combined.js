import thscoreWorker from './index.js';
import fiveDollarWorker from './index-5dollar.js';

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
  const [priceResponse,refereeResponse]=await Promise.all([
    fiveDollarWorker.fetch(childRequest(request,'/contract'),env),
    thscoreWorker.fetch(childRequest(request,'/contract'),env),
  ]);
  const price=await readJson(priceResponse)||{};
  const referee=await readJson(refereeResponse)||{};
  return json({
    ok:price.ok!==false&&referee.ok!==false,
    version:VERSION,
    mode:'COMBINED_342_RAILS',
    source:price.source||referee.source||null,
    priceSource:price.judge||price.priceJudge||null,
    priceReferee:referee.judge||null,
    routes:{
      feed:'/feed',
      price:'/judge/5dollar',
      priceStatus:'/judge/5dollar/status',
      referee:'/judge/thscore',
      refereeStatus:'/judge/thscore/status',
    },
    match:price.match||referee.match||null,
  });
}

async function combinedHealth(request,env){
  const [coreResponse,refereeResponse]=await Promise.all([
    fiveDollarWorker.fetch(childRequest(request,'/health'),env),
    thscoreWorker.fetch(childRequest(request,'/judge/thscore/status'),env),
  ]);
  const core=await readJson(coreResponse)||{};
  const referee=await readJson(refereeResponse)||{};
  return json({
    ...core,
    version:VERSION,
    combined:true,
    rails:{
      liveFeed:{ok:core.ok!==false,source:core.source||null,priceJudge:core.priceJudge||null},
      thscore:{ok:referee.ok!==false,source:referee.source||'THScore',configured:Boolean(referee.configured)},
    },
  },coreResponse.status||200);
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);

    // Preserve the current Live Score/Event feed and 5Dollar rail exactly.
    if(url.pathname==='/'||url.pathname==='/health'||url.pathname==='/feed'){
      return fiveDollarWorker.fetch(request,env);
    }
    if(url.pathname==='/health/combined')return combinedHealth(request,env);
    if(url.pathname==='/contract')return combinedContract(request,env);

    // Primary odds source: 5DollarFootballAPI / Bet365.
    if(url.pathname==='/judge/5dollar'||url.pathname==='/judge/5dollar/status'){
      return fiveDollarWorker.fetch(request,env);
    }

    // Price referee: restore the existing THScore rail instead of replacing it.
    if(url.pathname==='/judge/thscore'||url.pathname==='/judge/thscore/status'){
      return thscoreWorker.fetch(request,env);
    }

    return json({ok:false,version:VERSION,error:'not_found'},404);
  },
};
