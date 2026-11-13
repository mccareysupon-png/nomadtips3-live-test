# BALL46 — GPT Work PC handoff — Statistics performance and correctness

Date: 2026-11-13. Owner instruction: transfer to GPT Work on PC for precise continuation. **No Production deployment has been authorized.**

## Canonical repository, branch, and checkpoint

- Repo: https://github.com/mccareysupon-png/nomadtips3-live-test
- Work branch: `test/ball46-statistics-summary-shadow-20261113`
- Verified branch checkpoint BEFORE this handoff: `d50b81d65a46f0af5d5cc5169e12921393a6a223`.
- Read `work/statistics-summary-shadow-20261113/DEPLOY-READINESS-STOP-20261113.md` FIRST.
- Do NOT reset/rebase this work from an older branch or overwrite newer production assets.
- Do not expose internal Engine names or version numbers in the public UI.

## Verified active Production at last preflight (not a substitute for fresh preflight)

- Website `ball46-production`: version `3ae01f77-9205-4e4b-a46c-3d710aff1602`.
- Engine `nomadtips3-engine-343`: version `02e09215-02b1-47fb-b1cf-9423f50c7ce9`.
- These IDs are historical observations; verify again immediately before ANY staging action.
- No Production Website or Engine activation/traffic change, provider request, Production Ledger write, Cron, Bot Fight Mode, or speed setting change was carried out in isolated hosted QA.
- Production Website already has new membership banners; preserve them and do not re-inject older promo code.

## What is implemented / tested

- Summary-first frontend: home reads compact summary, full history only after opening Statistics.
- Isolated summary service and independent SQLite Durable Object, with read-only paginated Engine access; no custom domain/route/Cron.
- Pinned cursor proposal: `CURSOR_PINNED_GENERATION_V1` with up to 2,000 rows/page, HTTP 409 `STATISTICS_GENERATION_CHANGED`, bounded retries.
- Tests on 14,998 *recorded real Ledger* rows: 8 pages instead of approximately 30 at 500 rows/page. This is not a measured 4x end-user latency improvement.
- Hosted isolated Worker + separate DO successfully imported 14,998 rows and returned exact counts; `workers.dev` was disabled afterward.
- Additional hosted isolated mutation QA (run 43409203595): after one new TEST-only row, stale continuation returned 409 and fresh traversal yielded 14,999 distinct rows in 8 pages.
- Tests/QA: recorded-data and local workerd tests, PC/mobile UI replay and combined-banner tests previously succeeded; however, live end-to-end Website+Summary Service+Engine+concurrent real writer has NOT been approved.
- A version of Engine code `4bef9d75-31d3-4de8-8f14-299fca5c56c3` was uploaded as **inactive version** and not activated. Attempts to override a 0%-traffic Durable Object version still resolved the baseline DO runtime, so do not treat the 0%-traffic override as a successful live hosted test of candidate code.

## Newly confirmed blocker (not fixed)

`ledgerUpdatedAt` / `meta.updatedAt` is being used as `statisticsGeneration`, but even a no-op Ledger import changes it.

Hosted isolated test:
- `inserted=0, updated=0, unchanged=1`.
- generation before: `1794565703923`.
- generation after:  `1794565706631`.
- `changedWithoutRowWrite=true`.

Source to examine: `work/engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js`, method `__b46UpsertLedgerUnlocked` near `meta.updatedAt = at; await this.ctx.storage.put(STAT_LEDGER_META_KEY,meta)`. This updates meta on a no-op path and can make pagination needlessly restart while the live scan runs. Other writes/repair paths also change meta and must be considered.

CRITICAL: A pinned generation + 409/retry loop **is not an immutable snapshot**. If real writer traffic changes generation faster than multi-page reads, bounded retries may still fail. The release gate from the previous Work session called for an immutable bounded history snapshot / equivalent consistent read. Do not claim the current versioned cursor alone solves liveness. Evaluate full source freshness, CPU, memory, and storage costs before design choice.

## Immediate tasks for GPT Work PC (TEST only)

1. Begin read-only: inspect exact files, latest TEST branch HEAD, GitHub Actions reports and current Production active versions/bindings. Verify any branch drift, do not discard newer commits.
2. Design and implement a **monotonic data/content revision** (separate from freshness/source-age timestamp) that changes atomically ONLY when content actually changes. Cover insert/update/delete/repair, sync, no-op import and same-millisecond writes. Use DO storage transaction/semantics appropriate to current Engine. Preserve data, settlement rules, counters, formulas, all markets, timestamps, and source-age UI. Do not write or backfill Production Ledger.
3. Evaluate whether optimistic retries under real writer frequency are sufficient; if not, implement a bounded, immutable snapshot generation or equivalent consistent-read design with pinned cursors, complete validation before publication, and capped RAM/storage/CPU. No full-ledger RAM copy, long write locks, or new upstream/provider requests.
4. Build tests that assert: (a) no-op sync leaves content revision unchanged; (b) actual mutation increments revision and stale cursor rejects with 409; (c) snapshot/retry reads all rows without duplicate/missing IDs; (d) parity for all market/outcome totals and source-age; (e) concurrent writes, old-client compatibility, error/fallback behavior; (f) PC/mobile UI and banners unchanged.
5. Run integrated TEST with isolated Engine + summary service + Website candidate (not just three independent unit tests) using recorded real Ledger, actual hosted/runtime interactions as feasible, and simulated changes while reading. Establish explicit performance baselines (cold and warm home page; Statistics first interactive paint and complete load; API requests, memory, cost).
6. Finish with a release-gate report, exact Git SHA/version IDs, PASS/FAIL, remaining blockers, and a request for the owner's **separate explicit Production deployment approval**. Do not deploy just because tests pass.

## Hard prohibitions

- NO Production deploy, route/traffic activation, hot switch, Cron change, provider/Goaloo calls, Production Ledger writes/migration, bot/security settings changes or accidental overwrite of NOMADTIPS3/BALL46.
- Never remove the source-generation correctness fence to make tests green.
- No unapproved change to Prediction/Score formulas, other website UX, Favorites, member system, consent, or banners.
- Do not infer that a Workflow success means full production readiness; check which conditional steps actually ran.
- If blocked, stop and give a compact evidence-backed diagnosis rather than guessing.

## Source files and evidence

- `work/statistics-summary-shadow-20261113/build-pinned-engine-candidate.mjs`
- `work/statistics-summary-shadow-20261113/ui-patch.mjs`
- `work/statistics-summary-shadow-20261113/bounded-summary.mjs`
- `work/statistics-summary-shadow-20261113/summary-service.mjs`
- `work/statistics-summary-shadow-20261113/stage-isolated-engine-mutation-qa.mjs`
- `work/statistics-summary-shadow-20261113/stage-isolated-engine-realdata.mjs`
- `work/statistics-summary-shadow-20261113/DEPLOY-READINESS-STOP-20261113.md`
- Isolated hosted mutation test: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43409203595
- First hosted isolated real-data test: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43408312557
- Full UI / banner QA: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43400899746

This handoff is documentation only. It does not grant any permission to change Production.
