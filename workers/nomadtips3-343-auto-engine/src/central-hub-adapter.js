const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>finite(v)?Number(v):null;
const pair=v=>({home:num(v?.home),away:num(v?.away)});

export function hubFixtureToLegacyProviderFixture(item={}){
  const fixtureId=item?.fixtureId??null;
  const stats=item?.statistics??{};
  return {
    id:fixtureId,
    fixture_id:fixtureId,
    teams:{
      home:{name:String(item?.home?.name??'')},
      away:{name:String(item?.away?.name??'')}
    },
    league:{name:String(item?.league?.name??'')},
    minute:num(item?.minute),
    status:item?.status??'live',
    status_code:item?.statusCode??null,
    goals:pair(item?.score),
    corners:pair(stats?.corners),
    statistics:{
      shots_on_target:pair(stats?.shotsOn),
      shots_off_target:pair(stats?.shotsOff),
      attacks:pair(stats?.attacks),
      dangerous_attacks:pair(stats?.dangerousAttack),
      possession:pair(stats?.possession)
    },
    events:Array.isArray(item?.events)?item.events:[],
    odds:item?.odds?.raw??null,
    kickoff_utc:item?.kickoffAt??null,
    _centralHub:{
      fixtureId:fixtureId===null?null:String(fixtureId),
      observedAt:num(item?.observedAt),
      timestampKind:item?.timestampKind??null
    }
  };
}

export function adaptCentralHubLive(payload={}){
  if(payload?.ok!==true) throw new Error(`CENTRAL_HUB_NOT_OK:${payload?.error??'unknown'}`);
  if(payload?.cache?.stale===true) throw new Error('CENTRAL_HUB_STALE');
  if(!Array.isArray(payload?.fixtures)) throw new Error('CENTRAL_HUB_FIXTURES_MISSING');
  const fixtures=payload.fixtures.map(hubFixtureToLegacyProviderFixture).filter(item=>item.id!==null&&item.id!==undefined&&String(item.id)!=='');
  return {
    fixtures,
    requests:0,
    hubRequests:1,
    source:'5USD Central Hub',
    observedAt:num(payload?.observedAt),
    cache:payload?.cache??null,
    fixtureCount:fixtures.length
  };
}

function hubHeaders(env={}){
  const headers={accept:'application/json'};
  const token=String(env.CENTRAL_HUB_TOKEN??'').trim();
  if(token) headers['x-central-hub-token']=token;
  return headers;
}

export async function fetchCentralHubLive(env={},fetchImpl=fetch){
  const base=String(env.CENTRAL_HUB_URL??'').trim().replace(/\/+$/,'');
  if(!base) throw new Error('CENTRAL_HUB_URL_MISSING');
  const response=await fetchImpl(`${base}/live`,{headers:hubHeaders(env),cf:{cacheTtl:0,cacheEverything:false}});
  const text=await response.text();
  let payload=null;try{payload=JSON.parse(text);}catch{}
  if(!response.ok) throw new Error(`CENTRAL_HUB_HTTP_${response.status}`);
  if(!payload) throw new Error('CENTRAL_HUB_INVALID_JSON');
  return adaptCentralHubLive(payload);
}

export function compareCentralHubToLegacyIds(hubFixtures=[],legacyFixtures=[]){
  const idOf=x=>String(x?.fixtureId??x?.id??x?.fixture_id??'').trim();
  const hub=new Set(hubFixtures.map(idOf).filter(Boolean));
  const legacy=new Set(legacyFixtures.map(idOf).filter(Boolean));
  const onlyHub=[...hub].filter(id=>!legacy.has(id));
  const onlyLegacy=[...legacy].filter(id=>!hub.has(id));
  const shared=[...hub].filter(id=>legacy.has(id));
  return {hub:hub.size,legacy:legacy.size,shared:shared.length,onlyHub,onlyLegacy};
}
