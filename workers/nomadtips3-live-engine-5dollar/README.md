# NOMAD 3.41 + 5DollarFootballAPI

Isolated replacement Worker. Existing `nomadtips3-live-engine` is not modified.

Required secrets:
- `FIVEDOLLAR_API_KEY`
- `ODDS_API_KEY`
- `THE_ODDS_API_KEY`
- `API_FOOTBALL_KEY`

Durable Object binding `ENGINE` is provisioned by `wrangler.jsonc` as a new SQLite-backed `EngineState` namespace.

5Dollar behavior:
- Source id: `source8`
- Bet365 full-match live Asian Handicap
- Calls only when detection is eligible
- 65-second cache
- Maximum 7 per-fixture odds calls per refresh + 1 live-fixture call (8 requests), under Pro 10/min limit
- Missing/429/down => source unavailable only; other price sources continue
- Source 8 is excluded from freshness races because 5Dollar's live AH response does not expose an upstream odds update timestamp
- Existing sources and TotalCorner fallback remain unchanged

The source is stored as six gzip/base64 chunks to keep repository writes manageable. `build.mjs` reconstructs `src/index.js` before Wrangler bundles/deploys the Worker.
