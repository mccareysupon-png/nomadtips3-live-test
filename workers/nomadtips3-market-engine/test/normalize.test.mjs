import assert from 'node:assert/strict';
import { normalizeProviderPayload, chooseMainLine, bookmakerWeight } from '../src/normalize.js';

const now = 1_800_000_000_000;
const payload = {
  provider: 'fixture-feed',
  observedAt: now,
  matches: [{
    id: 'm1', home: 'Alpha FC', away: 'Beta United', league: 'Test League', minute: 67, score: [1, 0],
    bookmakers: [
      { name: 'Pinnacle', observedAt: now - 1000, markets: { ah: [{ line: -0.5, homeOdds: 1.82, awayOdds: 2.04 }], oneXtwo: { home: 1.72, draw: 4.1, away: 5.8 }, totals: [{ line: 2.5, overOdds: 1.84, underOdds: 2.02 }] } },
      { name: 'Bet365', observedAt: now - 1500, markets: { ah: [{ line: -0.5, homeOdds: 1.85, awayOdds: 2.01 }], oneXtwo: { home: 1.75, draw: 4.0, away: 5.6 }, totals: [{ line: 2.5, overOdds: 1.86, underOdds: 2.0 }] } },
      { name: 'SBOBET', observedAt: now - 2000, markets: { ah: [{ line: -0.5, homeOdds: 1.83, awayOdds: 2.03 }], oneXtwo: { home: 1.74, draw: 4.05, away: 5.7 }, totals: [{ line: 2.5, overOdds: 1.85, underOdds: 2.01 }] } },
      { name: 'Unibet', observedAt: now - 2500, markets: { ah: [{ line: -0.25, homeOdds: 1.70, awayOdds: 2.20 }], oneXtwo: { home: 1.76, draw: 4.0, away: 5.5 }, totals: [{ line: 3.0, overOdds: 2.05, underOdds: 1.78 }] } },
      { name: 'OldBook', observedAt: now - 60_000, markets: { ah: [{ line: -1, homeOdds: 1.5, awayOdds: 2.5 }] } }
    ]
  }]
};

const normalized = normalizeProviderPayload(payload, { now, providerName: 'authorized-fixture', maxAgeMs: 30_000 });
assert.equal(normalized.version, 'market-v1');
assert.equal(normalized.matches.length, 1);
const match = normalized.matches[0];
assert.equal(match.bookmakers.length, 4, 'stale bookmaker must be removed');
assert.equal(match.main.ah.line, -0.5, 'AUTO MAIN LINE should favor weighted coverage');
assert.equal(match.main.totals.line, 2.5);
assert.equal(match.consensus.ah.side, 'HOME');
assert.equal(match.consensus.ah.strength, 'STRONG');
assert.equal(match.consensus.totals.side, 'OVER');
assert.equal(match.consensus.oneXtwo.side, 'HOME');
assert.ok(bookmakerWeight('Pinnacle') > bookmakerWeight('Unibet'));

const line = chooseMainLine(match.bookmakers, 'ah');
assert.equal(line, -0.5);

const missingTeams = normalizeProviderPayload({ observedAt: now, matches: [{ bookmakers: [] }] }, { now });
assert.equal(missingTeams.matches.length, 0, 'ambiguous/missing fixture identity must fail closed');

console.log('market normalizer tests: ok');
