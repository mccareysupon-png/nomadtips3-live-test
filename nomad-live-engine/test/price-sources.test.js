import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {createLockedSignal} from '../src/index.js';
import {buildPriceSourceSnapshots,publicPriceSourceSnapshot,selectPriceSource} from '../src/price-sources.js';
import {buildTheOddsApiMarkets,parseTheOddsApiAsianHandicaps} from '../src/the-odds-api.js';

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
