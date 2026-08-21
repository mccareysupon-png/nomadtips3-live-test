import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {createLockedSignal,summarizeApiFootballRecovery} from '../src/index.js';
import {buildPriceSourceSnapshots,publicPriceSourceSnapshot,selectPriceSource} from '../src/price-sources.js';
import {buildTheOddsApiMarkets,parseTheOddsApiAsianHandicaps} from '../src/the-odds-api.js';
import {buildApiFootballMarkets,fetchApiFootballLiveAsianHandicaps,matchApiFootballEvent,parseApiFootballAsianHandicaps,selectApiFootballAsianHandicapBet} from '../src/api-football.js';

const observedAt=Date.parse('2026-08-21T10:00:40Z');
const market=(source,bookmaker,line,odds,updatedAt)=>({
  status:'AH READY',source,bookmaker,line,homeOdds:odds,awayOdds:1.95,sourceUpdatedAt:updatedAt,market:'FULL MATCH LIVE AH',
});

test('The Odds API spread keeps HOME line, odds and timestamp from one bookmaker',()=>{
  const event={home_team:'Home FC',away_team:'Away FC',bookmakers:[
    {title:'Book A',last_update:'2026-08-21T10:00:20Z',markets:[{key:'spreads',outcomes:[{name:'Home FC',point:-.75,price:1.86},{name:'Away FC',point:.75,price:1.96}]}]},
    {title:'Book B',last_update:'2026-08-21T10:00:35Z',markets:[{key:'spreads',outcomes:[{name:'Home FC',point:-.5,price:1.80},{name:'Away FC',point:.5,price:2.00}]}]},
  ]};
  const candidates=parseTheOddsApiAsianHandicaps(event);
  assert.deepEqual(candidates.map(item=>[item.bookmaker,item.line,item.homeOdds,item.sourceUpdatedAt]),[
    ['Book A',-.75,1.86,Date.parse('2026-08-21T10:00:20Z')],
    ['Book B',-.5,1.80,Date.parse('2026-08-21T10:00:35Z')],
  ]);
});

test('SOURCE 2 match with no full-match spread reports no matching live AH',()=>{
  const matches=[{id:'m1',home:'Home FC',away:'Away FC',league:'Example League'}];
  const events=[{id:'e1',sport_key:'soccer_example',sport_title:'Example League',commence_time:'2026-08-21T09:30:00Z',home_team:'Home FC',away_team:'Away FC',bookmakers:[]}];
  const result=buildTheOddsApiMarkets(matches,events,DEFAULT_CONFIG,observedAt);
  assert.equal(result.results[0].market.reason,'no_matching_live_ah');
});

test('SOURCE 3 resolves the Full Match live Asian Handicap bet without using half markets',()=>{
  const bet=selectApiFootballAsianHandicapBet([
    {id:11,name:'Asian Handicap - 1st Half'},
    {id:22,name:'Asian Handicap'},
    {id:33,name:'Fulltime Result'},
  ]);
  assert.deepEqual(bet,{id:22,name:'Asian Handicap'});
});

test('API-Football resolves the live AH bet once, then uses filtered odds and fixture requests per cycle',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),key:options?.headers?.['x-apisports-key']});
    if(String(url).includes('/odds/live/bets')){
      return Response.json({errors:[],response:[{id:11,name:'Asian Handicap - 1st Half'},{id:22,name:'Asian Handicap'}]});
    }
    return Response.json({errors:[],response:[]},{headers:{'x-ratelimit-requests-remaining':'7498','x-ratelimit-remaining':'298'}});
  };
  try{
    const first=await fetchApiFootballLiveAsianHandicaps('test-key');
    const second=await fetchApiFootballLiveAsianHandicaps('test-key',first.bet);
    assert.deepEqual(first.bet,{id:22,name:'Asian Handicap'});
    assert.equal(second.received,0);
    assert.equal(calls.filter(call=>call.url.includes('/odds/live/bets')).length,1);
    assert.equal(calls.filter(call=>call.url.includes('/odds/live?bet=22')).length,2);
    assert.equal(calls.filter(call=>call.url.includes('/fixtures?live=all')).length,2);
    assert.ok(calls.every(call=>call.key==='test-key'));
    assert.deepEqual(first.quota,{remainingDay:7498,remainingMinute:298});
  }finally{globalThis.fetch=originalFetch;}
});

