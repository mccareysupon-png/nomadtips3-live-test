# STEP 04 — 3.43 Central Hub migration gate

Status: **SHADOW WIRING PASS / PRODUCTION CUTOVER NOT YET AUTHORIZED**

## Completed

### 04A — Real provider probe

- Read-only GitHub Actions probe used the existing `FIVEDOLLAR_API_KEY` secret.
- Compound live request returned 42 live fixtures at the observed probe time.
- Observed rate limit: 40 requests/minute.
- Rate remaining changed 31 -> 30 after one 10-bookmaker Asian Handicap request.
- The sampled fixture (`200162163`) returned all requested referee bookmakers:
  - 1xBet
  - Bet365
  - Macauslot
  - Crown
  - Easybets
  - Vcbet
  - Interwetten
  - 12Bet
  - 18Bet
  - Pinnacle

### 04B — Hub full-market odds bus

Central Hub now has a cached `/odds?fixtureId=<id>` data endpoint for Bet365 full-market odds.

- per-fixture cache: 55 seconds
- concurrent same-fixture requests share one in-flight promise
- preserves raw Bet365 market root required by current 3.43 AH / O-U / 1X2 parsing
- `sourceUpdatedAt` remains null; Hub observation time is never represented as bookmaker-native quote time
- no signal or settlement authority in Hub

### 04C — 3.43 dual-read shadow wiring

Added branch-only modules:

- `workers/nomadtips3-343-auto-engine/src/central-hub-adapter.js`
- `workers/nomadtips3-343-auto-engine/src/central-hub-shadow.js`

3.43 production logic remains direct-5USD authoritative.

Shadow activation requires both:

- `CENTRAL_HUB_MODE=shadow`
- non-empty `CENTRAL_HUB_URL`

Default behavior is OFF. When OFF, tests prove no Hub fetch occurs.

When Shadow is enabled:

- direct 5USD live remains the source used for detector history, candidates and signals
- Hub live is read only for fixture-id comparison telemetry
- direct Bet365 full odds remain the price used for decisions
- Hub full odds are sampled for comparison only
- full-odds shadow comparisons are bounded to at most two fixtures per scan
- Hub errors are caught and stored as telemetry; they do not fail the main scan
- every comparison explicitly reports `authority: DIRECT_5USD` and `usedForSignals: false`

Board telemetry adds `centralHubShadow` without replacing existing provider fields.

## CI gate

Latest Shadow wiring CI validates:

- `src/index.js` syntax
- Central Hub adapter syntax
- Shadow comparator syntax
- live adapter contracts
- full-market adapter contracts
- Shadow default-OFF / zero-fetch rule
- Hub failure isolation
- fixture-id mismatch reporting
- AH / Goal Line / 1X2 price comparison
- no-authority rule

Result: **PASS**.

## Isolation check

Compared branch `work/nomad341-5usd-central-rewire` against `main` after STEP 04C.

No files under the 3.41 production frontend (`nomad-live/`) or 3.41 production engine (`nomad-live-engine/`) are changed by this rewire branch.

The existing 3.43 `src/index.js` change is deliberately narrow: import Shadow helpers, run live comparison after the authoritative direct fetch, run a bounded full-odds comparison after authoritative direct odds fetches, and expose comparison telemetry.

## Remaining yellow gates before real cutover

1. The standalone Central Hub Worker is not deployed yet.
2. `CENTRAL_HUB_MODE` is not enabled in Production.
3. No Production consumer is connected to Hub.
4. A real deployed-Hub shadow observation window is still required before changing authority.
5. Rate telemetry must be watched during that observation window because Shadow temporarily duplicates some reads.

Until those gates pass, do not remove the direct 3.43 provider path.
