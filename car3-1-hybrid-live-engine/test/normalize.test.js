import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCoreEngine3Stats, normalizeLiveMatch } from '../src/normalize.js';

test('normalizes a complete public live row without inventing IDs', () => {
  const match = normalizeLiveMatch({
    sourceMatchId: 'shadow-1',
    league: 'Test League',
    minute: 67,
    status: '2H',
    home: 'Home FC',
    away: 'Away FC',
    score: { home: 1, away: 0 },
    stats: {
      possession: { home: '55%', away: '45%' },
      attacks: { home: 100, away: 80 },
      dangerous_attacks: { home: 60, away: 40 },
      shots: { home: 12, away: 7 },
      shots_on_target: { home: 5, away: 2 },
      corners: { home: 6, away: 3 },
      red_cards: { home: 0, away: 0 }
    },
    odds: { oneXtwo: { home: 1.8, draw: 3.4, away: 5.0 } }
  }, 'PUBLIC_SHADOW');

  assert.equal(match.source, 'PUBLIC_SHADOW');
  assert.equal(match.stats.possession.home, 55);
  assert.equal(match.stats.shots_on_target.away, 2);
  assert.equal(match.canonicalMatchId, null);
  assert.equal(hasCoreEngine3Stats(match), true);
});

test('rejects a row with no source identity', () => {
  assert.throws(() => normalizeLiveMatch({ home: 'A', away: 'B' }, 'PUBLIC_SHADOW'), /sourceMatchId is required/);
});

test('detects missing Engine 3 core stats', () => {
  const match = normalizeLiveMatch({
    sourceMatchId: 'shadow-2',
    home: 'A',
    away: 'B',
    stats: { shots: { home: 1, away: 2 } }
  }, 'PUBLIC_SHADOW');
  assert.equal(hasCoreEngine3Stats(match), false);
});