test('API-Football caches the resolved live AH bet before a rate-limited price request',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  let cachedBet=null;
  globalThis.fetch=async url=>{
    calls.push(String(url));
    if(String(url).includes('/odds/live/bets')){
      return Response.json({errors:[],response:[{id:22,name:'Asian Handicap'}]});
    }
    return Response.json({errors:{rateLimit:'Too many requests per minute'},response:[]});
  };
  try{
    await assert.rejects(
      fetchApiFootballLiveAsianHandicaps('test-key',null,9000,async bet=>{cachedBet=bet;}),
      /API_FOOTBALL_ERRORS:rateLimit/,
    );
    assert.deepEqual(cachedBet,{id:22,name:'Asian Handicap'});
    assert.equal(calls.filter(url=>url.includes('/odds/live/bets')).length,1);
    assert.equal(calls.filter(url=>url.includes('/odds/live?bet=22')).length,1);
    assert.equal(calls.filter(url=>url.includes('/fixtures?live=all')).length,1);
  }finally{globalThis.fetch=originalFetch;}
});

test('API-Football reads every live odds page before matching prices',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{
    const parsed=new URL(String(url)),page=Number(parsed.searchParams.get('page')||1);
    calls.push(`${parsed.pathname}:${page}`);
    if(parsed.pathname==='/fixtures') return Response.json({errors:[],paging:{current:1,total:1},response:[]});
    const event=page===2?{fixture:{id:202},status:{},odds:[]}:null;
    return Response.json({errors:[],paging:{current:page,total:2},response:event?[event]:[]});
  };
  try{
    const response=await fetchApiFootballLiveAsianHandicaps('test-key',{id:22,name:'Asian Handicap'});
    assert.equal(response.received,1);
    assert.equal(response.events[0].fixture.id,202);
    assert.deepEqual(response.pages.odds,{total:2,fetched:2});
    assert.deepEqual(calls.filter(item=>item.startsWith('/odds/live:')),['/odds/live:1','/odds/live:2']);
  }finally{globalThis.fetch=originalFetch;}
});

test('API-Football keeps odds usable when the optional live fixture helper fails',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const parsed=new URL(String(url));
    if(parsed.pathname==='/fixtures') return Response.json({errors:{server:'fixture unavailable'},response:[]});
    return Response.json({errors:[],response:[{fixture:{id:303},status:{},odds:[]}]});
  };
  try{
    const response=await fetchApiFootballLiveAsianHandicaps('test-key',{id:22,name:'Asian Handicap'});
    assert.equal(response.events.length,1);
    assert.match(response.fixturesError,/API_FOOTBALL_ERRORS:server/);
  }finally{globalThis.fetch=originalFetch;}
});

test('API-Football reuses compact live fixtures to protect Pro-plan quota without caching odds',async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  let fixtureCache=null;
  globalThis.fetch=async url=>{
    const parsed=new URL(String(url));calls.push(parsed.pathname);
    if(parsed.pathname==='/fixtures') return Response.json({errors:[],response:[{
      fixture:{id:404,date:'2026-08-21T09:30:00Z'},league:{name:'Example League'},
      teams:{home:{name:'Home FC'},away:{name:'Away FC'}},
    }]});
    return Response.json({errors:[],response:[]});
  };
  try{
    const first=await fetchApiFootballLiveAsianHandicaps(
      'test-key',{id:22,name:'Asian Handicap'},9000,null,null,value=>{fixtureCache=value;},observedAt,
    );
    const second=await fetchApiFootballLiveAsianHandicaps(
      'test-key',{id:22,name:'Asian Handicap'},9000,null,fixtureCache,null,observedAt+60_000,
    );
    assert.equal(first.fixtureCache,'REFRESHED');
    assert.equal(second.fixtureCache,'HIT');
    assert.equal(second.fixtures[0].fixture.id,404);
    assert.equal(calls.filter(path=>path==='/fixtures').length,1);
    assert.equal(calls.filter(path=>path==='/odds/live').length,2);
  }finally{globalThis.fetch=originalFetch;}
});

