import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {PRICE_SOURCE_REGISTRY,buildPriceSourceSnapshots,selectPriceSourceWithFallback} from '../src/price-sources.js';

// SOURCE 4 is intentionally fallback-only; primary Sources 1-3 plus later SOURCE 5 retain priority.
const observedAt=Date.parse('2026-08-22T01:00:40Z');
const ready=(source,bookmaker,line,odds,updatedAt,extra={})=>({
  status:'AH READY',source,bookmaker,line,homeOdds:odds,awayOdds:1.95,
  sourceUpdatedAt:updatedAt,market:'FULL MATCH LIVE AH',...extra,
});
const unavailable=(source,reason='not_available')=>({status:'AH UNAVAILABLE',source,reason});

test('SOURCE 4 is TotalCorner and remains last in registry',()=>{
  assert.deepEqual(PRICE_SOURCE_REGISTRY.at(-1),{id:'source4',position:4,source:'TotalCorner'});
});

test('SOURCE 5 is Nowgoal and is a primary peer before SOURCE 4 fallback',()=>{
  assert.deepEqual(PRICE_SOURCE_REGISTRY.find(item=>item.id==='source5'),{id:'source5',position:5,source:'Nowgoal'});
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',ready('Nowgoal','1xBet',-.5,1.90,observedAt-3_000)],
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,2.05,observedAt-1_000)],
  ]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source5');
  assert.equal(selected.bookmaker,'1xBet');
});

test('Oddspedia page-fetch timestamp alone cannot outrank a verified primary price on a different AH line',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',ready('Odds-API.io','1xBet',-.5,1.80,observedAt-20_000)],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',ready('Oddspedia','Bet365',-.75,2.10,observedAt-500)],
    ['source4',unavailable('TotalCorner')],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source1');
});

test('Oddspedia can win as a peer when it has better HOME odds on the same AH line',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',ready('Odds-API.io','1xBet',-.5,1.80,observedAt-20_000)],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',ready('Oddspedia','Bet365',-.5,1.90,observedAt-500)],
    ['source4',unavailable('TotalCorner')],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source5');
});

test('TotalCorner Bet365 is selected only when primary Sources 1-3 and 5 have no PASS market',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',unavailable('Nowgoal')],
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,1.88,observedAt-4_000)],
  ]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source4');
  assert.equal(selected.bookmaker,'Bet365');
  assert.equal(selected.status,'PASS');
});

test('API-Football can decide from an intact live AH even when bookmaker is not supplied',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',ready('API-Football','API-Football (bookmaker not supplied)',-.5,1.90,observedAt-2_000,{bookmakerVerified:false})],
    ['source5',unavailable('Nowgoal')],
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,1.88,observedAt-4_000)],
  ]),DEFAULT_CONFIG,observedAt);
  const source3=snapshots.find(item=>item.id==='source3');
  assert.equal(source3.status,'PASS');
  assert.equal(source3.reason,null);
  assert.equal(source3.bookmaker,'API-Football (bookmaker not supplied)');
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source3');
});

test('a valid primary source always beats TotalCorner even when fallback is fresher and pays more',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',ready('Odds-API.io','1xBet',-.5,1.80,observedAt-18_000)],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',unavailable('Nowgoal')],
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,2.05,observedAt-1_000)],
  ]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source1');
  assert.equal(selected.bookmaker,'1xBet');
});

test('invalid TotalCorner fallback never creates a selected price',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',unavailable('Nowgoal')],
    ['source4',{status:'AH INVALID',source:'TotalCorner',reason:'handicap_panel_missing'}],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots),null);
});
