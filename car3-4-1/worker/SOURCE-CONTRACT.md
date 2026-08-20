# CAR 3.4.1 Source Layer Contract

This phase proves the live football data path before any pricing, detector, signal, persistence, settlement or cron logic is allowed to connect.

## Inputs

### Goaloo live index
- Primary: `GOALOO_INDEX_PRIMARY`
- Alternate: `GOALOO_INDEX_ALT`
- Provides match id, league, teams, state, score, cards and market-line hints.

### Goaloo match detail
- Base: `GOALOO_DETAIL_BASE`
- Provides the in-match statistics used later by the detector.

## Output schema

`GET /live` returns `nomadtips3.live-match.v1` records with:
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

## Read-only routes

- `GET /health` — Worker process/capability health only; no Goaloo request.
- `GET /config` — phase and capability declaration only.
- `GET /source-health` — Goaloo index probe.
- `GET /live` — fresh Goaloo discovery + detail hydration + normalization.

No POST route exists in this phase.

## Safety boundaries

The source-monitor Worker has no:
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
- Index response size is bounded.
- Detail response size is bounded.
- Detail fetch failures are isolated per match and surface as warnings instead of failing the whole snapshot.
- Fetch concurrency and maximum matches per request are bounded.
- If both live indexes fail, `/source-health` and `/live` return a clear non-200 source failure.

## Acceptance gates before Phase 3

Do not connect 1xBet or the detector until all of the following are proven on the deployed **new** Worker:
1. `/health` stays available independently of Goaloo.
2. `/source-health` succeeds repeatedly with current timestamps.
3. `/live.generatedAt` advances across repeated checks.
4. Live match ids / scores / minutes change with the source rather than freezing.
5. Finished matches naturally disappear from the live set when Goaloo marks them no longer live.
6. Quality counters expose incomplete detail data instead of pretending the data is complete.
7. No request to this Worker changes CAR 3.4 or Production state.

Only after these gates pass may Phase 3 add the independent 1xBet real-market adapter.
