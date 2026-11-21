import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledFromNormalHub} from './hub-upcoming-feed.mjs';
import {mergeStoredPrematch} from './stored-prematch-feed.mjs';
import {evaluateMarket1x2} from './market-1x2.mjs';
const now=1795240000;
const fixture={fixtureId:'213456789',league:{id:'422'},home:{id:'142',name:'Home'},away:{id:'239',name:'Away'},status:'scheduled',boardState:'scheduled',kickoffUtc:new Date((now+1800)*1000).toISOString(),providerOddsHeld:false,providerOddsFreshAt:(now-100)*1000,providerOdds:{odds:{'1x2':{closing:{home:2.1,draw:3.4,away:3.2}}}}};
const snapshot=(fixtures=[fixture])=>({ok:true,cacheOnly:true,stale:false,fetchedAt:now*1000,fixtures});
test('normal cached HUB scheduled 1X2 odds feed is valid and does not falsely claim Bet365',()=>{
 const data=scheduledFromNormalHub(snapshot(),now);
 assert.equal(data.status,'READY');assert.equal(data.stats.accepted,1);assert.equal(data.stats.providerCalls,0);
 assert.equal(data.fixtures[0].storedHub1x2.bookmaker,'5usd-hub');
 assert.equal(data.fixtures[0].storedBet365,undefined);
 const merged=mergeStoredPrematch([],data.fixtures,now);
 assert.equal(merged.stats.oneX2Prices,1);
 const mergedAgain=mergeStoredPrematch(merged.fixtures,data.fixtures,now);
 assert.equal(mergedAgain.fixtures.length,1);
 const cfg={minProbabilityBySide:{HOME_WIN:0,DRAW:0,AWAY_WIN:0},minEdge:-1,minEV:-1,priceRanges:{HOME_WIN:[1,100],DRAW:[1,100],AWAY_WIN:[1,100]}};
 const report=evaluateMarket1x2({odds:{bookmaker:'5usd-hub',home:2.1,draw:3.4,away:3.2,observed:now-100},asOf:now,kickoff:now+1800,homeLast10:[],awayLast10:[]},cfg);
 assert.equal(report.metrics?.quoteSource,'5usd-hub');assert.notEqual(report.reason,'NO_STORED_BET365_PRICE');
});
test('reject live fixtures, stale or held quotes, bad scores or past kickoff',()=>{
 let data=scheduledFromNormalHub(snapshot([{...fixture,status:'live',boardState:'live'}, {...fixture,fixtureId:'213456790',providerOddsHeld:true}, {...fixture,fixtureId:'213456791',providerOddsFreshAt:(now-7200)*1000}, {...fixture,fixtureId:'213456792',kickoffUtc:new Date((now-100)*1000).toISOString()}]),now);
 assert.equal(data.fixtures.length,0);
 assert.equal(data.stats.heldPrices,1);
 assert.equal(data.stats.oldPrices,1);
 data=scheduledFromNormalHub({...snapshot(),stale:true},now);assert.equal(data.status,'DEFERRED_HUB_CACHE');
 data=scheduledFromNormalHub({...snapshot(),fetchedAt:(now-7200)*1000},now);assert.equal(data.status,'DEFERRED_HUB_STALE');
});
test('preserves earliest immutable price snapshots in recording ledger, not retroactively amended',()=>{
 const d=scheduledFromNormalHub(snapshot(),now);
 const first=mergeStoredPrematch([],d.fixtures,now).fixtures;
 const fresh={...fixture,providerOddsFreshAt:(now-20)*1000,providerOdds:{odds:{'1x2':{closing:{home:2.5,draw:3.6,away:2.8}}}}};
 const second=mergeStoredPrematch(first,scheduledFromNormalHub(snapshot([fresh]),now).fixtures,now).fixtures;
 assert.equal(second.length,1);assert.equal(second[0].storedHub1x2.prices['1X2_HOME'],2.5);
 assert.equal(first[0].storedHub1x2.prices['1X2_HOME'],2.1);
});