test('API-Football keeps HOME line, both odds and timestamp from one live market',()=>{
  const event={
    fixture:{id:123,date:'2026-08-21T09:30:00Z'},league:{name:'Example League'},
    teams:{home:{name:'Home FC'},away:{name:'Away FC'}},update:'2026-08-21T10:00:35Z',
    odds:[{id:22,name:'Asian Handicap',values:[
      {value:'Home FC',handicap:'-0.75',odd:'1.86',main:true},
      {value:'Away FC',handicap:'+0.75',odd:'1.96',main:true},
      {value:'Home FC',handicap:'-0.50',odd:'1.70'},
      {value:'Away FC',handicap:'+0.50',odd:'2.10'},
    ]}],
  };
  const candidates=parseApiFootballAsianHandicaps(event,{}, {id:22,name:'Asian Handicap'});
  assert.deepEqual(candidates.map(item=>[item.line,item.homeOdds,item.awayOdds,item.sourceUpdatedAt,item.main]),[
    [-.75,1.86,1.96,Date.parse('2026-08-21T10:00:35Z'),true],
    [-.5,1.70,2.10,Date.parse('2026-08-21T10:00:35Z'),false],
  ]);
  assert.equal(candidates[0].bookmaker,'API-Football (bookmaker not supplied)');
});

test('SOURCE 3 mapping honors Settings and prefers the primary API-Football AH line',()=>{
  const matches=[{id:'m1',home:'Home FC',away:'Away FC',league:'Example League'}];
  const events=[{
    fixture:{id:123,date:'2026-08-21T09:30:00Z'},league:{name:'Example League'},
    teams:{home:{name:'Home FC'},away:{name:'Away FC'}},update:'2026-08-21T10:00:35Z',
    odds:[{id:22,name:'Asian Handicap',values:[
      {value:'Home',handicap:'-0.75',odd:'1.86',main:true},{value:'Away',handicap:'+0.75',odd:'1.96',main:true},
      {value:'Home',handicap:'-0.50',odd:'1.90'},{value:'Away',handicap:'+0.50',odd:'1.90'},
    ]}],
  }];
  const config={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[-.75]};
  const result=buildApiFootballMarkets(matches,events,config,observedAt,{id:22,name:'Asian Handicap'});
  assert.equal(result.results[0].market.source,'API-Football');
  assert.equal(result.results[0].market.line,-.75);
  assert.equal(result.results[0].market.homeOdds,1.86);
});

test('SOURCE 3 joins odds through the canonical live Fixture ID before relying on bookmaker team labels',()=>{
  const matches=[{id:'m1',home:'Manchester United',away:'Liverpool',league:'Premier League'}];
  const fixtures=[{
    fixture:{id:777,date:'2026-08-21T09:30:00Z'},league:{name:'Premier League'},
    teams:{home:{name:'Manchester United FC'},away:{name:'Liverpool FC'}},
  }];
  const events=[{
    fixture:{id:777},teams:{home:{name:'MU Red'},away:{name:'Merseyside Red'}},update:'2026-08-21T10:00:35Z',
    odds:[{id:22,name:'Asian Handicap',values:[
      {value:'Home',handicap:'-0.75',odd:'1.86',main:true},{value:'Away',handicap:'+0.75',odd:'1.96',main:true},
    ]}],
  }];
  const result=buildApiFootballMarkets(matches,events,DEFAULT_CONFIG,observedAt,{id:22,name:'Asian Handicap'},fixtures);
  assert.equal(result.fixtureMapped,1);
  assert.equal(result.mapped,1);
  assert.equal(result.results[0].mappingMethod,'fixture_id');
  assert.equal(result.results[0].market.line,-.75);
});

