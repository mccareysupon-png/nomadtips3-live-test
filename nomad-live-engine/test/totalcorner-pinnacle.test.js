import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {parseBet365Asian,parseTotalCornerAsian} from '../src/parser.js';
import {PRICE_SOURCE_REGISTRY,buildPriceSourceSnapshots,selectPriceSourceWithFallback} from '../src/price-sources.js';

const observedAt=Date.parse('2026-08-24T14:30:00Z');
const group=(home,line,away,closing=false)=>`<div class="oa-major-group${closing?' oa-major-closing':''}"><span data-sort-value="${home}">${home}</span><span data-sort-value="${line}">${line}</span><span data-sort-value="${away}">${away}</span></div>`;
const row=(bookmaker,open,current)=>`<div class="oa-major-row"><div class="oa-major-company"><strong>${bookmaker}</strong></div>${group(...open)}${group(...current,true)}</div>`;
const panel=(pinnacleCurrent=['1.88','-0.5','1.96'])=>`<div class="oa-market-panel" data-market-panel="handicap"><div class="oa-major-list oa-handicap-snapshot" data-handicap-period="full" data-handicap-phase="inplay">${row('Bet 365',['1.84','-0.5','1.98'],['1.82','-0.5','2.00'])}${row('Pinnacle',['1.86','-0.5','1.96'],pinnacleCurrent)}</div></div>`;

const unavailable=(source,reason='not_available')=>({status:'AH UNAVAILABLE',source,reason});
const readyNowgoal=(line=-0.5,homeOdds=1.86,bookmaker='1xBet',updatedAt=observedAt-1_000)=>({
  status:'AH READY',source:'Nowgoal',bookmaker,line,homeOdds,awayOdds:1.96,
  sourceUpdatedAt:updatedAt,market:'FULL MATCH LIVE AH',bookmakerVerified:true,
});

test('TotalCorner Pinnacle keeps an unsigned positive AH line on the HOME side',()=>{
  const market=parseTotalCornerAsian(panel(['1.26','0.25','3.77']),'Pinnacle',observedAt);
  assert.equal(market.status,'AH READY');
  assert.equal(market.bookmaker,'Pinnacle');
  assert.equal(market.line,0.25);
  assert.equal(market.homeOdds,1.26);
  assert.equal(market.awayOdds,3.77);
  assert.equal(market.source,'Pinnacle via TotalCorner');
});

test('TotalCorner Pinnacle preserves an explicit negative HOME AH line',()=>{
  const market=parseTotalCornerAsian(panel(['1.88','-0.5','1.96']),'Pinnacle',observedAt);
  assert.equal(market.status,'AH READY');
  assert.equal(market.line,-0.5);
});

test('existing Bet365 parser attaches Pinnacle from the same TotalCorner payload without changing enumerable contract',()=>{
  const market=parseBet365Asian(panel(),observedAt);
  assert.deepEqual(market,{
    status:'AH READY',homeOdds:1.82,line:-0.5,awayOdds:2,bookmaker:'Bet365',market:'FULL MATCH LIVE AH',side:'HOME',
    source:'Bet365 via TotalCorner',sourceUpdatedAt:observedAt,
  });
  assert.equal(Object.prototype.propertyIsEnumerable.call(market,'totalCornerPeers'),false);
  assert.equal(market.totalCornerPeers.source26.bookmaker,'Pinnacle');
  assert.equal(market.totalCornerPeers.source26.homeOdds,1.88);
});

test('SOURCE 26 exposes TotalCorner Pinnacle while SOURCE 4 stays the legacy final registry entry',()=>{
  assert.deepEqual(PRICE_SOURCE_REGISTRY.find(item=>item.id==='source26'),{id:'source26',position:26,source:'TotalCorner',bookmaker:'Pinnacle'});
  assert.deepEqual(PRICE_SOURCE_REGISTRY.at(-1),{id:'source4',position:4,source:'TotalCorner'});
  const source4=parseBet365Asian(panel(),observedAt-2_000);
  const snapshots=buildPriceSourceSnapshots(new Map([['source4',source4]]),DEFAULT_CONFIG,observedAt);
  const pinnacle=snapshots.find(item=>item.id==='source26');
  assert.equal(pinnacle.bookmaker,'Pinnacle');
  assert.equal(pinnacle.line,-0.5);
  assert.equal(pinnacle.odds,1.88);
  assert.equal(pinnacle.status,'PASS');
});

test('TotalCorner Pinnacle joins the primary judge consensus while duplicate Nowgoal Pinnacle has no second vote',()=>{
  const source4=parseBet365Asian(panel(['1.82','-0.5','1.96']),observedAt-2_000);
  const source5=readyNowgoal(-.5,1.80,'1xBet',observedAt-4_000);
  source5.nowgoalPeers={
    source6:readyNowgoal(-.5,1.84,'Bet365',observedAt-3_000),
    source25:readyNowgoal(-.5,2.20,'Pinnacle',observedAt-1_000),
  };
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',source5],
    ['source4',source4],
  ]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source26');
  assert.equal(selected.bookmaker,'Pinnacle');
  assert.equal(selected.consensusLine,-.5);
  assert.equal(selected.consensusCount,3);
  assert.deepEqual([...selected.consensusBookmakers].sort(),['1xBet','Bet365','Pinnacle'].sort());
});

test('TotalCorner Pinnacle can decide alone while the attached TotalCorner Bet365 carrier remains non-voting',()=>{
  const source4=parseBet365Asian(panel(),observedAt-2_000);
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source1',unavailable('Odds-API.io')],
    ['source2',unavailable('The Odds API')],
    ['source3',unavailable('API-Football')],
    ['source5',unavailable('Nowgoal')],
    ['source4',source4],
  ]),DEFAULT_CONFIG,observedAt);
  const selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source26');
  assert.equal(selected.bookmaker,'Pinnacle');
  assert.equal(selected.odds,1.88);
});
