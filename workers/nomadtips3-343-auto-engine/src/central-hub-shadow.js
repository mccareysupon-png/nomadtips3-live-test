import {fetchCentralHubLive,fetchCentralHubFullOdds,compareCentralHubToLegacyIds} from './central-hub-adapter.js';

const text=v=>String(v??'').trim();
const normalizedMode=env=>text(env?.CENTRAL_HUB_MODE).toLowerCase();

export function centralHubShadowEnabled(env={}){
  return normalizedMode(env)==='shadow'&&text(env?.CENTRAL_HUB_URL)!=='';
}

function numberOrNull(v){
  if(v===null||v===undefined||v===''||!Number.isFinite(Number(v))) return null;
  return Number(v);
}

function marketSnapshot(root={}){
  const ah=root?.asian_handicap?.inplay??root?.asian?.inplay??null;
  const goal=root?.goal_line?.inplay??root?.goalline?.inplay??null;
  const oneXtwo=root?.['1x2']?.inplay??null;
  return {
    ah:{line:numberOrNull(ah?.line),home:numberOrNull(ah?.home),away:numberOrNull(ah?.away)},
    goal:{line:numberOrNull(goal?.line),over:numberOrNull(goal?.over),under:numberOrNull(goal?.under)},
    oneXtwo:{home:numberOrNull(oneXtwo?.home),draw:numberOrNull(oneXtwo?.draw),away:numberOrNull(oneXtwo?.away)}
  };
}

export function compareFullOddsRoots(directRoot,hubRoot){
  const direct=marketSnapshot(directRoot||{}),hub=marketSnapshot(hubRoot||{});
  const directFingerprint=JSON.stringify(direct),hubFingerprint=JSON.stringify(hub);
  return {matched:directFingerprint===hubFingerprint,direct,hub};
}

export async function runCentralHubLiveShadow(env={},directFixtures=[],fetchImpl=fetch){
  if(!centralHubShadowEnabled(env)) return {enabled:false,authority:'DIRECT_5USD',usedForSignals:false};
  try{
    const hub=await fetchCentralHubLive(env,fetchImpl);
    const ids=compareCentralHubToLegacyIds(hub.fixtures,directFixtures);
    return {
      enabled:true,ok:true,authority:'DIRECT_5USD',usedForSignals:false,
      hubSource:hub.source,hubFixtureCount:hub.fixtureCount,directFixtureCount:Array.isArray(directFixtures)?directFixtures.length:0,
      ids,observedAt:hub.observedAt,cache:hub.cache??null
    };
  }catch(error){
    return {enabled:true,ok:false,authority:'DIRECT_5USD',usedForSignals:false,error:String(error?.message||error)};
  }
}

export async function runCentralHubOddsShadow(fixtureId,directRoot,env={},fetchImpl=fetch){
  if(!centralHubShadowEnabled(env)) return {enabled:false,authority:'DIRECT_5USD',usedForSignals:false,fixtureId:String(fixtureId??'')};
  try{
    const hubRoot=await fetchCentralHubFullOdds(fixtureId,env,fetchImpl);
    const comparison=compareFullOddsRoots(directRoot,hubRoot);
    return {enabled:true,ok:true,authority:'DIRECT_5USD',usedForSignals:false,fixtureId:String(fixtureId),...comparison};
  }catch(error){
    return {enabled:true,ok:false,authority:'DIRECT_5USD',usedForSignals:false,fixtureId:String(fixtureId??''),error:String(error?.message||error)};
  }
}
