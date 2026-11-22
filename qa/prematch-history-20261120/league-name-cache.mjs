// Pre-Match TEST display metadata only. No provider access, score settlement, or count changes.
// A league name is accepted only from a stored fixture with the exact fixture ID
// AND the identical home and away team IDs as the immutable pick Ledger.
const id=value=>{
 const v=Number(value);
 return Number.isSafeInteger(v)&&v>0?String(v):null;
};
const validName=value=>{
 if(typeof value!=='string')return null;
 const name=value.trim().replace(/\s+/g,' ');
 if(!name||name.length>130||['league unavailable','league pending verification','pre-match','unknown','null','undefined'].includes(name.toLowerCase()))return null;
 return name;
};
const matches=(row,fixture)=>{
 return !!(row&&fixture&&id(row.fixture_id)&&id(row.fixture_id)===id(fixture.id)&&
   id(row.home_id)===id(fixture.teams?.home?.id)&&id(row.away_id)===id(fixture.teams?.away?.id));
};
const storedMatches=(row,entry)=>id(row.fixture_id)===id(entry?.fixtureId)&&
 id(row.home_id)===id(entry?.homeId)&&id(row.away_id)===id(entry?.awayId);

export function leagueNameRegistryFromFixtures(old,rows,fixtures){
 const input=old&&typeof old==='object'&&!Array.isArray(old)?old:{};
 const fixtureMap=new Map((Array.isArray(fixtures)?fixtures:[]).filter(f=>id(f?.id)).map(f=>[id(f.id),f]));
 const result={};
 for(const row of (Array.isArray(rows)?rows:[])){
   const key=id(row?.fixture_id);
   if(!key)continue;
   const known=input[key],existing=storedMatches(row,known)?validName(known?.name):null;
   const fixture=fixtureMap.get(key);
   const fresh=matches(row,fixture)?validName(fixture.league?.name):null;
   const name=fresh||existing;
   if(name)result[key]={fixtureId:key,homeId:id(row.home_id),awayId:id(row.away_id),name};
 }
 return result;
}

// Preserve the available league names from EVERY fixture in the already fetched
// normal HUB cache, independently of whether that fixture has usable 1X2 odds.
// The registry is indexed by provider league ID; no network calls or guesses.
export function leagueCatalogFromCachedHub(previous,snapshot,storedFixtures=[]){
 const catalog={};
 if(previous&&typeof previous==='object'&&!Array.isArray(previous)){
  for(const [key,value] of Object.entries(previous)){
   const leagueId=id(key),name=validName(value);
   if(leagueId&&name)catalog[leagueId]=name;
  }
 }
 const groups=new Map();
 const observe=(league)=>{
  const leagueId=id(league?.id),name=validName(league?.name);
  if(!leagueId||!name)return;
  if(!groups.has(leagueId))groups.set(leagueId,new Set());
  groups.get(leagueId).add(name);
 };
 if(snapshot?.ok===true&&snapshot?.cacheOnly===true&&Array.isArray(snapshot.fixtures)){
  for(const fixture of snapshot.fixtures)observe(fixture?.league);
 }
 for(const fixture of (Array.isArray(storedFixtures)?storedFixtures:[]))observe(fixture?.league);
 const conflicts=[];
 for(const [leagueId,names] of groups){
  if(names.size===1)catalog[leagueId]=[...names][0];
  else {delete catalog[leagueId];conflicts.push(leagueId)}
 }
 return {catalog,conflicts,observedLeagueIds:groups.size};
}

export function enrichLeagueNamesOnMonitor(monitorResult,rows,fixtures,registry,catalog={},historyLeagueIds={}){
 const result=monitorResult&&typeof monitorResult==='object'?monitorResult:{};
 const source=result.monitor&&typeof result.monitor==='object'?result.monitor:{};
 const known=leagueNameRegistryFromFixtures(registry,rows,fixtures);
 const fixtureMap=new Map((Array.isArray(fixtures)?fixtures:[]).filter(f=>id(f?.id)).map(f=>[id(f.id),f]));
 const enriched={...source};
 for(const row of Array.isArray(rows)?rows:[]){
   const key=id(row?.fixture_id);
   if(!key)continue;
   const existing=source[key]&&typeof source[key]==='object'?source[key]:{};
   if(validName(existing.leagueName))continue; // Already verified by fixture ID and both team IDs.
   const fixture=fixtureMap.get(key);
   const matching=matches(row,fixture);
   const fromFixture=matching?validName(fixture.league?.name):null;
   const leagueId=matching&&id(fixture.league?.id)
     ?id(fixture.league.id)
     :id(historyLeagueIds?.[key]);
   // The historical league ID came from the exact fixture and both team IDs.
   const fromCatalog=leagueId?validName(catalog?.[leagueId]):null;
   const name=fromFixture||known[key]?.name||fromCatalog;
   if(name)enriched[key]={...existing,leagueName:name};
 }
 return {...result,monitor:enriched};
}
