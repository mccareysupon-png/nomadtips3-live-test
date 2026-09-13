import fs from 'node:fs';

const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const rows=p=>Array.isArray(p?.data)?p.data:Array.isArray(p?.data?.data)?p.data.data:Array.isArray(p?.fixtures)?p.fixtures:[];
const id=x=>String(x?.fixtureId??x?.id??x?.fixture_id??x?.fixture?.id??'').trim();
const teamNames=x=>({home:String(x?.teams?.home?.name??x?.home_team?.name??x?.home?.name??x?.home_name??''),away:String(x?.teams?.away?.name??x?.away_team?.name??x?.away?.name??x?.away_name??'')});

const mode=process.argv[2];
if(mode==='live'){
  const hub=read(process.argv[3]),direct=read(process.argv[4]);
  const directRows=rows(direct),hubRows=hub.fixtures||[];
  const byHub=new Map(hubRows.map(x=>[id(x),x]).filter(([k])=>k));
  const byDirect=new Map(directRows.map(x=>[id(x),x]).filter(([k])=>k));
  const shared=[...byDirect.keys()].filter(k=>byHub.has(k));
  if(hub.ok!==true) throw new Error('HUB_LIVE_NOT_OK');
  if(directRows.length>0&&shared.length===0) throw new Error('NO_SHARED_FIXTURE_IDS');
  const ratio=directRows.length?shared.length/directRows.length:1;
  if(directRows.length>=5&&ratio<0.70) throw new Error(`FIXTURE_PARITY_LOW:${shared.length}/${directRows.length}`);
  for(const key of shared.slice(0,10)){
    const h=byHub.get(key),d=teamNames(byDirect.get(key));
    if(String(h?.home?.name??'')!==d.home||String(h?.away?.name??'')!==d.away) throw new Error(`TEAM_IDENTITY_MISMATCH:${key}`);
  }
  if(shared[0]) fs.writeFileSync(process.argv[5],shared[0]);
  console.log('LIVE_PARITY_PASS',JSON.stringify({hub:hubRows.length,directPage1:directRows.length,shared:shared.length,ratio,cache:hub.cache}));
}else if(mode==='markets'){
  const odds=read(process.argv[3]),refs=read(process.argv[4]);
  const expected=['1xBet','Bet365','Macauslot','Crown','Easybets','Vcbet','Interwetten','12Bet','18Bet','Pinnacle'];
  if(odds.ok!==true||!odds.odds||typeof odds.odds!=='object') throw new Error('FULL_ODDS_FAIL');
  if(refs.ok!==true||refs.refereeCount!==10||!Array.isArray(refs.referees)||refs.referees.length!==10) throw new Error('REFEREE_COUNT_FAIL');
  const names=refs.referees.map(x=>x.bookmaker);
  if(expected.some(x=>!names.includes(x))) throw new Error(`REFEREE_IDENTITY_FAIL:${JSON.stringify(names)}`);
  console.log('MARKET_BUSES_PASS',JSON.stringify({fixtureId:odds.fixtureId,refereeCount:refs.refereeCount,readyCount:refs.readyCount,oddsCache:odds.cache,refereeCache:refs.cache}));
}else if(mode==='cache-hit'){
  const data=read(process.argv[3]);
  if(data.ok!==true||data.cache?.hit!==true||data.cache?.stale===true) throw new Error(`CACHE_HIT_FAIL:${JSON.stringify(data.cache)}`);
  console.log('CACHE_HIT_PASS',JSON.stringify(data.cache));
}else if(mode==='cache-refresh'){
  const data=read(process.argv[3]);
  if(data.ok!==true||data.cache?.stale===true) throw new Error(`CACHE_REFRESH_FAIL:${JSON.stringify(data.cache)}`);
  console.log('CACHE_REFRESH_PASS',JSON.stringify({fixtureCount:data.fixtureCount,cache:data.cache}));
}else{
  throw new Error(`UNKNOWN_MODE:${mode}`);
}
