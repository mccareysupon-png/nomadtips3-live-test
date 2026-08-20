# CAR 3.4.1 Source Layer Contract

The Source Monitor is a **read-only, stateless Goaloo adapter**. It is deliberately separate from pricing, detector, signals, persistence, settlement and cron so source failures cannot corrupt engine state.

## Inputs

### Goaloo index
- Primary: `GOALOO_INDEX_PRIMARY`
- Alternate: `GOALOO_INDEX_ALT`
- Provides match id, league, teams, state, score, cards and source market-line hints.
- Includes live, scheduled and finished fixtures; the Engine uses finished fixtures only for final-score settlement.

### Goaloo match detail
- Base: `GOALOO_DETAIL_BASE`
- Loaded only for live matches selected for hydration.
- Provides the in-match statistics consumed later by the detector.

## Output schemas

### `GET /live`
Returns `nomadtips3.live-match.v1` records with:
- source identity and collection time
- canonical Goaloo-backed match id
- league / home / away / kickoff
- live state and minute
- score
- possession
- attacks
- dangerous attacks
- shots
- shots on target
- corners
- yellow / red cards
- Goaloo AH / O-U values as **sourceMarketHints only**
- explicit quality flags and warnings

`sourceMarketHints` are not executable prices and must never be treated as 1xBet market data.

### `GET /fixtures`
Returns lightweight index-backed fixtures with:
- Goaloo match id
- league / teams / kickoff
- status / minute
- score
- red and yellow cards

This endpoint exists so the separate Engine can detect `FT` and settle already-locked records without loading match-detail pages. It does not perform settlement itself.

## Read-only routes

- `GET /health` — Worker process/capability health only; no Goaloo request.
- `GET /config` — phase and capability declaration only.
- `GET /source-health` — Goaloo index probe.
- `GET /fixtures` — current full index snapshot for lifecycle/final scores.
- `GET /live` — fresh Goaloo discovery + live detail hydration + normalization.

No POST route exists in the Source Monitor.

## Safety boundaries

The Source Monitor has no:
- Durable Object
- KV / D1 / R2 state
- cron trigger
- Odds-API.io key
- 1xBet pricing call
- momentum calculation
- detector gate
- signal lock
- history mutation
- settlement
- CAR 3.4 Worker binding or URL

## Failure behavior

- Primary Goaloo index failure attempts the alternate index.
- Index and detail response sizes are bounded.
- Detail fetch failures are isolated per match and surface as warnings instead of failing the entire snapshot.
- Fetch concurrency and maximum hydrated live matches are bounded.
- If both indexes fail, `/source-health`, `/fixtures` and `/live` return clear non-success source responses.

## Runtime acceptance gates

Before the Engine is considered healthy, the deployed Source Monitor must prove:
1. `/health` stays available independently of Goaloo.
2. `/source-health` succeeds with a current check timestamp.
3. `/live.generatedAt` advances and live match state follows Goaloo instead of freezing.
4. `/fixtures.generatedAt` advances and exposes current fixture lifecycle/final scores.
5. Finished matches naturally leave `/live` while remaining observable through `/fixtures` as `FT` when present in the Goaloo index.
6. Quality counters expose incomplete detail data instead of pretending it is complete.
7. No Source request mutates CAR 3.4, CAR 3.5 or CAR 3.4.1 Engine state.

The Engine deployment workflow treats these checks as a prerequisite rather than assuming source availability from committed code.
