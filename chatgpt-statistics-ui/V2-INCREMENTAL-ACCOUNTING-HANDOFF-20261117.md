# BALL46 V2 — last running balance, no old-Ledger recount (STAGING ONLY)
Date: 17 Nov 2026 (Asia/Bangkok)

## Owner's correct accounting model
- Use latest VERIFIED Snapshot as opening balance, not zero.
- Keep each signal's unique Ledger entry and its final result as immutable RAW HISTORY.
- Engine's canonical serialized Ledger upsert is the one-time accounting point for new SETTLED, and an old/new reversal for corrected results.
- All-time WIN / LOSS / PUSH / half outcomes, P/L, ROI, daily net chart are MATERIALIZED running totals.
- Homepage and Statistics must read precomputed snapshot, never fetch 16k+ Ledger records on first paint.
- History is an on-demand paged archive; reading history must NEVER trigger reaggregation.

## Confirmed current source
- Live Engine upsert method: `__b46UpsertLedgerUnlocked` under `nomadtips3-engine-343`; it already uses `applyLedgerMeta(meta,old,-1)` then `applyLedgerMeta(meta,row,1)` for changed stored signal rows, skips same `_ledgerMarker` and stores `stat:v2:meta`. **These existing WIN/LOSS counts should be preserved.**
- Current Engine stats route `/statistics?paged=1` returns 500 rows (createdAt descending), global counters, and `nextCursor`. Page one is NOT a reliable live-settlement delta because old PENDING records can settle later.
- Home old Daily Performance source in Production `index.js` has a 10s `refresh()` with cursor loop across every historical Statistics page, then `aggregate(rows)`. Work to remove reliance is STAGING-only.
- Production V1 already patches `singlepage-workspace-343.js`; STAGING patch must match this current source instead of obsolete source anchors.

## Implemented in isolated STAGING branch
Repository `mccareysupon-png/nomadtips3-live-test`, branch `chatgpt/ball46-statistics-ui-v1`.
1. `incremental-accounting-v2-stage.mjs`: bootstraps once from latest fully verified Ledger, then uses only previous running balance plus the changed old/new canonical result to post new SETTLED. Safe-stop on correction or out-of-order settlement until targeted rebuild. No historic raw match rows retained in the running-balance object. **Not yet connected to Engine's real write path.**
2. `daily-summary-stage.mjs`: exact old HOME source formula: Europe/London 06:00 cutoff, createdAt day not settledAt, HALF wins/losses, odds, one-count-per-ID, last two London days. Project once when verified staging snapshot is built.
3. `stage-kv-sync.mjs`, `compact-summary-stage.mjs`: publishes immutable compact summary + original financial chart + exact Daily Performance buckets; latest build 43990130820 SUCCESS: 16,190 Ledger records at build time, compact head 894 bytes, graph 7,702 bytes. This BUILD is still historical reconciliation; not yet write-time deltas.
4. `live-staging-worker.mjs`: suppresses duplicate Production V1 fast-client; serves STAGING-only verified head, chart, Daily Performance client and paged archive client. Zero Production, Engine and Ledger writes.
5. `lazy-detail-stage-patch.mjs`: removes the browser's homepage/statistics first-paint full-Ledger request on CURRENT Production V1 loader code, without removing native fallbacks needed for unsupported markets.
6. `daily-homepage-stage.mjs`: renders saved Today/Yesterday buckets from the compact head on existing homepage card, no browser historical scan.
7. `fast-chart-firstpaint-stage.mjs` + `archive-history-client-stage.mjs`: original all-market financial graph remains precomputed; history click displays only 50 verified archived SETTLED rows at a time (one actual source page holds up to 500 rows). Additional 50 are displayed from buffer, not re-fetched. Financial graph and totals do not recalculate on history click.

## Verified evidence
- Run 43989401778 and run 43990458818: homepage 0 Statistics API reads before details, 0 JS errors. Later run has live-saved day widgets: Today WIN 55 / LOSS 34 / PUSH 21 / PENDING 4, Yesterday WIN 137 / LOSS 99 / PUSH 149 at its snapshot timestamp.
- Run 43990130820: full staging snapshot readback, source count / chart, daily compact head publication PASS.
- Run 43990592397: 6 new result scenarios and 13 original London day/DST formula fixtures PASS; ordered new SETTLED delta and graph math match the native formula, historical rows retained 0.
- Run 43991172031: FULL current staging browser QA PASS. PC initial meaningful chart ~3,472ms, mobile ~4,090ms. Both start with ZERO /api/engine/statistics requests; after click, 50 archived settled rows; click again, 100 rows total from **only ONE API page**; existing graph net stays unchanged, no JS errors, no page-wide horizontal overflow.
- Earlier staging QA showed full native History still ~23s after detail click; this is why the V2 archive was introduced. The old full-history test is not the correct V2 acceptance gate and was replaced by paged-archive browser QA.

## Important remaining blockers before ANY Production rollout
1. **Not yet real event-driven:** connect the running-balance update at Engine's canonical serialized old/new Ledger upsert, with durable idempotent commit and restart handling. Do not pull old rows from the first API page as a fake delta.
2. **Correction/out-of-order:** implement targeted day-bucket correction/reconciliation and increment a stable content revision; old already-settled rows remain raw archival data, never feed whole-history recount by default.
3. **Market/range filtering:** AH, 1X2 and unsupported range/variant routes still use native historical flow; build source-backed materialized market views and parity test them. Do not infer filtered P/L from all-market values.
4. **Freshness:** STAGING compact source build is a manually/event-triggered reconciliation, NOT a continuous Engine settlement-driven snapshot. UI marks saved as-of time. Build/update scheduler alone must not regress to full Ledger scans.
5. **No Production change authorized in this V2 branch:** staging Worker only. Preserve current Production baseline/version independently before any later requested release.

Live STAGING URL: https://ball46-chat-statistics-live-ui-test-20261115.mccarey-supon.workers.dev/?view=statistics
Latest archived browser CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43991172031
Latest homepage CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43990458818
Latest incremental algorithm CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43990592397
