import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLiveDetail} from '../src/parser.js';

const detail=status=>parseLiveDetail(`<div>Live Events Status: ${status} , Score: 1 - 1 , Corner: 3 - 2 5 Shoot on target 2 8 Shoot off target 4 74 Attack 61 39 Dangerous Attack 28 52 Possession % 48 * * * Score: 0 - 0 , Corner: 1 - 1 Half</div>`);

test('live detail remains usable when TotalCorner status is In Play without a numeric minute',()=>{
  const parsed=detail('In Play');
  assert.equal(parsed.valid,true);
  assert.equal(parsed.minute,null);
  assert.deepEqual(parsed.score,{home:1,away:1});
  assert.deepEqual(parsed.attacks,{home:74,away:61});
  assert.deepEqual(parsed.dangerousAttack,{home:39,away:28});
  assert.deepEqual(parsed.shotsOn,{home:5,away:2});
  assert.deepEqual(parsed.corners,{home:3,away:2});
});

test('2nd Half is a phase label, not minute 2',()=>{
  const parsed=detail('2nd Half');
  assert.equal(parsed.valid,true);
  assert.equal(parsed.minute,null);
});

test('numeric live status still supplies the detail minute',()=>{
  const parsed=detail("72 '");
  assert.equal(parsed.valid,true);
  assert.equal(parsed.minute,72);
});
