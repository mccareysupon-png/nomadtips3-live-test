import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {
  NOWGOAL_BOOKMAKERS,fetchNowgoal1xBetMarkets,normalizeNowgoalBookmakerAhRow,
} from '../src/nowgoal.js';
import {
  PRICE_SOURCE_REGISTRY,buildPriceSourceSnapshots,selectNowgoalConsensus,selectPriceSourceWithFallback,
} from '../src/price-sources.js';

const observedAt=Date.parse('2026-08-23T14:30:00Z');
const ready=(source,bookmaker,line,odds,updatedAt=observedAt-1_000)=>({
  status:'AH READY',source,bookmaker,bookmakerVerified:true,market:'FULL MATCH LIVE AH',
  line,homeOdds:odds,awayOdds:1.95,sourceUpdatedAt:updatedAt,
});

test('gate 1: Nowgoal exposes all 20 verified bookmaker identities with unique company/source IDs',()=>{
  assert.equal(NOWGOAL_BOOKMAKERS.length,20);
  assert.equal(new Set(NOWGOAL_BOOKMAKERS.map(item=>item.companyId)).size,20);
  assert.equal(new Set(NOWGOAL_BOOKMAKERS.map(item=>item.sourceId)).size,20);
  assert.deepEqual(NOWGOAL_BOOKMAKERS.slice(0,3).map(item=>[item.sourceId,item.companyId,item.bookmaker]),[
    ['source5','50','1xBet'],['source6','8','Bet365'],['source7','17','M88'],
  ]);
});

test('gate 2: retired SOURCE 8 stays absent while legacy and TotalCorner sockets remain registered',()=>{
  const ids=PRICE_SOURCE_REGISTRY.map(item=>item.id);
  assert.equal(ids.includes('source8'),false);
  for(const id of ['source1','source2','source3','source4','source5','source6','source7','source26']) assert.equal(ids.includes(id),true);
  for(let position=9;position<=25;position++) assert.equal(ids.includes(`source${position}`),true);
});

test('gate 3: every Nowgoal bookmaker uses one HOME-line sign rule and HK-to-decimal conversion',()=>{
  for(const definition of NOWGOAL_BOOKMAKERS){
    const market=normalizeNowgoalBookmakerAhRow({rawLine:.25,homeHk:.91,awayHk:.99},observedAt,definition.bookmaker);
    assert.equal(market.status,'AH READY');
    assert.equal(market.bookmaker,definition.bookmaker);
    assert.equal(market.line,-.25);
    assert.equal(market.homeOdds,1.91);
    assert.equal(market.awayOdds,1.99);
  }
});

test('gate 4: new bookmaker quote fails closed without verified Nowgoal change observation',()=>{
  const market=normalizeNowgoalBookmakerAhRow({rawLine:-.5,homeHk:.88,awayHk:1.02},null,'Sbobet');
  assert.equal(market.status,'AH UNAVAILABLE');
  assert.equal(market.reason,'missing_verified_price_change_time');
});

