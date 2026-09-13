import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFiveUsdPublicFeed} from '../src/fivedollar-public-feed.js';

const fixture=(id,boardState,extra={})=>({
  fixtureId:String(id),boardState,
  league:{name:'Test League'},home:{name:`Home ${id}`},away:{name:`Away ${id}`},
  kickoffAt:1_800_000_000_000+Number(id)*1000,minute:boardState==='live'?67:null,
  score:{home:1,away:0},stats:{attacks:{home:70,away:55},dangerousAttack:{home:34,away:22},shotsOn:{home:5,away:2},shotsOff:{home:7,away:5},corners:{home:4,away:2},possession:{home:58,away:42}},
  events:boardState==='live'?[{type:'goal',minute:61,team:'home',count:1},{type:'yellow_card',minute:64,team:'away',count:1}]:[],
  provenance:{observedAt:1_800_000_000_000,sourceUpdatedAt:null},...extra,
});

const snapshot={
  state:{ok:true,finishedAt:1_800_000_000_100,lastError:null,rateLimited:false},
  board:{updatedAt:1_800_000_000_100,fixtures:[fixture(1,'live'),fixture(2,'scheduled'),fixture(3,'terminal')]},
};

const candidateShadow={rows:[{
  fixtureId:'1',state:'NEAR SIGNAL',side:'home',detectionPassed:true,
  stats:fixture(1,'live').stats,
  rolling:{available:true,windowMinutes:5,recent:{homePressure:44,delta:{shotsOn:{home:1,away:0},shotsOff:{home:0,away:0},corners:{home:1,away:0}}}},
  checks:{minute:true,hunger:true,evidence:true,market:false},passed:5,total:6,
  hunger:{passedCount:2,total:3},evidence:{required:true},sidePressureShare:61.5,
  decisionShadow:{ok:true,status:'CONSENSUS READY',side:'home',line:-0.5,odds:1.93,homeLine:-0.5,homeOdds:1.93,awayOdds:1.97,selectedSourceId:'source6',selectedBookmaker:'Bet365',freshnessBasis:'OBSERVED',observedAt:1_800_000_000_000,signalAuthority:false},
}]};

test('5USD public feed includes LIVE plus WAITING and excludes terminal fixtures',()=>{
  const feed=buildFiveUsdPublicFeed(snapshot,candidateShadow);
  assert.equal(feed.ok,true);
  assert.equal(feed.source,'5DollarFootballAPI');
  assert.equal(feed.sourceOfTruth,true);
  assert.equal(feed.shadowOnly,true);
  assert.equal(feed.signalAuthority,false);
  assert.deepEqual(feed.matches.map(row=>row.id),['1','2']);
  assert.deepEqual(feed.counts,{live:1,waiting:1,watching:0,near:1,signal:0,detectorSignal:0});
});

test('live public row preserves native detector presentation fields and raw 5USD events',()=>{
  const row=buildFiveUsdPublicFeed(snapshot,candidateShadow).matches[0];
  assert.equal(row.id,'1');
  assert.equal(row.state,'NEAR SIGNAL');
  assert.equal(row.side,'home');
  assert.equal(row.detectionPassed,true);
  assert.equal(row.passed,5);
  assert.equal(row.total,6);
  assert.equal(row.rolling.recent.homePressure,44);
  assert.equal(row.stats.attacks.home,70);
  assert.equal(row.freshness.sourceUpdatedAt,null);
  assert.equal(row.freshness.freshnessBasis,'OBSERVED');
  assert.deepEqual(row.events,[{type:'goal',minute:61,team:'home',count:1},{type:'yellow_card',minute:64,team:'away',count:1}]);
});

test('referee decision becomes display price only and cannot create a locked signal',()=>{
  const row=buildFiveUsdPublicFeed(snapshot,candidateShadow).matches[0];
  assert.equal(row.priceStatus,'AH READY');
  assert.equal(row.selectedPrice.source,'5DollarFootballAPI');
  assert.equal(row.selectedPrice.bookmaker,'Bet365');
  assert.equal(row.selectedPrice.line,-0.5);
  assert.equal(row.selectedPrice.odds,1.93);
  assert.equal(row.selectedPrice.sourceUpdatedAt,null);
  assert.equal(row.signalStatus,null);
  assert.equal(row.signalLock,null);
});

test('waiting public row stays lightweight and never pretends detector, event, or price readiness',()=>{
  const row=buildFiveUsdPublicFeed(snapshot,candidateShadow).matches.find(item=>item.id==='2');
  assert.equal(row.state,'WAITING');
  assert.equal(row.minute,null);
  assert.equal(row.detectionPassed,false);
  assert.deepEqual(row.events,[]);
  assert.equal(row.priceStatus,'AH WAIT');
  assert.equal(row.selectedPrice,null);
});

test('5USD public feed JSON cannot leak legacy provider authority labels',()=>{
  const serialized=JSON.stringify(buildFiveUsdPublicFeed(snapshot,candidateShadow));
  for(const legacy of ['Nowgoal','TotalCorner','Odds-API.io','API-Football','Oddspedia','Flashscore']) assert.equal(serialized.includes(legacy),false,legacy);
});