# NOMAD 3.41 · External S8 · 5DollarFootballAPI / Bet365

This Worker is now a **standalone external price adapter for SOURCE 8 only**.
It does not replace NOMAD 3.41 and it does not own S1-S7, detector settings, statistics, settlement, or the production Durable Object.

## Isolation contract

- Existing production Worker `nomadtips3-live-engine` stays untouched.
- Existing S1-S7 paths stay untouched, including the Nowgoal scraping family and TotalCorner fallback.
- S8 can fail, timeout, hit 429, miss a fixture, or miss live AH without stopping S1-S7.
- The old full-worker source chunks under `source-parts/` and `build.mjs` are retained as rollback/archive material but are no longer part of this Worker's runtime build.

## Required secret

- `FIVEDOLLAR_API_KEY`

Optional hardening secret:

- `S8_ADAPTER_TOKEN` — when configured, callers must send it in `x-s8-adapter-token`.

## S8 contract

- Source id: `source8`
- Position: `8`
- Provider: `5DollarFootballAPI`
- Bookmaker label: `Bet365`
- Market: Full Match **LIVE Asian Handicap** only
- Reads only `asian_handicap.inplay`; opening/closing prices are not substituted.
- Live fixture cache: 65 seconds
- Per-fixture odds cache: 65 seconds
- Maximum batch: 7 matches
- Fresh worst-case batch: 1 live-fixture request + up to 7 direct odds requests
- Internal rolling budget: 9 upstream requests / 60 seconds, leaving one request below the Pro 10/min ceiling
- Mapping is fail-closed and rejects low-confidence or ambiguous team matches.
- The current 5Dollar live odds response does not expose an upstream update timestamp. S8 marks its timestamp as `adapter_observed_at`; the NOMAD 3.41 thin port must exclude S8 from freshness races.

## Endpoints

- `GET /health` — no upstream request; reports adapter/key/cache/rate state.
- `GET /probe` — checks the live-fixture path.
- `POST /quotes` — accepts up to 7 detector-eligible matches and returns standardized S8 markets.

Example request shape:

```json
{
  "matches": [
    {
      "clientId": "nomad-match-id",
      "home": "Home Team",
      "away": "Away Team",
      "league": "League",
      "score": {"home": 1, "away": 0}
    }
  ]
}
```

The production NOMAD 3.41 Worker is not connected to this adapter until the separate thin-port change is explicitly approved and deployed.
