from pathlib import Path

source = Path('cloudflare-worker/src/paper-db-side.js')
text = source.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global text
    if old not in text:
        raise SystemExit(f'Patch anchor missing: {label}')
    text = text.replace(old, new, 1)


if "export function storedFixtureFromTrade" not in text:
    normalize_anchor = """function normalizeFixture(item) {
  const fixture = item?.fixture || {};
  const goals = item?.goals || {};
  const score = item?.score || {};
  return {
    fixtureId: integer(fixture.id),
    status: String(fixture?.status?.short || '').toUpperCase(),
    homeScore: integer(goals.home),
    awayScore: integer(goals.away),
    fulltimeHome: integer(score?.fulltime?.home),
    fulltimeAway: integer(score?.fulltime?.away)
  };
}

function finalScore(result) {
"""
    normalize_replacement = """function normalizeFixture(item) {
  const fixture = item?.fixture || {};
  const goals = item?.goals || {};
  const score = item?.score || {};
  return {
    fixtureId: integer(fixture.id),
    status: String(fixture?.status?.short || '').toUpperCase(),
    homeScore: integer(goals.home),
    awayScore: integer(goals.away),
    fulltimeHome: integer(score?.fulltime?.home),
    fulltimeAway: integer(score?.fulltime?.away)
  };
}

export function storedFixtureFromTrade(trade) {
  const fixtureId = integer(trade?.fixture_id);
  const status = String(trade?.final_status || '').toUpperCase();
  const homeScore = integer(trade?.final_actual_home_score);
  const awayScore = integer(trade?.final_actual_away_score);
  if (!fixtureId || !TERMINAL.has(status) || homeScore === null || awayScore === null) return null;
  return {
    fixtureId,
    status,
    homeScore,
    awayScore,
    fulltimeHome: homeScore,
    fulltimeAway: awayScore
  };
}

function finalScore(result) {
"""
    replace_once(normalize_anchor, normalize_replacement, 'stored FT helper')

    fetch_anchor = """  const fixtureMap = new Map();
  const warnings = [];
  const ids = [...new Set(candidates.map(trade => integer(trade.fixture_id)).filter(Number.isInteger))];
  for (let index = 0; index < ids.length; index += 20) {
    const group = ids.slice(index, index + 20);
    try {
      const payload = await apiFetch(`/fixtures?ids=${group.join('-')}`, env);
      for (const item of Array.isArray(payload?.response) ? payload.response : []) {
        const fixture = normalizeFixture(item);
        if (fixture.fixtureId) fixtureMap.set(fixture.fixtureId, fixture);
      }
    } catch (error) {
      warnings.push(error?.message || 'Fixture result request failed');
    }
  }
"""
    fetch_replacement = """  const fixtureMap = new Map();
  const warnings = [];
  const idsToFetch = [];
  for (const trade of candidates) {
    const storedFixture = storedFixtureFromTrade(trade);
    if (storedFixture) {
      fixtureMap.set(storedFixture.fixtureId, storedFixture);
      continue;
    }
    const fixtureId = integer(trade.fixture_id);
    if (fixtureId) idsToFetch.push(fixtureId);
  }

  const ids = [...new Set(idsToFetch)];
  for (let index = 0; index < ids.length; index += 20) {
    const group = ids.slice(index, index + 20);
    try {
      const payload = await apiFetch(`/fixtures?ids=${group.join('-')}`, env);
      for (const item of Array.isArray(payload?.response) ? payload.response : []) {
        const fixture = normalizeFixture(item);
        if (fixture.fixtureId) fixtureMap.set(fixture.fixtureId, fixture);
      }
    } catch (error) {
      warnings.push(error?.message || 'Fixture result request failed');
    }
  }
"""
    replace_once(fetch_anchor, fetch_replacement, 'stored FT reconciliation path')

    source.write_text(text, encoding='utf-8')

# Keep a permanent regression test for both the AH math and stored-FT reconciliation path.
test_path = Path('scripts/test-car3-full-match-settlement.mjs')
test_path.write_text(
    """import assert from 'node:assert/strict';
import { settleAsian, storedFixtureFromTrade } from '../cloudflare-worker/src/paper-db-side.js';

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

const stored = storedFixtureFromTrade({
  fixture_id: 987654,
  final_status: 'FT',
  final_actual_home_score: 6,
  final_actual_away_score: 2
});
assert.deepEqual(stored, {
  fixtureId: 987654,
  status: 'FT',
  homeScore: 6,
  awayScore: 2,
  fulltimeHome: 6,
  fulltimeAway: 2
});
assert.equal(storedFixtureFromTrade({ fixture_id: 987654, final_status: 'FT' }), null);

console.log('CAR 3 FULL_MATCH_AH_V1 regression tests passed');
""",
    encoding='utf-8',
)

print('CAR 3 stored-FT settlement reconciliation patch prepared successfully')