test('SOURCE 3 rejects senior versus youth or women identity mismatches',()=>{
  const senior={home:'Arsenal',away:'Chelsea',league:'Premier League'};
  const youth={home:'Arsenal U23',away:'Chelsea U23',league:{name:'Premier League 2'}};
  const women={home:'Arsenal Women',away:'Chelsea Women',league:{name:'Women Super League'}};
  assert.equal(matchApiFootballEvent(senior,youth).ok,false);
  assert.equal(matchApiFootballEvent(senior,youth).classMismatch,true);
  assert.equal(matchApiFootballEvent(senior,women).ok,false);
});

test('selected price prefers freshness, then better odds inside the near-freshness window',()=>{
  const source1=market('Odds-API.io','1xBet',-.75,1.82,observedAt-14_000);
  const source2=market('The Odds API','Book B',-.75,1.90,observedAt-31_000);
  let snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source2',source2]]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSource(snapshots).id,'source1');

  source2.sourceUpdatedAt=observedAt-17_000;
  snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source2',source2]]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSource(snapshots).id,'source2');
});

test('near-fresh prices on different AH lines still select one fresher intact market',()=>{
  const source1=market('Odds-API.io','1xBet',-.75,1.82,observedAt-14_000);
  const source2=market('The Odds API','Book B',-.5,1.95,observedAt-17_000);
  const snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source2',source2]]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSource(snapshots);
  assert.equal(selected.id,'source1');
  assert.deepEqual([selected.market.line,selected.market.homeOdds],[-.75,1.82]);
});

test('selected price is one intact source record and Source 2 failure never blocks Source 1',()=>{
  const source1=market('Odds-API.io','1xBet',-.75,1.82,observedAt-14_000);
  const source2={status:'ODDS NOT READY',source:'The Odds API',reason:'price_fetch_failed:timeout'};
  const snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source2',source2]]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSource(snapshots);
  assert.equal(selected.id,'source1');
  assert.deepEqual([selected.market.source,selected.market.bookmaker,selected.market.line,selected.market.homeOdds],['Odds-API.io','1xBet',-.75,1.82]);
  assert.equal(snapshots[1].status,'UNAVAILABLE');
  assert.equal('market' in publicPriceSourceSnapshot(selected),false);
});

test('SOURCE 3 participates independently and wins only with a valid fresher-or-better whole price',()=>{
  const source1=market('Odds-API.io','1xBet',-.75,1.82,observedAt-14_000);
  const source2={status:'ODDS NOT READY',source:'The Odds API',reason:'no_matching_live_match'};
  const source3=market('API-Football','API-Football (bookmaker not supplied)',-.75,1.90,observedAt-13_000);
  const snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source2',source2],['source3',source3]]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSource(snapshots);
  assert.equal(selected.id,'source3');
  assert.deepEqual([selected.market.source,selected.market.line,selected.market.homeOdds],['API-Football',-.75,1.90]);
  assert.equal(snapshots.find(item=>item.id==='source2').status,'UNAVAILABLE');
});

test('SOURCE 3 timeout never blocks a valid SOURCE 2 price',()=>{
  const source1={status:'ODDS NOT READY',source:'Odds-API.io',reason:'quota'};
  const source2=market('The Odds API','Book B',-.5,1.84,observedAt-11_000);
  const source3={status:'ODDS NOT READY',source:'API-Football',reason:'price_fetch_failed:API_FOOTBALL_TIMEOUT'};
  const snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source2',source2],['source3',source3]]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSource(snapshots);
  assert.equal(selected.id,'source2');
  assert.equal(snapshots.find(item=>item.id==='source3').status,'UNAVAILABLE');
});

