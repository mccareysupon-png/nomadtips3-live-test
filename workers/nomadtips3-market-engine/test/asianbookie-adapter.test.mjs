import assert from 'node:assert/strict';
import { fetchAsianBookiePayload, asianBookieConfig } from '../src/asianbookie.js';
import { normalizeProviderPayload } from '../src/normalize.js';

const originalFetch = globalThis.fetch;
const now = Date.now();

const matchPayload = {
  data: {
    matches: [
      {
        matchId: 1001,
        homeTeam: 'Alpha FC',
        awayTeam: 'Beta United',
        leagueName: 'Test League',
        minute: 61,
        homeScore: 1,
        awayScore: 0,
      },
    ],
  },
};

const oddsPayload = {
  data: {
    odds: [
      {
        matchId: 1001,
        bookmakers: [
          {
            bookmaker: 'FUN88',
            handicap: -0.5,
            homeOdds: 1.91,
            awayOdds: 1.99,
            home1x2: 1.82,
            draw1x2: 3.45,
            away1x2: 4.25,
            total: 2.5,
            overOdds: 1.95,
            underOdds: 1.93,
            updatedAt: now,
          },
          {
            bookmaker: 'M88',
            handicap: -0.5,
            homeOdds: 1.90,
            awayOdds: 2.00,
            home1x2: 1.84,
            draw1x2: 3.40,
            away1x2: 4.20,
            total: 2.5,
            overOdds: 1.96,
            underOdds: 1.92,
            updatedAt: now,
          },
        ],
      },
    ],
  },
};

globalThis.fetch = async input => {
  const url = String(input);
  const body = url.includes('tipsterMatchOdds') ? oddsPayload : matchPayload;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

try {
  const cfg = asianBookieConfig({
    ASIANBOOKIE_MATCH_CACHE_MS: '60000',
    ASIANBOOKIE_ODDS_CACHE_MS: '7500',
  });
  assert.equal(cfg.matchCacheMs, 60000);
  assert.equal(cfg.oddsCacheMs, 7500);

  const raw = await fetchAsianBookiePayload({
    ASIANBOOKIE_BASE_URL: 'https://beta.asianbookie.org',
    ASIANBOOKIE_MATCH_CACHE_MS: '60000',
    ASIANBOOKIE_ODDS_CACHE_MS: '7500',
    MARKET_PROVIDER_TIMEOUT_MS: '6000',
  });

  assert.equal(raw.matches.length, 1);
  assert.equal(raw.matches[0].matchKey, '1001');
  assert.equal(raw.matches[0].home, 'Alpha FC');
  assert.equal(raw.matches[0].away, 'Beta United');
  assert.deepEqual(raw.matches[0].bookmakers.map(x => x.name).sort(), ['FUN88', 'M88']);
  assert.equal(raw.sourceDiagnostics.joinedMatches, 1);

  const normalized = normalizeProviderPayload(raw, {
    providerName: 'AsianBookie Tipster',
    maxAgeMs: 30000,
    now,
  });
  assert.equal(normalized.matches.length, 1);
  assert.equal(normalized.matches[0].refereesOnline, 2);
  assert.equal(normalized.matches[0].main.ah.line, -0.5);
  assert.equal(normalized.matches[0].main.totals.line, 2.5);
  assert.equal(normalized.matches[0].bookmakers[0].markets.oneXtwo !== null, true);

  console.log('asianbookie adapter test: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
