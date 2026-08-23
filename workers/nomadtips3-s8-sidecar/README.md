# NOMAD 3.41 — S8 External Sidecar Canary

Purpose: add `source8 = 5DollarFootballAPI · Bet365` without moving or modifying S1–S7.

This Worker is intentionally isolated. It has no Durable Object, no statistics ledger, no settings endpoint, and no dependency on legacy source secrets. It needs only:

- `FIVEDOLLAR_API_KEY`

Endpoints:

- `GET /health`
- `GET /quote?home=<HOME>&away=<AWAY>`

Output contract for a successful live Asian Handicap quote:

```json
{
  "source": "5DollarFootballAPI",
  "sourceId": "source8",
  "position": 8,
  "bookmaker": "Bet365",
  "market": "FULL MATCH LIVE AH",
  "side": "HOME",
  "status": "PASS",
  "line": -0.5,
  "odds": 1.88,
  "freshnessComparable": false
}
```

Fail-open rule: timeout, 429, missing fixture, missing live AH, or missing key returns S8 `UNAVAILABLE`. It does not alter S1–S7.

Safety boundary for this canary:

- Do not point `nomad-live/runtime.js` at this Worker.
- Do not change `signal-retention.js`.
- Do not change `live-entry-score.js`.
- Do not change Settings or Statistics.
- Do not merge into the legacy Worker until parity/canary tests prove S1–S7 remain untouched.

The 5Dollar live fixture list is cached for 60 seconds and each team-pair quote for 65 seconds. A quote uses at most one cached live-list request plus one per-fixture Bet365 `market=asian` odds request.
