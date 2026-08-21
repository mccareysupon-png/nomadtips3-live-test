import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('detector card renders every enabled source and the selected whole price',()=>{
  const runtime=readFileSync(new URL('../../nomad-live/runtime.js',import.meta.url),'utf8');
  const match={
    id:'m1',state:'SIGNAL',home:'Home FC',away:'Away FC',league:'Example',minute:60,score:{home:0,away:0},
    passed:6,total:6,detectionPassed:true,checks:{market:true},marketCheck:{passed:true},priceStatus:'AH READY',
    rolling:{recent:{delta:{shotsOn:{home:1}},homePressure:12}},hunger:{passedCount:2},
    marketComparison:{bet365:{status:'ODDS NOT READY',reason:'no live AH'}},
    priceSources:[
      {id:'source1',position:1,source:'Odds-API.io',status:'PASS',bookmaker:'1xBet',line:-.75,odds:1.82,priceAgeSeconds:14},
      {id:'source2',position:2,source:'The Odds API',status:'UNAVAILABLE',reason:'no_matching_live_ah',bookmaker:null,line:null,odds:null,priceAgeSeconds:null},
      {id:'source3',position:3,source:'API-Football',status:'PASS',bookmaker:'API-Football (bookmaker not supplied)',line:-.75,odds:1.80,priceAgeSeconds:9},
    ],
    selectedPrice:{id:'source1',position:1,source:'Odds-API.io',status:'PASS',bookmaker:'1xBet',line:-.75,odds:1.82,priceAgeSeconds:14},
  };
  const context={location:{pathname:'/noop'},document:{},setInterval(){},fetch(){},console,__match:match,__output:null};
  vm.runInNewContext(`${runtime}\n__output=matchRow(__match);`,context);
  assert.match(context.__output,/SOURCE 1 · Odds-API\.io · PASS · 1xBet · HOME -0\.75 @ 1\.82 · age 14s/);
  assert.match(context.__output,/SOURCE 2 · The Odds API · N\/A/);
  assert.match(context.__output,/SOURCE 3 · API-Football · PASS · API-Football \(bookmaker not supplied\) · HOME -0\.75 @ 1\.80 · age 9s/);
  assert.match(context.__output,/SELECTED PRICE · Odds-API\.io · 1xBet · HOME -0\.75 @ 1\.82 · age 14s/);
});

test('detector card collapses missing source and selected prices to N/A',()=>{
  const runtime=readFileSync(new URL('../../nomad-live/runtime.js',import.meta.url),'utf8');
  const match={
    id:'m2',state:'NEAR SIGNAL',home:'Home FC',away:'Away FC',league:'Example',minute:60,score:{home:0,away:0},
    passed:5,total:6,detectionPassed:false,checks:{market:false},marketCheck:{passed:false},priceStatus:'ODDS NOT READY',
    rolling:{recent:{delta:{shotsOn:{home:0}},homePressure:0}},hunger:{passedCount:1},
    priceSources:[
      {id:'source1',position:1,source:'Odds-API.io',status:'UNAVAILABLE',reason:'a very long provider error'},
      {id:'source2',position:2,source:'The Odds API',status:'UNAVAILABLE',reason:'no_matching_live_match'},
      {id:'source3',position:3,source:'API-Football',status:'UNAVAILABLE',reason:'rate limit'},
    ],
    selectedPrice:null,
  };
  const context={location:{pathname:'/noop'},document:{},setInterval(){},fetch(){},console,__match:match,__output:null};
  vm.runInNewContext(`${runtime}\n__output=matchRow(__match);`,context);
  assert.match(context.__output,/SOURCE 1 · Odds-API\.io · N\/A/);
  assert.match(context.__output,/SOURCE 2 · The Odds API · N\/A/);
  assert.match(context.__output,/SOURCE 3 · API-Football · N\/A/);
  assert.match(context.__output,/SELECTED PRICE · N\/A/);
  assert.doesNotMatch(context.__output,/very long provider error|no matching live match|rate limit|No selected source/);
});

