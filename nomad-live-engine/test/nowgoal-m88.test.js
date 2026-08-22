import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {fetchNowgoal1xBetMarkets,normalizeNowgoalM88AhRow} from '../src/nowgoal.js';
import {buildPriceSourceSnapshots,selectPriceSource} from '../src/price-sources.js';

const observedAt=Date.parse('2026-08-22T16:30:00Z');

test('M88: HOME gives 0/0.5 becomes NOMAD HOME -0.25 and HK odds become decimal',()=>{
  const market=normalizeNowgoalM88AhRow({rawLine:.25,homeHk:.91,awayHk:.99},observedAt);
  assert.equal(market.status,'AH READY');
  assert.equal(market.bookmaker,'M88');
  assert.equal(market.source,'Nowgoal');
  assert.equal(market.line,-.25);
  assert.equal(market.homeOdds,1.91);
  assert.equal(market.awayOdds,1.99);
});

test('M88: AWAY gives 0.5 becomes NOMAD HOME +0.50 and preserves HOME/AWAY prices',()=>{
  const market=normalizeNowgoalM88AhRow({rawLine:-.5,homeHk:.76,awayHk:1.16},observedAt);
  assert.equal(market.status,'AH READY');
  assert.equal(market.line,.5);
  assert.equal(market.homeOdds,1.76);
  assert.equal(market.awayOdds,2.16);
});

test('Nowgoal session reads M88 company 17 with independent change-time evidence',async()=>{
  const roster=`var A=Array(2); A[1]=[3003850,2,384,27,'NAC Breda','Ajax Reserves','2026-08-22 15:30:00','2026-08-22 16:29:00',3,2,1,2,1];`;
  const oneX=`<c><match><m>3003850,17348417,0.25,0.88,1.02,155043777,1.63,4.41,5.28</m></match></c>`;
  const m88=`<c><match><m>3003850,17348417,0.25,0.91,0.99,155043777,1.63,4.41,5.28</m></match></c>`;
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),cookie:options.headers?.cookie||''});
    const path=new URL(url).pathname;
    if(path==='/') return new Response('<!doctype html><html><body>Nowgoal session page</body></html>',{status:200,headers:{'set-cookie':'ngsid=m88-session; Path=/; HttpOnly'}});
    if(path==='/gf/data/bf_en-idn1.js') return new Response(roster,{status:200,headers:{'content-type':'application/javascript'}});
    if(path==='/gf/data/odds/en/goal50.xml'||path==='/gf/data/odds/en/ch_goal50.xml') return new Response(oneX,{status:200,headers:{'content-type':'text/xml'}});
    if(path==='/gf/data/odds/en/goal17.xml'||path==='/gf/data/odds/en/ch_goal17.xml') return new Response(m88,{status:200,headers:{'content-type':'text/xml'}});
    return new Response('missing',{status:404});
  };

  const result=await fetchNowgoal1xBetMarkets([{id:'m1',home:'NAC Breda',away:'Ajax Reserves',score:{home:2,away:1}}],DEFAULT_CONFIG,observedAt,{},fetchImpl);
  assert.equal(result.status,'READY');
  assert.equal(result.mapped,1);
  assert.equal(result.m88Ready,1);
  const peer=result.results[0].market.nowgoalM88Peer;
  assert.equal(peer.status,'AH READY');
  assert.equal(peer.bookmaker,'M88');
  assert.equal(peer.line,-.25);
  assert.equal(peer.homeOdds,1.91);
  assert.equal(peer.awayOdds,1.99);
  assert.equal(peer.sourceUpdatedAt,observedAt);
  assert.ok(calls.some(call=>new URL(call.url).pathname==='/gf/data/odds/en/goal17.xml'));
  assert.ok(calls.some(call=>new URL(call.url).pathname==='/gf/data/odds/en/ch_goal17.xml'));
  assert.ok(calls.slice(1).every(call=>call.cookie.includes('ngsid=m88-session')));
});

test('SOURCE 7 M88 can judge while anonymous API-Football price fails closed',()=>{
  const m88=normalizeNowgoalM88AhRow({rawLine:.25,homeHk:.91,awayHk:.99},observedAt-1000);
  const nowgoal1x={
    status:'AH READY',source:'Nowgoal',bookmaker:'1xBet',bookmakerVerified:true,market:'FULL MATCH LIVE AH',
    line:-.25,homeOdds:1.80,awayOdds:2.00,sourceUpdatedAt:observedAt-10_000,nowgoalM88Peer:m88,
  };
  const apiFootball={
    status:'AH READY',source:'API-Football',bookmaker:'API-Football (bookmaker not supplied)',bookmakerVerified:false,
    market:'FULL MATCH LIVE AH',line:-.25,homeOdds:2.20,awayOdds:1.65,sourceUpdatedAt:observedAt,
  };
  const config={...DEFAULT_CONFIG,allowedLinesMode:'ANY',oddsMaximumEnabled:false};
  const snapshots=buildPriceSourceSnapshots(new Map([['source3',apiFootball],['source5',nowgoal1x]]),config,observedAt);
  const source3=snapshots.find(item=>item.id==='source3');
  const source7=snapshots.find(item=>item.id==='source7');
  assert.equal(source3.status,'FAIL');
  assert.equal(source3.reason,'bookmaker_not_supplied');
  assert.equal(source7.status,'PASS');
  assert.equal(source7.bookmaker,'M88');
  assert.equal(selectPriceSource(snapshots).id,'source7');
});
