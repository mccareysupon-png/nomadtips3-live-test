# NOMAD Snapshot Adapter Contract for 3.41 UI Clone

The 3.41 clean-clone browser must **never call 5DollarFootballAPI directly**.

Provider traffic belongs exclusively to the server-side Central Provider Poller defined in `5USD_ARCHITECTURE_LOCK.md`.

The browser receives an already-published NOMAD snapshot and injects a UI adapter as `window.NOMAD_5USD_ADAPTER`.

```js
window.NOMAD_5USD_ADAPTER = {
  async getFeed() {},
  async getStatistics() {},
  async getHealth() {}
};
```

A prepared, non-auto-installed implementation lives in `fiveusd-snapshot-adapter.js`.

## Provider boundary

Allowed:

```text
Central server/Worker -> 5USD full-board request -> NOMAD snapshot/cache -> Browser adapter -> UI
```

Forbidden:

```text
Browser -> 5USD
Match card -> 5USD
Price referee -> 5USD
Derived engine -> 5USD
Statistics page -> 5USD
Health page -> 5USD
```

Viewer clicks and page interactions must add **zero** 5USD requests.

## getFeed()

Returns a normalized object:

```js
{
  updatedAt: ISO_DATE,
  cycleId,
  counts: { live, watching, near, candidate, signal },
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
      candidate,
      passed,
      total,
      hunger: { passedCount, total, required, passed },
      rolling: {
        available,
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
        sides: {
          home: { pressureShare },
          away: { pressureShare }
        }
      },
      stats: {
        attacks: { home, away },
        dangerousAttack: { home, away },
        shotsOff: { home, away },
        shotsOn: { home, away },
        corners: { home, away },
        possession: { home, away }
      },
      checks,
      evidence,
      priceSources,
      selectedPrice,
      signalStatus,
      signalLock
    }
  ]
}
```

## getStatistics()

Returns `{ updatedAt, rows }`.

Each row contains `time`, `match`, `condition`, `pick`, `ah`, `odds`, `source`, `entry`, `final`, `result`, and `pl`.

Statistics must come from NOMAD's stored signal/settlement ledger. Opening the Statistics page must not create a provider request.

## getHealth()

Returns:

```js
{
  state,
  environment,
  cycle,
  lastCycle,
  lastSuccess,
  configVersion,
  matches,
  signals,
  lastError,
  sources
}
```

Health should expose provider-request telemetry from the central runtime, including the current cycle request count, but must not probe 5USD directly from the browser.

## Full-board provider cycle

The central provider layer owns the routine request:

```text
GET /v1/fixtures?status=live&include=odds,events,stats&per_page=500
```

The intended invariant is:

```text
1 cycle = 1 provider request
```

All score, minute, stats, events, odds and bookmaker data consumed by NOMAD for that cycle come from this full-board snapshot.

## Integration rule

5DollarFootballAPI response shapes, bookmaker ids, status codes, polling cadence, retries, rate-limit handling and secrets stay server-side.

The browser consumes only the normalized NOMAD snapshot contract.

The current `data-core.js` falls back to mock data when `window.NOMAD_5USD_ADAPTER` is not installed. This keeps UI development and visual regression testing at zero live provider requests until the central poller is ready.
