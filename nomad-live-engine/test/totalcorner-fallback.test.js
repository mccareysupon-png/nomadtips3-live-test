import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {PRICE_SOURCE_REGISTRY,buildPriceSourceSnapshots,selectPriceSourceWithFallback} from '../src/price-sources.js';

const observedAt=Date.parse('2026-08-22T01:00:40Z');
const ready=(source,bookmaker,line,odds,updatedAt,extra={})=>({
  status:'AH READY',source,bookmaker,line,homeOdds:odds,awayOdds:1.95,
  sourceUpdatedAt:updatedAt,market:'FULL MATCH LIVE AH',...extra,
});
const unavailable=(source,reason='not_available')=>({status:'AH UNAVAILABLE',source,reason});

test('SOURCE 4 is TotalCorner and remains last in registry',()=>{
  assert.deepEqual(PRICE_SOURCE_REGISTRY.at(-1),{id:'source4',position:4,source:'TotalCorner'});
});

test('TotalCorner Bet365 is selected only when Sources 1-3 have no PASS market',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,1.88,observedAt-4_000)],
  ]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source4');
  assert.equal(selected.bookmaker,'Bet365');
  assert.equal(selected.status,'PASS');
});

test('explicitly unverified API-Football bookmaker is rejected and falls through to TotalCorner',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',ready('API-Football','API-Football (bookmaker not supplied)',-.5,1.90,observedAt-2_000,{bookmakerVerified:false})],
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,1.88,observedAt-4_000)],
  ]),DEFAULT_CONFIG,observedAt);
  const source3=snapshots.find(item=>item.id==='source3');
  assert.equal(source3.status,'FAIL');
  assert.equal(source3.reason,'bookmaker_not_supplied');
  assert.equal(selectPriceSourceWithFallback(snapshots).id,'source4');
});

test('a valid primary source always beats TotalCorner even when fallback is fresher and pays more',()=>{
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',ready('Odds-API.io','1xBet',-.5,1.80,observedAt-18_000)],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
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
    ['source4',{status:'AH INVALID',source:'TotalCorner',reason:'handicap_panel_missing'}],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots),null);
});