test('gate 5: one Nowgoal session reads all extra change feeds without requiring extra full-feed requests',async()=>{
  const roster=`var A=Array(2); A[1]=[3003850,2,384,27,'Hull City','Manchester United','2026-08-23 13:00:00','2026-08-23 14:29:00',3,1,0,1,0];`;
  const oneX=`<c><match><m>3003850,17348417,0.25,0.88,1.02,155043777,1.63,4.41,5.28</m></match></c>`;
  const sbobet=`<c><match><m>3003850,17348417,0.25,0.91,0.99,155043777,1.63,4.41,5.28</m></match></c>`;
  const bet188=`<c><match><m>3003850,17348417,0.25,0.90,1.00,155043777,1.63,4.41,5.28</m></match></c>`;
  const pinnacle=`<c><match><m>3003850,17348417,0.25,0.89,1.01,155043777,1.63,4.41,5.28</m></match></c>`;
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const path=new URL(url).pathname; calls.push({path,cookie:options.headers?.cookie||''});
    if(path==='/') return new Response('<html><body>Nowgoal</body></html>',{headers:{'set-cookie':'ngsid=all-books; Path=/; HttpOnly'}});
    if(path==='/gf/data/bf_en-idn1.js') return new Response(roster);
    if(path==='/gf/data/odds/en/goal50.xml'||path==='/gf/data/odds/en/ch_goal50.xml') return new Response(oneX);
    if(path==='/gf/data/odds/en/ch_goal31.xml') return new Response(sbobet);
    if(path==='/gf/data/odds/en/ch_goal23.xml') return new Response(bet188);
    if(path==='/gf/data/odds/en/ch_goal47.xml') return new Response(pinnacle);
    return new Response('missing',{status:404});
  };
  const result=await fetchNowgoal1xBetMarkets([{id:'m1',home:'Hull City',away:'Manchester United',score:{home:1,away:0}}],DEFAULT_CONFIG,observedAt,{},fetchImpl);
  assert.equal(result.status,'READY');
  assert.equal(result.bookmakers.total,20);
  assert.equal(result.bookmakers.extraChecked,17);
  const sbobetPeer=result.results[0].market.nowgoalPeers.source19;
  assert.equal(sbobetPeer.status,'AH READY');
  assert.equal(sbobetPeer.bookmaker,'Sbobet');
  assert.equal(sbobetPeer.line,-.25);
  assert.equal(sbobetPeer.homeOdds,1.91);
  const bet188Peer=result.results[0].market.nowgoalPeers.source24;
  assert.equal(bet188Peer.status,'AH READY');
  assert.equal(bet188Peer.bookmaker,'188BET');
  assert.equal(bet188Peer.line,-.25);
  assert.equal(bet188Peer.homeOdds,1.90);
  const pinnaclePeer=result.results[0].market.nowgoalPeers.source25;
  assert.equal(pinnaclePeer.status,'AH READY');
  assert.equal(pinnaclePeer.bookmaker,'Pinnacle');
  assert.equal(pinnaclePeer.line,-.25);
  assert.equal(pinnaclePeer.homeOdds,1.89);
  assert.ok(calls.some(call=>call.path==='/gf/data/odds/en/ch_goal31.xml'));
  assert.ok(calls.some(call=>call.path==='/gf/data/odds/en/ch_goal23.xml'));
  assert.ok(calls.some(call=>call.path==='/gf/data/odds/en/ch_goal47.xml'));
  assert.equal(calls.some(call=>call.path==='/gf/data/odds/en/goal23.xml'),false);
  assert.equal(calls.some(call=>call.path==='/gf/data/odds/en/goal47.xml'),false);
  assert.equal(calls.some(call=>call.path==='/gf/data/odds/en/goal31.xml'),false);
  assert.ok(calls.slice(1).every(call=>call.cookie.includes('ngsid=all-books')));
});

test('gate 6: failure of extra Nowgoal feeds cannot block the proven 1xBet core socket',async()=>{
  const roster=`var A=Array(2); A[1]=[3003850,2,384,27,'Home FC','Away FC','2026-08-23 13:00:00','2026-08-23 14:29:00',3,0,0,0,0];`;
  const oneX=`<c><match><m>3003850,17348417,0.5,0.80,1.05,155043777,1.63,4.41,5.28</m></match></c>`;
  const fetchImpl=async url=>{
    const path=new URL(url).pathname;
    if(path==='/') return new Response('<html><body>Nowgoal</body></html>',{headers:{'set-cookie':'ngsid=core; Path=/'}});
    if(path==='/gf/data/bf_en-idn1.js') return new Response(roster);
    if(path==='/gf/data/odds/en/goal50.xml'||path==='/gf/data/odds/en/ch_goal50.xml') return new Response(oneX);
    return new Response('blocked',{status:503});
  };
  const result=await fetchNowgoal1xBetMarkets([{id:'m1',home:'Home FC',away:'Away FC',score:{home:0,away:0}}],DEFAULT_CONFIG,observedAt,{},fetchImpl);
  assert.equal(result.ready,1);
  assert.equal(result.results[0].market.status,'AH READY');
  assert.equal(result.results[0].market.bookmaker,'1xBet');
  assert.equal(result.results[0].market.nowgoalPeers.source19.status,'AH UNAVAILABLE');
});

test('gate 7: price snapshots expose every Nowgoal bookmaker while preserving verified-bookmaker fail closed',()=>{
  const source5=ready('Nowgoal','1xBet',-.5,1.82);
  source5.nowgoalPeers={source6:ready('Nowgoal','Bet365',-.5,1.84),source19:ready('Nowgoal','Sbobet',-.5,1.83),source24:ready('Nowgoal','188BET',-.5,1.85),source25:ready('Nowgoal','Pinnacle',-.5,1.81)};
  const anonymous=ready('API-Football','API-Football (bookmaker not supplied)',-.5,2.20,observedAt);
  anonymous.bookmakerVerified=false;
  const snapshots=buildPriceSourceSnapshots(new Map([['source3',anonymous],['source5',source5]]),DEFAULT_CONFIG,observedAt);
  assert.equal(snapshots.filter(item=>item.source==='Nowgoal').length,20);
  assert.equal(snapshots.find(item=>item.id==='source19').bookmaker,'Sbobet');
  assert.equal(snapshots.find(item=>item.id==='source24').bookmaker,'188BET');
  assert.equal(snapshots.find(item=>item.id==='source25').bookmaker,'Pinnacle');
  assert.equal(snapshots.find(item=>item.id==='source3').status,'FAIL');
  assert.equal(snapshots.find(item=>item.id==='source3').reason,'bookmaker_not_supplied');
});

