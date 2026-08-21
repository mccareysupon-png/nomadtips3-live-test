import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAsianHandicap} from '../src/real-market.js';

const payload={bookmakers:{'1xbet':[{name:'Spread',updatedAt:'2026-08-21T03:20:00Z',odds:[
  {hdp:-0.5,home:'1.91',away:'1.91'},
  {hdp:-1,home:'2.20',away:'1.70'},
  {hdp:-1.25,home:'2.55',away:'1.52'}
]}]}};

test('CAR 3.4 chooses configured HOME -1 alternate instead of balanced main line',()=>{
  const ah=parseAsianHandicap(payload,'1xbet',{side:'HOME',ahMin:-1,ahMax:-1,oddsMin:1.7,oddsMax:2.5});
  assert.equal(ah.line,-1);
  assert.equal(ah.home,2.2);
  assert.equal(ah.matchedPreference,true);
  assert.equal(ah.matchedOdds,true);
});

test('CAR 3.4 maps configured AWAY +1 to HOME -1 market row',()=>{
  const ah=parseAsianHandicap(payload,'1xbet',{side:'AWAY',ahMin:1,ahMax:1,oddsMin:1.5,oddsMax:2});
  assert.equal(ah.line,-1);
  assert.equal(ah.away,1.7);
  assert.equal(ah.matchedPreference,true);
});
