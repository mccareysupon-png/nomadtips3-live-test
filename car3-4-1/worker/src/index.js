import {discoverLive,hydrateLive} from './goaloo.js';
import {normalizeGoalooMatch,summarizeQuality} from './normalizer.js';

const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type'
};

function json(data,status=200,requestId=null){
  const headers=new Headers(JSON_HEADERS);
  if(requestId)headers.set('x-request-id',requestId);
  return new Response(JSON.stringify(data,null,2),{status,headers});
}

function phaseConfig(){
  return {
    version:'3.4.1',
    phase:'SOURCE_MONITOR',
    readOnly:true,
    source:{stats:'GOALOO',pricing:'DISCONNECTED'},
    capabilities:{goalooIndex:true,goalooDetails:true,normalizer:true,fixtures:true,pricing:false,detector:false,lockedSignals:false,settlement:false,persistence:false,cron:false}
  };
}

function normalizeFixture(seed){
  return {
    source:'GOALOO',
    id:String(seed.id),
    leagueId:seed.leagueId??null,
    league:String(seed.league??''),
    home:String(seed.home??''),
    away:String(seed.away??''),
    kickoff:seed.kickoff??null,
    status:String(seed.status??'UNKNOWN'),
    minute:seed.minute??null,
    score:{home:Number(seed.score?.home)||0,away:Number(seed.score?.away)||0},
    cards:{red:{home:Number(seed.redCards?.home)||0,away:Number(seed.redCards?.away)||0},yellow:{home:Number(seed.yellowCards?.home)||0,away:Number(seed.yellowCards?.away)||0}}
  };
}

async function sourceProbe(env){
  const started=Date.now();
  const discovery=await discoverLive(env);
  return {ok:Boolean(discovery.sourceUrl),provider:'GOALOO',sourceUrl:discovery.sourceUrl,indexMatches:discovery.matchCount,liveMatches:discovery.live.length,leagueCount:discovery.leagueCount,errors:discovery.errors,checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started};
}

async function fixturesSnapshot(env){
  const started=Date.now();
  const generatedAt=new Date().toISOString();
  const discovery=await discoverLive(env);
  if(!discovery.sourceUrl)return {status:502,body:{ok:false,generatedAt,source:'GOALOO',error:'GOALOO_INDEX_UNAVAILABLE',errors:discovery.errors,fixtures:[]}};
  return {status:200,body:{ok:true,generatedAt,source:'GOALOO',sourceUrl:discovery.sourceUrl,count:discovery.all.length,live:discovery.live.length,errors:discovery.errors,elapsedMs:Date.now()-started,fixtures:discovery.all.map(normalizeFixture)}};
}

async function liveSnapshot(env){
  const started=Date.now();
  const collectedAt=new Date().toISOString();
  const discovery=await discoverLive(env);
  if(!discovery.sourceUrl)return {status:502,body:{ok:false,generatedAt:collectedAt,phase:'SOURCE_MONITOR',source:'GOALOO',error:'GOALOO_INDEX_UNAVAILABLE',errors:discovery.errors,matches:[]}};
  const hydrated=await hydrateLive(env,discovery.live,collectedAt);
  const matches=hydrated.map(normalizeGoalooMatch);
  return {status:200,body:{ok:true,generatedAt:collectedAt,phase:'SOURCE_MONITOR',source:'GOALOO',sourceUrl:discovery.sourceUrl,index:{matches:discovery.matchCount,live:discovery.live.length,leagues:discovery.leagueCount},quality:summarizeQuality(matches),errors:discovery.errors,elapsedMs:Date.now()-started,matches}};
}

export default {
  async fetch(request,env){
    const requestId=crypto.randomUUID();
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,requestId);
    const url=new URL(request.url);
    try{
      if(url.pathname==='/health')return json({ok:true,service:'nomadtips3-car341-source-monitor',...phaseConfig(),now:new Date().toISOString()},200,requestId);
      if(url.pathname==='/config')return json({ok:true,...phaseConfig()},200,requestId);
      if(url.pathname==='/source-health'){
        const probe=await sourceProbe(env);
        console.log(JSON.stringify({event:'source_probe',requestId,...probe}));
        return json(probe,probe.ok?200:502,requestId);
      }
      if(url.pathname==='/fixtures'){
        const snapshot=await fixturesSnapshot(env);
        console.log(JSON.stringify({event:'fixtures_snapshot',requestId,ok:snapshot.body.ok,count:snapshot.body.count??0,live:snapshot.body.live??0,elapsedMs:snapshot.body.elapsedMs??null}));
        return json(snapshot.body,snapshot.status,requestId);
      }
      if(url.pathname==='/live'){
        const snapshot=await liveSnapshot(env);
        console.log(JSON.stringify({event:'live_snapshot',requestId,ok:snapshot.body.ok,live:snapshot.body.index?.live??0,normalized:snapshot.body.matches?.length??0,quality:snapshot.body.quality??null,elapsedMs:snapshot.body.elapsedMs??null}));
        return json(snapshot.body,snapshot.status,requestId);
      }
      return json({ok:true,service:'nomadtips3-car341-source-monitor',version:'3.4.1',phase:'SOURCE_MONITOR',routes:['GET /health','GET /config','GET /source-health','GET /fixtures','GET /live'],note:'Pricing, detector, persistence, settlement and cron are intentionally disconnected.'},200,requestId);
    }catch(error){
      const message=String(error?.message||error);
      console.error(JSON.stringify({event:'request_error',requestId,path:url.pathname,error:message}));
      return json({ok:false,error:'SOURCE_MONITOR_ERROR',message,at:new Date().toISOString()},500,requestId);
    }
  }
};
