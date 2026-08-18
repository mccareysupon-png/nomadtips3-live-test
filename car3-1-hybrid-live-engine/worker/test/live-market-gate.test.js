import test from 'node:test';
import assert from 'node:assert/strict';

import {
  marketSelectionFromLiveOdds,
  selectedAhLineForSide
} from '../src/upgrade.js';
import { selectedAhLine } from '../src/settlement-v2.js';

const liveOdds={
  oneXtwo:{home:1.9,draw:3.2,away:4.1},
  asianHandicap:{home:1.4,line:1,away:2.25},
  overUnder:{over:1.8,line:2.5,under:2.05}
};

test('HOME AH uses the real home-side line and home odds from the matched live record',()=>{
  assert.deepEqual(
    marketSelectionFromLiveOdds(liveOdds,'AH','HOME'),
    {line:1,odds:1.4}
  );
});

test('AWAY AH inverts the Goaloo home-perspective line and uses away odds',()=>{
  const source={...liveOdds,asianHandicap:{home:2.2,line:-1,away:1.42}};
  assert.deepEqual(
    marketSelectionFromLiveOdds(source,'AH','AWAY'),
    {line:1,odds:1.42}
  );
});

test('selected AH line conversion is symmetric for HOME and AWAY',()=>{
  assert.equal(selectedAhLineForSide(1,'HOME'),1);
  assert.equal(selectedAhLineForSide(1,'AWAY'),-1);
  assert.equal(selectedAhLineForSide(-1,'HOME'),-1);
  assert.equal(selectedAhLineForSide(-1,'AWAY'),1);
});

test('missing matched live bookmaker record returns no market price and cannot be treated as a signal price',()=>{
  assert.deepEqual(
    marketSelectionFromLiveOdds(null,'AH','HOME'),
    {line:null,odds:null}
  );
});

test('new AH history records marked SELECTED settle with the exact locked selected line',()=>{
  assert.equal(selectedAhLine({
    selectedSide:'AWAY',
    line:1,
    selectedLine:1,
    linePerspective:'SELECTED'
  }),1);
});
