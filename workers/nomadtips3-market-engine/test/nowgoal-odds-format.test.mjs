import assert from 'node:assert/strict';
import { parseNowgoalGoalRows, parseNowgoalOneXtwoTotals } from '../src/nowgoal.js';

const parse = raw => {
  const rows = parseNowgoalGoalRows(`<c><match><m>${raw}</m></match></c>`);
  return parseNowgoalOneXtwoTotals(rows.get('3003850'));
};

{
  const parsed = parse('3003850,17348417,-1,0.925,0.925,155043777,1.62,4.10,5.20,9001,2.5,0.925,0.925');
  assert.deepEqual(parsed.oneXtwo, { home: 1.62, draw: 4.10, away: 5.20 });
  assert.deepEqual(parsed.totals, [{ line: 2.5, overOdds: 1.925, underOdds: 1.925 }]);
}

{
  const parsed = parse('3003850,17348417,-0.5,1.55,1.60,155043777,1.90,3.40,4.20,9001,3.5,1.55,1.60');
  assert.deepEqual(parsed.totals, [{ line: 3.5, overOdds: 2.55, underOdds: 2.60 }]);
}

console.log('3.42 Goaloo-style HK odds normalize to standard decimal correctly');
