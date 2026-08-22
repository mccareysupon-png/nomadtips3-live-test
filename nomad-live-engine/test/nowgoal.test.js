import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../src/config.js';
import {fetchNowgoal1xBetMarkets,normalizeNowgoalAhRow,normalizeNowgoalBet365AhRow,parseGoal50Rows,parseNowgoalRoster} from '../src/nowgoal.js';

const observedAt=Date.parse('2026-08-22T13:00:00Z');

test('Nowgoal roster parser preserves HOME/AWAY and live state',()=>{
  const js=`var A=Array(3); A[1]=[3003850,2,384,27,'Hull City','Manchester United','2026-08-22 11:30:00','2026-08-22 12:32:19',3,2,0,2,0];`;
  const rows=parseNowgoalRoster(js);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0],{id:'3003850',home:'Hull City',away:'Manchester United',date:'2026-08-22 11:30:00',state:3,score:{home:2,away:0}});
});

test('Nowgoal goal50 parser reads one intact 1xBet AH row',()=>{
  const rows=parseGoal50Rows(`<c><match><m>3003850,17348417,1.25,0.78,1.06,155043777,1.63,4.41,5.28</m></match></c>`);
  assert.deepEqual({...rows.get('3003850'),fields:undefined},{id:'3003850',rawLine:1.25,homeHk:.78,awayHk:1.06,fields:undefined});
});

test('Nowgoal flips only AH sign and converts HK prices to decimal',()=>{
  const favorite=normalizeNowgoalAhRow({rawLine:1.5,homeHk:.83,awayHk:.98},observedAt);
  assert.equal(favorite.line,-1.5);
  assert.equal(favorite.homeOdds,1.83);
  assert.equal(favorite.awayOdds,1.98);
  const underdog=normalizeNowgoalAhRow({rawLine:-.5,homeHk:.91,awayHk:.89},observedAt);
  assert.equal(underdog.line,.5);
  assert.equal(underdog.homeOdds,1.91);
  assert.equal(underdog.awayOdds,1.89);
});

test('Nowgoal Bet365 uses the same canonical HOME sign rule without swapping HOME/AWAY prices',()=>{
  const favorite=normalizeNowgoalBet365AhRow({rawLine:1.5,homeHk:.83,awayHk:.98},observedAt);
  assert.equal(favorite.bookmaker,'Bet365');
  assert.equal(favorite.line,-1.5);
  assert.equal(favorite.homeOdds,1.83);
  assert.equal(favorite.awayOdds,1.98);
  const underdog=normalizeNowgoalBet365AhRow({rawLine:-.5,homeHk:.91,awayHk:.89},observedAt);
  assert.equal(underdog.line,.5);
  assert.equal(underdog.homeOdds,1.91);
  assert.equal(underdog.awayOdds,1.89);
});

test('Nowgoal refuses an AH row without verified price-change time',()=>{
  const market=normalizeNowgoalAhRow({rawLine:.5,homeHk:.9,awayHk:.9},null);
  assert.equal(market.status,'AH UNAVAILABLE');
  assert.equal(market.reason,'missing_verified_price_change_time');
});

