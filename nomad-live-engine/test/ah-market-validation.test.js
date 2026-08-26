import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {assessHomeMarket} from '../src/detector.js';
import {buildPriceSourceSnapshots,selectPriceSourceWithFallback} from '../src/price-sources.js';

const OBSERVED_AT=100000;
const ready=(overrides={})=>({
  status:'AH READY',line:-0.5,homeOdds:1.80,awayOdds:1.95,sourceUpdatedAt:OBSERVED_AT,
  bookmaker:'1xBet',market:'FULL MATCH LIVE AH',source:'Odds-API.io',...overrides,
});

test('D-004: missing AH status fails closed',()=>{
  const market=ready();
  delete market.status;
  const result=assessHomeMarket(market,DEFAULT_CONFIG,OBSERVED_AT);
  assert.equal(result.status,'AH INVALID');
  assert.equal(result.reason,'missing_market_status');
  assert.equal(result.passed,false);
});

test('D-004: missing and non-scalar AH lines never coerce to 0.00',()=>{
  for(const line of [null,undefined,'',false,true,[0],{value:0}]){
    const result=assessHomeMarket(ready({line}),DEFAULT_CONFIG,OBSERVED_AT);
    assert.equal(result.status,'AH INVALID',`line=${String(line)}`);
    assert.equal(result.passed,false,`line=${String(line)}`);
  }
});

test('D-004: AH line must remain inside the hard -10 to +10 quarter-goal range',()=>{
  for(const line of [-100,-10.25,10.25,100]){
    const result=assessHomeMarket(ready({line}),DEFAULT_CONFIG,OBSERVED_AT);
    assert.equal(result.status,'AH INVALID',`line=${line}`);
    assert.equal(result.passed,false,`line=${line}`);
  }
  for(const line of [-10,-1,-0.25,0,0.25,1,10,'0.25']){
    const result=assessHomeMarket(ready({line}),DEFAULT_CONFIG,OBSERVED_AT);
    assert.equal(result.status,'AH READY',`line=${line}`);
    assert.equal(result.passed,true,`line=${line}`);
  }
});

test('D-004 regression: configured minimum and freshness boundary remain unchanged',()=>{
  assert.equal(assessHomeMarket(ready({homeOdds:1.49}),DEFAULT_CONFIG,OBSERVED_AT).status,'AH ODDS FAIL');
  assert.equal(assessHomeMarket(ready({homeOdds:1.50}),DEFAULT_CONFIG,OBSERVED_AT).status,'AH READY');
  assert.equal(assessHomeMarket(ready({sourceUpdatedAt:OBSERVED_AT-90000}),DEFAULT_CONFIG,OBSERVED_AT).status,'AH READY');
  assert.equal(assessHomeMarket(ready({sourceUpdatedAt:OBSERVED_AT-90001}),DEFAULT_CONFIG,OBSERVED_AT).status,'AH STALE');
});

test('D-004 regression: SELECTED lines still distinguish HOME +1 from HOME -0.5',()=>{
  const config={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[1]};
  assert.equal(assessHomeMarket(ready({line:-0.5}),config,OBSERVED_AT).status,'AH LINE FAIL');
  assert.equal(assessHomeMarket(ready({line:1}),config,OBSERVED_AT).status,'AH READY');
});

test('D-004: malformed market cannot become a selectable price source',()=>{
  const malformed=ready({line:null});
  const sources=buildPriceSourceSnapshots(new Map([['source1',malformed]]),DEFAULT_CONFIG,OBSERVED_AT);
  const source1=sources.find(item=>item.id==='source1');
  assert.equal(source1.status,'FAIL');
  assert.equal(source1.assessment.status,'AH INVALID');
  assert.equal(selectPriceSourceWithFallback(sources),null);
});
