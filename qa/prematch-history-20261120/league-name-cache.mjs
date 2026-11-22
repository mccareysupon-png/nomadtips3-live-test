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

export function enrichLeagueNamesOnMonitor(monitorResult,rows,fixtures,registry){
 const result=monitorResult&&typeof monitorResult==='object'?monitorResult:{};
 const source=result.monitor&&typeof result.monitor==='object'?result.monitor:{};
 const known=leagueNameRegistryFromFixtures(registry,rows,fixtures);
 const enriched={...source};
 for(const row of Array.isArray(rows)?rows:[]){
   const key=id(row?.fixture_id);
   if(!key)continue;
   const name=known[key]?.name;
   if(!name)continue;
   const existing=source[key]&&typeof source[key]==='object'?source[key]:{};
   // Keep authoritative name already provided by the matched normal HUB.
   if(validName(existing.leagueName))continue;
   enriched[key]={...existing,leagueName:name};
 }
 return {...result,monitor:enriched};
}