test('gate 8: Nowgoal consensus selects the modal HOME AH line and a real quote nearest median odds',()=>{
  const markets=new Map([
    ['source5',ready('Nowgoal','1xBet',-.5,1.80,observedAt-4_000)],
    ['source6',ready('Nowgoal','Bet365',-.5,1.86,observedAt-3_000)],
    ['source7',ready('Nowgoal','M88',-.5,1.84,observedAt-2_000)],
    ['source19',ready('Nowgoal','Sbobet',-.75,1.95,observedAt-1_000)],
    ['source18',ready('Nowgoal','12Bet',-.75,1.92,observedAt-1_000)],
  ]);
  const snapshots=buildPriceSourceSnapshots(markets,DEFAULT_CONFIG,observedAt);
  const selected=selectNowgoalConsensus(snapshots);
  assert.equal(selected.consensusLine,-.5);
  assert.equal(selected.consensusCount,3);
  assert.equal(selected.consensusMedianOdds,1.84);
  assert.equal(selected.bookmaker,'M88');
  assert.equal(selected.odds,1.84);
});

test('gate 9: stale or disallowed-line quotes cannot vote in Nowgoal consensus',()=>{
  const config={...DEFAULT_CONFIG,allowedLinesMode:'SELECTED',allowedSelectionLines:[-.5],maximumPriceAgeSeconds:90};
  const snapshots=buildPriceSourceSnapshots(new Map([
    ['source5',ready('Nowgoal','1xBet',-.5,1.82,observedAt-5_000)],
    ['source6',ready('Nowgoal','Bet365',-.75,1.90,observedAt-5_000)],
    ['source7',ready('Nowgoal','M88',-.5,1.84,observedAt-100_000)],
  ]),config,observedAt);
  const selected=selectNowgoalConsensus(snapshots);
  assert.equal(selected.consensusLine,-.5);
  assert.equal(selected.consensusCount,1);
  assert.equal(selected.bookmaker,'1xBet');
});

test('gate 10: TotalCorner Pinnacle joins the main judge pool while duplicate Pinnacle and TotalCorner Bet365 cannot vote',()=>{
  const source5=ready('Nowgoal','1xBet',-.5,1.80,observedAt-4_000);
  source5.nowgoalPeers={
    source6:ready('Nowgoal','Bet365',-.5,1.84,observedAt-3_000),
    source25:ready('Nowgoal','Pinnacle',-.5,2.20,observedAt-1_000),
  };
  const totalCornerBet365=ready('Bet365 via TotalCorner','Bet365',-.75,2.30,observedAt-2_000);
  totalCornerBet365.totalCornerPeers={
    source26:ready('Pinnacle via TotalCorner','Pinnacle',-.5,1.82,observedAt-2_000),
  };
  let snapshots=buildPriceSourceSnapshots(new Map([
    ['source5',source5],['source4',totalCornerBet365],
  ]),DEFAULT_CONFIG,observedAt);
  let selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source26');
  assert.equal(selected.bookmaker,'Pinnacle');
  assert.equal(selected.consensusLine,-.5);
  assert.equal(selected.consensusCount,3);
  assert.deepEqual([...selected.consensusBookmakers].sort(),['1xBet','Bet365','Pinnacle'].sort());

  snapshots=buildPriceSourceSnapshots(new Map([
    ['source4',totalCornerBet365],
  ]),DEFAULT_CONFIG,observedAt);
  selected=selectPriceSourceWithFallback(snapshots);
  assert.equal(selected.id,'source26');
  assert.equal(selected.bookmaker,'Pinnacle');

  snapshots=buildPriceSourceSnapshots(new Map([
    ['source4',ready('Bet365 via TotalCorner','Bet365',-.5,1.90,observedAt)],
  ]),DEFAULT_CONFIG,observedAt);
  assert.equal(selectPriceSourceWithFallback(snapshots),null);
});