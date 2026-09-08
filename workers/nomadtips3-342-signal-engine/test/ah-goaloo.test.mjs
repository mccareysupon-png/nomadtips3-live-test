import test from 'node:test';
import assert from 'node:assert/strict';
import {hkToDecimal,parseAsianHandicapQuotes,ahSideQuote,lockedFamilies,filterNewSignals} from '../src/index.js';

test('Goaloo goal8 HK odds always convert to decimal with +1',()=>{
  assert.equal(hkToDecimal(0.5),1.5);
  assert.equal(hkToDecimal(1.4),2.4);
  assert.equal(hkToDecimal(1.5),2.5);
  assert.equal(hkToDecimal(2.4),3.4);
});

test('Goaloo AH fields keep HOME/AWAY price ownership and only reverse line perspective',()=>{
  const quotes=parseAsianHandicapQuotes('<c><m>123,77,-1.5,0.5,1.4</m></c>',1000);
  const q=quotes.get('123');
  assert.equal(q.rawHomeLine,-1.5);
  assert.equal(q.rawHomeHk,0.5);
  assert.equal(q.rawAwayHk,1.4);
  assert.equal(q.homeOdds,1.5);
  assert.equal(q.awayOdds,2.4);
  assert.deepEqual(ahSideQuote(q,'HOME'),{line:-1.5,odds:1.5});
  assert.deepEqual(ahSideQuote(q,'AWAY'),{line:1.5,odds:2.4});
});

test('market locks are per family; existing 1X2 does not block O/U or Asian Handicap',()=>{
  const record={signals:[{market:'1X2'}]};
  assert.deepEqual([...lockedFamilies(record)],['oneXtwo']);
  assert.deepEqual(filterNewSignals([{market:'1X2'},{market:'OVER'},{market:'AH'}],record).map(x=>x.market),['OVER','AH']);
  const legacy={prediction:{oneXtwo:{pick:'HOME'},totals:{pick:'OVER'}}};
  assert.deepEqual(filterNewSignals([{market:'UNDER'},{market:'AH'}],legacy).map(x=>x.market),['AH']);
});
