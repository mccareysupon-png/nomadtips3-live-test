import test from 'node:test';
import assert from 'node:assert/strict';
import {signalKeyFor,validateSignalPayload} from '../src/signal-ledger.js';

const clock=Date.parse('2026-08-27T08:00:00Z');
const valid=()=>({
  matchId:'123456',
  league:'Test League',
  home:'Home FC',
  away:'Away FC',
  entryMinute:67,
  entryScore:[1,1],
  lockedAt:clock-5000,
  configVersion:'342-cfg-browser-1',
  evidence:{
    totalCorner:{source:'TotalCorner',observedAt:clock-8000,snapshots:[{minute:66,attacks:[50,40],dangerous:[30,20]}]},
    m88:{book:'M88',status:'VALID',observedAt:clock-3000,rawHomeLine:'+0.25',decodedHomeLine:0.25,homeOddsRaw:0.88,homeOddsDecimal:1.88,oddsFormat:'HK'}
  }
});

test('signal payload locks only fresh TotalCorner + VALID sign-safe M88 evidence',()=>{
  const out=validateSignalPayload(valid(),clock);
  assert.equal(out.ok,true);
  assert.equal(out.value.signalKey,signalKeyFor('123456','HOME'));
  assert.equal(out.value.homeAh,0.25);
  assert.equal(out.value.oddsDecimal,1.88);
});

test('unsigned non-zero M88 handicap is rejected even if caller says VALID',()=>{
  const body=valid();body.evidence.m88.rawHomeLine='0.25';
  const out=validateSignalPayload(body,clock);
  assert.equal(out.ok,false);
  assert.ok(out.errors.includes('m88_nonzero_line_requires_explicit_sign'));
});

test('stale M88 evidence is rejected fail-closed',()=>{
  const body=valid();body.evidence.m88.observedAt=clock-61000;
  const out=validateSignalPayload(body,clock);
  assert.equal(out.ok,false);
  assert.ok(out.errors.includes('m88_observation_not_fresh'));
});
