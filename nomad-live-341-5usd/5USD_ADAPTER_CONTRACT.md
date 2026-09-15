# 5USD Adapter Contract for 3.41 UI Clone

The UI must never call the legacy 3.41 engine. A 5USD adapter is injected as `window.NOMAD_5USD_ADAPTER` and must expose three async methods:

```js
window.NOMAD_5USD_ADAPTER = {
  async getFeed() {},
  async getStatistics() {},
  async getHealth() {}
};
```

## getFeed()

Returns a normalized object:

```js
{
  updatedAt: ISO_DATE,
  counts: { live, watching, near, signal },
  matches: [
    {
      id,
      league,
      home,
      away,
      minute,
      score: { home, away },
      side: 'home' | 'away',
      state: 'WATCHING' | 'NEAR SIGNAL' | 'SIGNAL',
      passed,
      total,
      hunger: { passedCount, total },
      rolling: {
        windowMinutes,
        recent: {
          homePressure,
          awayPressure,
          tempo,
          delta: {
            shotsOn: { home, away },
            shotsOff: { home, away },
            corners: { home, away }
          }
        },
        previous: { homePressure, awayPressure, tempo },
        sides: { home: { pressureShare }, away: { pressureShare } }
      },
      stats: {
        attacks: { home, away },
        dangerousAttack: { home, away },
        shotsOff: { home, away },
        shotsOn: { home, away },
        corners: { home, away },
        possession: { home, away }
      },
      checks: { minute, score, hunger, evidence, market },
      evidence: { required },
      priceSources: [
        { position, source, status, bookmaker, line, odds, priceAgeSeconds }
      ],
      selectedPrice: { source, bookmaker, line, odds, priceAgeSeconds, side } | null,
      signalStatus: 'LOCKED' | null,
      signalLock: {
        status: 'LOCKED', selection, minute,
        entryScore: { home, away }, line, odds,
        oddsSource, bookmaker, lockedAt
      } | null
    }
  ]
}
```

## getStatistics()

Returns `{ updatedAt, rows }`. Each row contains `time`, `match`, `condition`, `pick`, `ah`, `odds`, `source`, `entry`, `final`, `result`, and `pl`.

## getHealth()

Returns `{ state, environment, cycle, lastCycle, lastSuccess, configVersion, matches, signals, lastError, sources }`.

## Integration rule

5DollarFootballAPI-specific response shapes, bookmaker ids, status codes, request cadence, retry logic, rate-limit handling, and secrets belong inside the adapter/data service layer only. The UI consumes only this normalized contract.

The current `data-core.js` falls back to mock data when `window.NOMAD_5USD_ADAPTER` is not installed, allowing UI development and visual regression testing with zero live API requests.
