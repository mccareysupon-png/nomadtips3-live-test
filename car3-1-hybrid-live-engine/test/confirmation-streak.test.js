import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceConfirmationStreak} from '../worker/src/upgrade.js';

test('enriched confirmation streak survives base-scan streak resets',()=>{
  const baseStreaks={};
  const enrichedStreaks={};
  const key='123:HOME:WIN';

  baseStreaks[key]=0;
  assert.equal(advanceConfirmationStreak(enrichedStreaks,key,true),1);

  // The base collector may reset its own pre-enrichment streak next cycle because
  // it does not yet have the direct live-odds enrichment. That must not reset the
  // confirmation streak used by the enriched decision layer.
  baseStreaks[key]=0;
  assert.equal(advanceConfirmationStreak(enrichedStreaks,key,true),2);
  assert.equal(enrichedStreaks[key],2);
});

test('enriched confirmation streak resets only when enriched gates fail',()=>{
  const streaks={};
  const key='456:AWAY:AH';
  assert.equal(advanceConfirmationStreak(streaks,key,true),1);
  assert.equal(advanceConfirmationStreak(streaks,key,false),0);
  assert.equal(advanceConfirmationStreak(streaks,key,true),1);
});