test('SOURCE 3 recovery counts only football-qualified matches that Source 1 and 2 could not price',()=>{
  const matches=[
    {id:'recovered',detectionPassed:true,state:'SIGNAL',selectedPrice:{id:'source3'},priceSources:[{id:'source1',status:'UNAVAILABLE'},{id:'source2',status:'UNAVAILABLE'},{id:'source3',status:'PASS'}]},
    {id:'better-price',detectionPassed:true,state:'SIGNAL',selectedPrice:{id:'source3'},priceSources:[{id:'source1',status:'PASS'},{id:'source2',status:'UNAVAILABLE'},{id:'source3',status:'PASS'}]},
    {id:'not-qualified',detectionPassed:false,state:'WATCHING',selectedPrice:{id:'source3'},priceSources:[{id:'source1',status:'UNAVAILABLE'},{id:'source2',status:'UNAVAILABLE'},{id:'source3',status:'PASS'}]},
  ];
  const summary=summarizeApiFootballRecovery(matches,new Map([
    ['recovered',{bookmakerVerified:false}],['better-price',{bookmakerVerified:true}],['not-qualified',{bookmakerVerified:true}],
  ]));
  assert.deepEqual(summary,{ready:3,recoveryCandidates:1,recoveredSignals:1,selected:3,bookmakerUnverified:1});
});

test('locked signal stores source, bookmaker, line, odds, timestamp and age from the selected source',()=>{
  const selectedMarket=market('The Odds API','Book B',-.5,1.90,observedAt-17_000);
  const match={
    id:'m1',home:'Home FC',away:'Away FC',league:'Example',selectionLine:selectedMarket.line,selectionOdds:selectedMarket.homeOdds,
    minute:60,score:{home:0,away:0},stats:{},hunger:{},rolling:{},market:selectedMarket,selectedPrice:{id:'source2'},
  };
  const envelope={schemaVersion:34102,version:1,updatedAt:observedAt-1000,appliesFromCycle:1};
  const signal=createLockedSignal(match,envelope,DEFAULT_CONFIG,observedAt);
  assert.deepEqual(
    [signal.priceSourceId,signal.oddsSource,signal.bookmaker,signal.line,signal.odds,signal.sourceUpdatedAt,signal.priceAgeSeconds],
    ['source2','The Odds API','Book B',-.5,1.90,observedAt-17_000,17],
  );
});

test('locked signal stores intact SOURCE 3 metadata',()=>{
  const selectedMarket=market('API-Football','API-Football (bookmaker not supplied)',-.75,1.88,observedAt-9_000);
  const match={
    id:'m3',home:'Home FC',away:'Away FC',league:'Example',selectionLine:selectedMarket.line,selectionOdds:selectedMarket.homeOdds,
    minute:61,score:{home:0,away:0},stats:{},hunger:{},rolling:{},market:selectedMarket,selectedPrice:{id:'source3'},
  };
  const envelope={schemaVersion:34102,version:1,updatedAt:observedAt-1000,appliesFromCycle:1};
  const signal=createLockedSignal(match,envelope,DEFAULT_CONFIG,observedAt);
  assert.deepEqual(
    [signal.priceSourceId,signal.oddsSource,signal.bookmaker,signal.line,signal.odds,signal.sourceUpdatedAt,signal.priceAgeSeconds],
    ['source3','API-Football','API-Football (bookmaker not supplied)',-.75,1.88,observedAt-9_000,9],
  );
});

test('SOURCE 2 bookmaker selection honors Settings before freshness',()=>{
  const config={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[-.75]};
  const matches=[{id:'m1',home:'Home FC',away:'Away FC',league:'Example League'}];
  const events=[{id:'e1',sport_key:'soccer_example',sport_title:'Example League',commence_time:'2026-08-21T09:30:00Z',home_team:'Home FC',away_team:'Away FC',bookmakers:[
    {title:'Fresh wrong line',last_update:'2026-08-21T10:00:35Z',markets:[{key:'spreads',outcomes:[{name:'Home FC',point:-.5,price:1.90},{name:'Away FC',point:.5,price:1.90}]}]},
    {title:'Valid line',last_update:'2026-08-21T10:00:20Z',markets:[{key:'spreads',outcomes:[{name:'Home FC',point:-.75,price:1.80},{name:'Away FC',point:.75,price:2.00}]}]},
  ]}];
  const result=buildTheOddsApiMarkets(matches,events,config,observedAt);
  assert.equal(result.results[0].market.bookmaker,'Valid line');
  assert.equal(result.results[0].market.line,-.75);
});

