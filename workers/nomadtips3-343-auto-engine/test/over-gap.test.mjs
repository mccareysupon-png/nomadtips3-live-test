import test from 'node:test';
import assert from 'node:assert/strict';
import {currentGoalTotal,overLineGap,overGapPass} from '../src/over-gap.js';
test('3-1 max gap 0.5 accepts O4.25/O4.5',()=>{const s={home:3,away:1};assert.equal(currentGoalTotal(s),4);assert.equal(overLineGap(4.25,s),0.25);assert.equal(overLineGap(4.5,s),0.5);assert.equal(overGapPass(4.25,s,0.5),true);assert.equal(overGapPass(4.5,s,0.5),true)});
test('3-1 max gap 0.5 rejects O4.75/O5.0',()=>{const s={home:3,away:1};assert.equal(overLineGap(4.75,s),0.75);assert.equal(overLineGap(5,s),1);assert.equal(overGapPass(4.75,s,0.5),false);assert.equal(overGapPass(5,s,0.5),false)});
test('larger gaps and unlimited mode',()=>{const s={home:2,away:1};assert.equal(overGapPass(4.5,s,1.5),true);assert.equal(overGapPass(5.5,s,2.5),true);assert.equal(overGapPass(9.75,s,999),true)});
test('stale negative gap and missing score reject',()=>{assert.equal(overLineGap(3.5,{home:3,away:1}),null);assert.equal(overGapPass(3.5,{home:3,away:1},0.5),false);assert.equal(overGapPass(4.5,null,0.5),false)});