test('Nowgoal live source maps same-side teams and uses ch_goal50 as freshness evidence',async()=>{
  const roster=`var A=Array(2); A[1]=[3003850,2,384,27,'Hull City','Manchester United','2026-08-22 11:30:00','2026-08-22 12:32:19',3,2,0,2,0];`;
  const full=`<c><match><m>3003850,17348417,1.25,0.78,1.06,155043777,1.63,4.41,5.28</m></match></c>`;
  const changed=`<c><match><m>3003850,17348417,1.25,0.78,1.06,155043777,1.63,4.41,5.28</m></match></c>`;
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),cookie:options.headers?.cookie||''});
    const path=new URL(url).pathname;
    if(path==='/') return new Response('<!doctype html><html><body>Nowgoal session page</body></html>',{status:200,headers:{'set-cookie':'ngsid=test-session; Path=/; HttpOnly'}});
    if(path==='/gf/data/bf_en-idn1.js') return new Response(roster,{status:200,headers:{'content-type':'application/javascript'}});
    if(path==='/gf/data/odds/en/goal50.xml') return new Response(full,{status:200,headers:{'content-type':'text/xml'}});
    if(path==='/gf/data/odds/en/ch_goal50.xml') return new Response(changed,{status:200,headers:{'content-type':'text/xml'}});
    return new Response('missing',{status:404});
  };
  const result=await fetchNowgoal1xBetMarkets([{id:'m1',home:'Hull City',away:'Manchester United'}],DEFAULT_CONFIG,observedAt,{},fetchImpl);
  assert.equal(result.status,'READY');
  assert.equal(result.mapped,1);
  assert.equal(result.ready,1);
  const market=result.results[0].market;
  assert.equal(market.source,'Nowgoal');
  assert.equal(market.bookmaker,'1xBet');
  assert.equal(market.line,-1.25);
  assert.equal(market.homeOdds,1.78);
  assert.equal(market.awayOdds,2.06);
  assert.equal(market.sourceUpdatedAt,observedAt);
  assert.equal(market.sourceTimestampKind,'nowgoal_change_observed');
  assert.equal(market.nowgoalBet365Peer.status,'AH UNAVAILABLE');
  assert.ok(calls.slice(1).every(call=>call.cookie.includes('ngsid=test-session')));
});

test('Nowgoal session reads Bet365 company 8 as an independent peer with ch_goal8 freshness',async()=>{
  const roster=`var A=Array(2); A[1]=[3003850,2,384,27,'Hull City','Manchester United','2026-08-22 11:30:00','2026-08-22 12:32:19',3,2,0,2,0];`;
  const oneX=`<c><match><m>3003850,17348417,1.25,0.78,1.06,155043777,1.63,4.41,5.28</m></match></c>`;
  const bet365=`<c><match><m>3003850,17348417,-0.5,0.91,0.89,155043777,1.63,4.41,5.28</m></match></c>`;
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url:String(url),cookie:options.headers?.cookie||''});
    const path=new URL(url).pathname;
    if(path==='/') return new Response('<!doctype html><html><body>Nowgoal session page</body></html>',{status:200,headers:{'set-cookie':'ngsid=dual-session; Path=/; HttpOnly'}});
    if(path==='/gf/data/bf_en-idn1.js') return new Response(roster,{status:200,headers:{'content-type':'application/javascript'}});
    if(path==='/gf/data/odds/en/goal50.xml'||path==='/gf/data/odds/en/ch_goal50.xml') return new Response(oneX,{status:200,headers:{'content-type':'text/xml'}});
    if(path==='/gf/data/odds/en/goal8.xml'||path==='/gf/data/odds/en/ch_goal8.xml') return new Response(bet365,{status:200,headers:{'content-type':'text/xml'}});
    return new Response('missing',{status:404});
  };
  const result=await fetchNowgoal1xBetMarkets([{id:'m1',home:'Hull City',away:'Manchester United'}],DEFAULT_CONFIG,observedAt,{},fetchImpl);
  assert.equal(result.status,'READY');
  assert.equal(result.bet365Ready,1);
  const peer=result.results[0].market.nowgoalBet365Peer;
  assert.equal(peer.status,'AH READY');
  assert.equal(peer.source,'Nowgoal');
  assert.equal(peer.bookmaker,'Bet365');
  assert.equal(peer.line,.5);
  assert.equal(peer.homeOdds,1.91);
  assert.equal(peer.awayOdds,1.89);
  assert.equal(peer.sourceUpdatedAt,observedAt);
  assert.ok(calls.some(call=>new URL(call.url).pathname==='/gf/data/odds/en/goal8.xml'));
  assert.ok(calls.some(call=>new URL(call.url).pathname==='/gf/data/odds/en/ch_goal8.xml'));
});
