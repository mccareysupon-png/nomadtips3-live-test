# STEP 04 — 3.43 Central Hub migration gate

Status: **GREEN FOR SHADOW DEPLOYMENT / PRODUCTION AUTHORITY CUTOVER NOT YET AUTHORIZED**

## Completed

### 04A — Real provider probe

- Read-only GitHub Actions probe used the existing `FIVEDOLLAR_API_KEY` secret.
- Compound live request returned 42 live fixtures at the first observed probe time.
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

Central Hub has a cached `/odds?fixtureId=<id>` data endpoint for Bet365 full-market odds.

- per-fixture cache: 55 seconds
- concurrent same-fixture requests share one in-flight promise
- preserves raw Bet365 market root required by current 3.43 AH / O-U / 1X2 parsing
- `sourceUpdatedAt` remains null; Hub observation time is never represented as bookmaker-native quote time
- no signal or settlement authority in Hub

Hub full-market contract CI: **PASS**.

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

3.43 Shadow wiring CI: **PASS**.

### 04D — Ephemeral real-Hub parity gate

Because production secret binding for a brand-new Worker was not performed through the current connector path, the actual Hub Worker code was started ephemerally in GitHub Actions with the existing provider secret injected only for that CI process.

Observed runtime checks:

- Hub `/health`: **PASS**
- unauthenticated `/live`: **401 PASS**
- Hub live fixtures: **38**
- direct 5USD live fixtures in the same gate: **38**
- shared fixture IDs: **38 / 38**
- fixture-ID parity: **100%**
- sampled team identity checks: **PASS**

The combined CI run later stopped on a shell heredoc syntax error in the market-test harness after the 38/38 parity result had already passed. This is a test-harness failure, not a Hub live-data mismatch. A file-based validator was added at `rewire-341-5usd/validate-hub-gate.mjs` to remove that class of harness error.

## Evidence summary

| Gate | Result |
|---|---|
| Direct 5USD provider availability | GREEN |
| Observed provider rate limit 40/min | GREEN |
| 10-book referee availability | GREEN |
| Hub syntax / contract CI | GREEN |
| Hub Bet365 full-market odds contract | GREEN |
| 3.43 Hub adapter contract | GREEN |
| 3.43 Shadow default-OFF / zero-fetch | GREEN |
| Hub failure isolation / no-authority | GREEN |
| Ephemeral Hub health + token enforcement | GREEN |
| Ephemeral Hub live parity vs direct | GREEN — 38/38 (100%) |
| Standalone Hub production deployment | NOT DONE |
| Production 3.43 Shadow observation | NOT DONE |
| Hub authority cutover | NOT AUTHORIZED |

## Isolation check

Latest comparison of branch `work/nomad341-5usd-central-rewire` against `main`:

- branch is ahead only; no main divergence at the check time
- no files under the 3.41 production frontend (`nomad-live/`) are changed
- no files under the 3.41 production engine (`nomad-live-engine/`) are changed
- existing 3.43 `src/index.js` change remains deliberately narrow: import Shadow helpers, compare Hub after authoritative direct reads, and expose passive telemetry

## GO / NO-GO decision

**GO: deploy Central Hub for Shadow observation.**

The data path, adapter, isolation behavior, authorization behavior and live fixture identity have enough independent evidence to proceed to a production Shadow deployment without changing signal authority.

**NO-GO: do not switch 3.43 authority to Central Hub yet.**

Before authority cutover, all of the following are still mandatory:

1. Deploy standalone Central Hub with provider credentials bound through an approved secret-management path.
2. Enable 3.43 `CENTRAL_HUB_MODE=shadow` only; keep direct 5USD authoritative.
3. Observe several real production scan cycles.
4. Confirm live fixture, score/minute/stats/events and sampled full-market odds comparison telemetry is stable.
5. Confirm provider rate telemetry stays safely below the observed 40/min limit.
6. Only then authorize an authority cutover in a separate change with its own rollback point.

Until those steps pass, do not remove or weaken the direct 3.43 provider path.
