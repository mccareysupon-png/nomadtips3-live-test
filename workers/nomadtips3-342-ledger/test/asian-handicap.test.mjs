import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAsianHandicap } from '../src/index.js';

test('Asian Handicap standard and push',()=>{
  assert.equal(gradeAsianHandicap('HOME',-0.5,2,1),'WIN');
  assert.equal(gradeAsianHandicap('HOME',-1,2,1),'PUSH');
  assert.equal(gradeAsianHandicap('AWAY',0.5,1,1),'WIN');
});
test('Asian Handicap quarter lines',()=>{
  assert.equal(gradeAsianHandicap('HOME',-0.25,1,1),'HALF_LOSS');
  assert.equal(gradeAsianHandicap('HOME',0.25,1,1),'HALF_WIN');
  assert.equal(gradeAsianHandicap('AWAY',-0.75,1,2),'HALF_WIN');
  assert.equal(gradeAsianHandicap('HOME',-0.75,2,1),'HALF_WIN');
});
test('Asian Handicap selected-side perspective',()=>{
  assert.equal(gradeAsianHandicap('AWAY',1,2,1),'PUSH');
  assert.equal(gradeAsianHandicap('AWAY',1.25,2,1),'HALF_WIN');
});
