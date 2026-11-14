# BALL46 Statistics — Work PC independent review handoff (14 Nov 2026)

## Mandate
**REVIEW ONLY. DO NOT DEPLOY, MERGE, WRITE PRODUCTION, UPDATE ENGINE/LEDGER, OR PROMISE READINESS.** The owner specifically requires Work PC to independently inspect the Statistics implementation before any release. Do not trust a prior assistant's assertions; read original source and proof from GitHub/Cloudflare read-only and cite the exact active Worker version, timestamp, SHA, and test run.

## Reference points
- Repository: `mccareysupon-png/nomadtips3-live-test`.
- Isolated staging branch: `test/ball46-statistics-real-ui-network-20261114`.
- GitHub Actions proof for final isolated hosted page run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43559990117
- Latest `main` seen before this handoff: `984c7ed1b52a8ffbdf18777239535d6e464121a8` (2026-11-14 03:37:31 UTC); **DO NOT ASSUME THIS IS THE ACTIVE PRODUCTION CODE.** Re-read live Cloudflare version, module hashes, deployments, bindings, settings, Cron, routes and assets immediately before review.
- Production Worker version observed in the independent QA on 2026-11-14 05:08:04 UTC: `ball46-production` active `474dce9c-f809-4a8b-abda-2ada8063b9ef`; Engine Worker `nomadtips3-engine-343` active `02e09215-02b1-47fb-b1cf-9423f50c7ce9`. These are historical observations, **not asserted to remain current**.
- Historical `main` vs staging compare: diverged (staging 659 commits ahead of shared merge base and 216 behind main), so **NEVER** merge/cherry-pick whole branch or rebuild website from this branch.
- Current user-reported issue: Statistics taking 17–20 s before the isolated test; LIVE signal badges also appear late, and right-hand promo image sometimes flickers. Signal and promo are **regression gates**, not authorization to change these separate systems.

## Isolated staged implementation — exact source
- `work/statistics-read-model-v2-20261114/read-model.mjs`: full-ledger-derived mathematical read model. Audit original status, per-market/variant/selection and half-result handling.
- `work/statistics-read-model-v2-20261114/persisted-read-store.mjs`: revision-keyed derived view plus 50-row pages, precomputed chart data. Audit correctness, aggregation and consistency with original.
- `work/statistics-read-model-v2-20261114/native-stage-ui.mjs`: patches **captured live original Statistics DOM** in an isolated test. Audit exactly what is replaced and what is retained.
- `work/statistics-read-model-v2-20261114/hosted-stage-worker.mjs`: private test-only Worker; **not a Production Worker**. Other `/api/*` endpoints are intentionally stubbed with dummy responses. Does not prove a safe release route.
- `work/statistics-read-model-v2-20261114/hosted-stage-deploy.mjs`: temporary authenticated test deployment and imported recorded data, not a release script.
- `.github/workflows/ball46-statistics-real-ui-network-20261114.yml`: test-only run; test subdomain disabled afterwards.
- Review original live `singlepage-workspace-343.js`, `longterm-performance-343.js`, current live chart/loader assets and *current* main Worker modules rather than rely on older source copies.

## What was actually tested, and what was not
GitHub Actions run 43559990117 passed private Worker + Chromium browser tests using a previously recorded, immutable **14,998 ledger row** snapshot (not live updating ledger), derived and stored in an isolated staging DO. Summary response was ~2,063 bytes, first 50-row view ~72,057 bytes in that run. Full original Statistics UI components were exercised; menu tabs and paged table worked. End-to-end user-visible ready marks:
- PC WAN from GitHub runner: 1,200.7 ms.
- Simulated mobile WAN: 1,190.2 ms.
- Simulated mobile throttled 4G: 2,648.0 ms.
This is **not** a field speed measurement from Thailand, physical phones or continuously changing live ledger.

Loader visual defect was subsequently fixed **only in staging** and verified absent in final run (the original `.b46-stats-loader` was hidden when verified data was rendered).

## Known blockers — must investigate and resolve in TEST first
1. **Long-term Performance:** the original chart `longterm-performance-343.js` independently calls `window.BALL46_STATISTICS_DATA.load()` and consumes the full row history. The fast UI patch does **not** prove that candlestick/line, 7D/30D/90D/ALL, 1-unit P/L, ROI, drawdown, zoom/pan, and metric cards are now driven by complete verified derived results. In screenshots it appeared blank/incomplete. No reinterpretation of historical formulas permitted.
2. **Settled Days / hidden KPI:** previous audit found a hidden KPI booting Statistics reading on the LIVE view; the staging shot showed blank/placeholder settled-days output. Verify actual current implementation and London cutoff/Bangkok day semantics, and that the KPI does not trigger a multi-MB full-history download on landing.
3. **Live updates:** staging imported fixed 14,998 rows once, not the production incremental ledger, rollover, corrections, late settlements, new markets, idempotent updates, revision/invalidation, or recovery after failed writes. Need a truly verified read model sustained through source changes with no data divergence; no manual raw copy as the production source.
4. **Numerical parity:** verify full-ledger counts for all+1X2/AH/O-U/BTTS/Corners/Cards/Other, variant/filter, PENDING/UNRESOLVED/SETTLED, WIN/LOSS/PUSH/HALF_WIN/HALF_LOSS, net/stake/ROI, weighted Win Rate, day labels, Corners FT combining both teams. Compare against the **current real original Engine and UI formulas**, not only an old archived source.
5. **Original live page regression:** do not slow homepage, live Board, Signal arrival/badge, Favorites (especially mobile hidden), PWA, promo cards, Event Flow, Full Market, consent and membership; preserve all original assets and latest source bytes. Monitor full API calls and provider counts. The isolated Worker returns stubs for non-Statistics APIs and cannot prove this.
6. **Release safety:** never merge old staging branch into main or deploy old website modules. Use a new candidate built by *surgical patching on the exact currently active Cloudflare Worker* with strict SHA locks for untouched modules, assets/settings, routes, bindings, Cron, source revision and rollback. Recheck the active worker after candidate build; stop immediately on drift.
7. **Screenshots:** attach PC and mobile full-page screenshots of genuinely fully rendered KPI, long-term chart, 50-row History, filter and pager, and inspect for placeholders. Do not accept only successful machine assertions.

## Requested Work PC deliverable (read-only first)
Provide a short verification table with **PASS/FAIL/UNKNOWN and proof** for these gates, a list of precise current file paths/hashes and cross-version conflicts, benchmark vs active site cold/warm, and the smallest proposed patch diff on a new test branch if needed. **Do not deploy Production.** If any gate is FAIL/UNKNOWN, state plainly "NOT READY" and what must be fixed. Ask owner separately before any production activation. Do not modify unrelated Signal or promo during the Statistics review.

## Preservation statement
This handoff is documentation only; writing it does not authorize Work PC, GitHub Actions or anyone else to change Production. No Production deployment should be triggered by a review task.
