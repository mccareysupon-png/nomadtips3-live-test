import assert from 'node:assert/strict';
import {
  ODDSTORM_BOOKMAKERS,
  evaluateOddStormConsensus,
  parseHandicap,
  parseOddStormAsianHtml,
} from '../src/oddstorm-referee.js';

const html = `
<table><tbody>
<tr><td>Unibet</td><td>-0.25</td><td>1.90</td><td>1.95</td></tr>
<tr><td>Stake</td><td>-0.25</td><td>1.88</td><td>1.97</td></tr>
<tr><td>Pinnacle</td><td>-0.25</td><td>1.92</td><td>1.93</td></tr>
<tr><td>Ladbrokes</td><td>-0.25</td><td>1.91</td><td>1.94</td></tr>
<tr><td>BWin</td><td>-0.25</td><td>1.89</td><td>1.96</td></tr>
<tr><td>BetWay</td><td>-0.25</td><td>1.93</td><td>1.92</td></tr>
<tr><td>Other Book</td><td>-0.25</td><td>1.20</td><td>4.20</td></tr>
</tbody></table>`;

assert.equal(parseHandicap('0/0.5'), 0.25);
assert.equal(parseHandicap('-0.5/1'), -0.75);
assert.equal(parseHandicap('+0.5/1'), 0.75);

const rows = parseOddStormAsianHtml(html);
assert.equal(rows.length, 6);
assert.deepEqual(rows.map(row => row.bookmaker), ODDSTORM_BOOKMAKERS);

const pass = evaluateOddStormConsensus(rows, { line: -0.25, homeOdds: 1.94, awayOdds: 1.92 }, { minBooks: 3, maxOddsDeviation: 0.45 });
assert.equal(pass.status, 'READY');
assert.equal(pass.decision, 'PASS');
assert.equal(pass.count, 6);
assert.equal(pass.medianHomeOdds, 1.905);
assert.equal(pass.medianAwayOdds, 1.945);

const reject = evaluateOddStormConsensus(rows, { line: -0.25, homeOdds: 2.55, awayOdds: 1.92 }, { minBooks: 3, maxOddsDeviation: 0.45 });
assert.equal(reject.status, 'READY');
assert.equal(reject.decision, 'REJECT');
assert.equal(reject.reason, 'primary_price_outside_oddstorm_consensus');

const insufficient = evaluateOddStormConsensus(rows.slice(0, 2), { line: -0.25, homeOdds: 1.90, awayOdds: 1.95 }, { minBooks: 3, maxOddsDeviation: 0.45 });
assert.equal(insufficient.status, 'INSUFFICIENT');
assert.equal(insufficient.decision, 'SKIP');

const differentLine = evaluateOddStormConsensus(rows, { line: 0, homeOdds: 1.90, awayOdds: 1.95 }, { minBooks: 3, maxOddsDeviation: 0.45 });
assert.equal(differentLine.status, 'INSUFFICIENT');
assert.equal(differentLine.decision, 'SKIP');

console.log('OddStorm referee parser + consensus tests PASS');
