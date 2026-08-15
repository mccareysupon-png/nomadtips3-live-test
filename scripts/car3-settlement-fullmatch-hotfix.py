from pathlib import Path

path = Path('cloudflare-worker/src/paper-db-side.js')
text = path.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'Patch anchor missing: {label}')
    text = text.replace(old, new, 1)


replace_once(
    "const STAKE_DEFAULT = 100;\n",
    "const STAKE_DEFAULT = 100;\nconst SETTLEMENT_RULESET = 'FULL_MATCH_AH_V1';\n",
    'ruleset marker',
)
replace_once(
    "function settleAsian(postGoalDifference, line, odds, stake) {",
    "export function settleAsian(goalDifference, line, odds, stake) {",
    'settleAsian export/argument',
)
replace_once(
    "    const adjusted = postGoalDifference + part;",
    "    const adjusted = goalDifference + part;",
    'full-match goal difference variable',
)
replace_once(
    "  const settled = settleAsian(postSelected - postOpponent, number(trade.ah_line), number(trade.ah_odds), stake);",
    "  const settled = settleAsian(finalSelected - finalOpponent, number(trade.ah_line), number(trade.ah_odds), stake);",
    'FT settlement basis',
)
replace_once(
    "    splitLines: settled.splitLines, settledAt: Date.now(), note: 'Settled automatically by selected-team perspective'",
    "    splitLines: settled.splitLines, settledAt: Date.now(), note: `Settled automatically · ${SETTLEMENT_RULESET} · FT ${score.home}-${score.away}`",
    'settlement audit note',
)
replace_once(
    "      profit_units = ?, returned_units = ?, split_lines = ?, settled_at = ?, note = ?, updated_at = ?",
    "      profit_units = ?, returned_units = ?, split_lines = ?, settled_at = COALESCE(settled_at, ?), note = ?, updated_at = ?",
    'preserve original settlement timestamp during reconcile',
)
replace_once(
    "    WHERE trade_key = ? AND status = 'PENDING'",
    "    WHERE trade_key = ?",
    'allow one-time correction of legacy settled rows',
)
replace_once(
    "  const pendingQuery = await env.DB.prepare(`\n    SELECT * FROM paper_trades_side WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 500\n  `).all();\n  const pending = pendingQuery.results || [];\n  if (!pending.length) return { pending: 0, settled: 0, checked: 0, warnings: [] };\n",
    "  const candidateQuery = await env.DB.prepare(`\n    SELECT * FROM paper_trades_side\n    WHERE status = 'PENDING'\n       OR (status = 'SETTLED' AND note NOT LIKE ?)\n    ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at ASC\n    LIMIT 500\n  `).bind(`%${SETTLEMENT_RULESET}%`).all();\n  const candidates = candidateQuery.results || [];\n  if (!candidates.length) return { pending: 0, reconciled: 0, settled: 0, checked: 0, warnings: [] };\n  const pendingCount = candidates.filter(trade => String(trade.status || '').toUpperCase() === 'PENDING').length;\n  const reconciledCount = candidates.length - pendingCount;\n",
    'pending plus legacy reconcile query',
)
replace_once(
    "  const ids = [...new Set(pending.map(trade => integer(trade.fixture_id)).filter(Number.isInteger))];",
    "  const ids = [...new Set(candidates.map(trade => integer(trade.fixture_id)).filter(Number.isInteger))];",
    'candidate fixture ids',
)
replace_once(
    "  for (const trade of pending) {",
    "  for (const trade of candidates) {",
    'candidate settlement loop',
)
replace_once(
    "  return { pending: pending.length, settled: updates.length, checked: fixtureMap.size, warnings: warnings.slice(0, 20) };",
    "  return { pending: pendingCount, reconciled: reconciledCount, settled: updates.length, checked: fixtureMap.size, warnings: warnings.slice(0, 20) };",
    'settlement result counters',
)

path.write_text(text, encoding='utf-8')

test_path = Path('scripts/test-car3-full-match-settlement.mjs')
test_path.write_text(
    """import assert from 'node:assert/strict';
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
""",
    encoding='utf-8',
)

workflow = Path('.github/workflows/deploy-cloudflare-worker.yml')
wf = workflow.read_text(encoding='utf-8')
anchor = "      - name: Deploy nomadtips3-test-api\n"
test_step = "      - name: Run CAR 3 full-match AH settlement regression test\n        run: node scripts/test-car3-full-match-settlement.mjs\n\n"
if test_step not in wf:
    if anchor not in wf:
        raise SystemExit('Deploy workflow anchor missing')
    wf = wf.replace(anchor, test_step + anchor, 1)
    workflow.write_text(wf, encoding='utf-8')

print('CAR 3 settlement source patch prepared successfully')
