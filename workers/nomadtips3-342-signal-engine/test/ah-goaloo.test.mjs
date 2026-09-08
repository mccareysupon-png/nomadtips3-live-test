import test from 'node:test';
import assert from 'node:assert/strict';
import {hkToDecimal,parseAsianHandicapQuotes,ahSideQuote,lockedFamilies,filterNewSignals} from '../src/index.js';

test('Goaloo goal8 HK odds always convert to decimal with +1',()=>{
  assert.equal(hkToDecimal(0.5),1.5);
  assert.equal(hkToDecimal(1.4),2.4);
  assert.equal(hkToDecimal(1.5),2.5);
  assert.equal(hkToDecimal(2.4),3.4);
});

test('Goaloo Bet365 raw give-home line converts to canonical selected-side AH',()=>{
  // Verified against Bet365 live Asian Lines on 2026-09-08:
  // HOME -0.25 @ 2.600 / AWAY +0.25 @ 1.475.
  // Goaloo/Nowgoal raw convention is positive when HOME gives the handicap.
  const quotes=parseAsianHandicapQuotes('<c><m>123,77,0.25,1.6,0.475</m></c>',1000);
  const q=quotes.get('123');
  assert.equal(q.rawHomeLine,0.25);
  assert.equal(q.rawHomeHk,1.6);
  assert.equal(q.rawAwayHk,0.475);
  assert.equal(q.homeOdds,2.6);
  assert.equal(q.awayOdds,1.475);
  assert.deepEqual(ahSideQuote(q,'HOME'),{line:-0.25,odds:2.6});
  assert.deepEqual(ahSideQuote(q,'AWAY'),{line:0.25,odds:1.475});
});

test('market locks are per family; existing 1X2 does not block O/U or Asian Handicap',()=>{
  const record={signals:[{market:'1X2'}]};
  assert.deepEqual([...lockedFamilies(record)],['oneXtwo']);
  assert.deepEqual(filterNewSignals([{market:'1X2'},{market:'OVER'},{market:'AH'}],record).map(x=>x.market),['OVER','AH']);
  const legacy={prediction:{oneXtwo:{pick:'HOME'},totals:{pick:'OVER'}}};
  assert.deepEqual(filterNewSignals([{market:'UNDER'},{market:'AH'}],legacy).map(x=>x.market),['AH']);
});
