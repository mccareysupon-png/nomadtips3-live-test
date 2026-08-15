import assert from 'node:assert/strict';
import { settleAsian } from '../cloudflare-worker/src/paper-db-side.js';

function check(name, difference, line, odds, stake, expectedSettlement, expectedProfit) {
  const result = settleAsian(difference, line, odds, stake);
  assert.equal(result.settlement, expectedSettlement, name);
  assert.equal(result.profitUnits, expectedProfit, `${name} profit`);
  return result;
}

const target = check(
  'FT 6-2, selected AWAY +3.25 must be FULL LOSS',
  2 - 6,
  3.25,
  2.025,
  100,
  'FULL LOSS',
  -100
);
assert.deepEqual(target.splitLines, [3, 3.5]);
assert.equal(target.result, 'INCORRECT');
assert.equal(target.returnedUnits, 0);

check('lose by 3 at +3.25 = HALF WIN', -3, 3.25, 2.0, 100, 'HALF WIN', 50);
check('lose by 3 at +3.0 = PUSH', -3, 3.0, 2.0, 100, 'PUSH', 0);
check('draw at -0.25 = HALF LOSS', 0, -0.25, 2.0, 100, 'HALF LOSS', -50);
check('lose by 1 at +0.75 = HALF LOSS', -1, 0.75, 2.0, 100, 'HALF LOSS', -50);
check('win by 1 at 0 = FULL WIN', 1, 0, 2.0, 100, 'FULL WIN', 100);

// Old post-entry interpretation for the reported example would incorrectly be FULL WIN.
assert.equal(settleAsian(-1, 3.25, 2.025, 100).settlement, 'FULL WIN');

console.log('CAR 3 FULL_MATCH_AH_V1 regression tests passed');
