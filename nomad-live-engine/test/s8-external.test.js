import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {PRICE_SOURCE_REGISTRY,buildPriceSourceSnapshots,selectPriceSourceWithFallback} from '../src/price-sources.js';
import {S8_EXTERNAL_URL,fetchS8ExternalMarkets,s8ExternalUnavailable} from '../src/s8-external.js';

const observedAt=Date.parse('2026-08-23T11:30:00Z');
const ready=(source,bookmaker,line,homeOdds,sourceUpdatedAt=observedAt-10_000)=>({
  status:'AH READY',source,bookmaker,bookmakerVerified:true,market:'FULL MATCH LIVE AH',
  line,homeOdds,awayOdds:1.95,sourceUpdatedAt,
});

test('S8 adapter client normalizes Bet365 live AH without trusting an upstream timestamp',async()=>{
  let requestBody=null;
  const fakeFetch=async(url,options)=>{
    assert.equal(url,S8_EXTERNAL_URL);
    assert.equal(options.method,'POST');
    requestBody=JSON.parse(options.body);
    return Response.json({ok:true,results:[{
      clientId:'m1',matched:true,fixtureId:77,mapping:{confidence:.96},
      market:{status:'AH READY',source:'anything',bookmaker:'anything',line:-.75,homeOdds:1.88,awayOdds:1.96,sourceUpdatedAt:1},
    }]});
  };
  const built=await fetchS8ExternalMarkets([
    {id:'m1',home:'Home FC',away:'Away FC',league:'Example',score:{home:1,away:0}},
  ],observedAt,fakeFetch);
  assert.deepEqual(requestBody.matches,[{clientId:'m1',home:'Home FC',away:'Away FC',league:'Example',score:{home:1,away:0}}]);
  assert.equal(built.status,'READY');
  assert.equal(built.ready,1);
  assert.deepEqual(
    [built.results[0].market.source,built.results[0].market.bookmaker,built.results[0].market.line,built.results[0].market.homeOdds],
    ['5DollarFootballAPI','Bet365',-.75,1.88],
  );
  assert.equal(built.results[0].market.sourceUpdatedAt,observedAt);
  assert.equal(built.results[0].market.sourceTimestampSemantics,'adapter_observed_at');
});

test('S1-S7 registry identities remain intact and S8 is additive',()=>{
  assert.deepEqual(
    PRICE_SOURCE_REGISTRY.map(item=>[item.id,item.position,item.source]),
    [
      ['source1',1,'Odds-API.io'],['source2',2,'The Odds API'],['source3',3,'API-Football'],
      ['source5',5,'Nowgoal'],['source6',6,'Nowgoal'],['source7',7,'Nowgoal'],
      ['source8',8,'5DollarFootballAPI'],['source4',4,'TotalCorner'],
    ],
  );
});

test('S8 can win only by same-line better odds, not by its adapter observation freshness',()=>{
  const source1=ready('Odds-API.io','1xBet',-.75,1.80,observedAt-40_000);
  const source8=ready('5DollarFootballAPI','Bet365',-.75,1.88,observedAt);
  let snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source8',source8]]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source8');

  source8.line=-.5;
  snapshots=buildPriceSourceSnapshots(new Map([['source1',source1],['source8',source8]]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source1');
});

test('S8 outage never blocks an existing primary and TotalCorner remains fallback',()=>{
  const source1=ready('Odds-API.io','1xBet',-.75,1.82,observedAt-15_000);
  let snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',source1],['source8',s8ExternalUnavailable('source_timeout')],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source1');
  assert.equal(snapshots.find(item=>item.id==='source8').status,'UNAVAILABLE');

  const source4=ready('TotalCorner','Bet365',-.75,1.84,observedAt-5_000);
  snapshots=buildPriceSourceSnapshots(new Map([
    ['source8',s8ExternalUnavailable('source_timeout')],['source4',source4],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source4');
});

test('S8 can act alone when every other primary is unavailable',()=>{
  const source8=ready('5DollarFootballAPI','Bet365',0,1.91,observedAt);
  const snapshots=buildPriceSourceSnapshots(new Map([['source8',source8]]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source8');
});
