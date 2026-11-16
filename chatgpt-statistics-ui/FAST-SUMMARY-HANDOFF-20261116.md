# BALL46 Statistics fast-path handoff — 2026-11-16 (STAGING ONLY)

## Verified implementation
- Existing Production Worker is unchanged by this work. Last reported Production version before this effort: `828ddb27-bec4-47f8-a41f-fc7469b0152a` (verify actual active version again before any release). Previous rollback point reported: `98be2d5a-b5f6-4226-8ee0-3f7270b03533`.
- `stage-kv-sync.mjs` reads cursor-paged public Ledger, verifies original result counts and duplicate IDs, and checks head consistency again before publishing.
- New `compact-summary-stage.mjs` projects **only verified original-source aggregates**, never original rows, history, reconstructed ROI, daily P/L, or invented graphs.
- The builder writes the full immutable gzip payload and a separate tiny immutable JSON summary to **isolated staging KV**, confirms both SHA-256 readbacks, then atomically moves the staging manifest pointer.
- `live-staging-worker.mjs` serves `GET /_b46_stage_stats_summary` from staging KV only. Missing, partial, or mismatched payloads fail closed with HTTP 503. The route performs no Production writes.
- `test-stage-kv-sync.mjs` rejects mismatched counts and partial snapshots. `test-live-stage.mjs` now checks compact HTTP parity for PC/mobile alongside original chart tests.

## Evidence
- Staging build 2026-11-16 GitHub Actions run `43849014107`: PASS, 16,082 original Ledger rows, 15,799 settled, 283 pending, original full gzip 4,739,337 bytes, compact verified JSON **577 bytes**.
- Existing staging renderer still needs the full Ledger for chart and details: browser QA run `43849100208` PASSED, PC cold 10,787ms / warm 8,738ms; mobile cold 8,776ms / warm 8,610ms.
- Production previously took ~25,731ms in release run `43844344540` (34 statistics API requests). These timings are different runs and **not a controlled A/B performance result**.
- New compact endpoint browser smoke test run `43849608229`: PASS on PC/mobile; original-source 577-byte JSON responded in **355ms on desktop** and **127ms on mobile** in that test. Full chart remained slower: PC cold 12,276ms / warm 11,147ms; mobile cold 10,914ms / warm 11,056ms. No JavaScript errors, one or two historical API reads across reloads. Timings are single-run observations, not guaranteed user speeds.

## Known limitation / next executable task
**Fast compact endpoint is not yet the main data source for the actual Statistics renderer.** The new 577-byte payload proves headline aggregation can be served without the full Ledger, but it does NOT yet carry all canonical daily P/L, ROI, chart, and filtered-row details. Do not draw a financial graph from invented/approximate values.

Next: inspect current live `/longterm-performance-343.js` and `/singlepage-workspace-343.js` formulas (READ ONLY), then implement an isolated staging **precomputed chart series** with exact outcome/settlement rules and source-revision keyed daily buckets, parity-tested against the complete verified Ledger. Fetch historical rows lazily only when users open history, filter or details. Prefer small immutable snapshot plus incremental update over every-page full recomputation. Add browser timing probes for first meaningful KPI paint, chart-ready, transfer bytes, JS errors, source consistency and mobile parity.

## Release gates
No Production deploy, merge, Engine, Ledger, source formula, WAF, or Production KV changes under this handoff. Before any separate owner-approved Production release: confirm active Worker and all bindings, preserve all unrelated modules, test forced 599 / partial / stale / changed revision, compare all-market financial totals, verify rollback, and use an inactive candidate then activate only on explicit approval.


## Deep graph-index milestone (16 Nov, STAGING ONLY)
- Live source audit run 43851210766 identified two distinct graph algorithms: PERFORMANCE TREND (outcome-weight sparkline) and LONG-TERM PERFORMANCE (odds-priced cumulative 1U net / ROI / Win Rate / drawdown). Do not substitute one for the other.
- Added chart-series-stage.mjs. Copies the actual all-market, all-time settlement and daily Bangkok-close rules, including PUSH, HALF_WIN, HALF_LOSS, unpriced WIN, exact cumulative net, ROI, win rate and peak-to-trough drawdown. Market-filtered charts and 7D/30D/90D are deliberately excluded until independently validated.
- Staging KV build run 43852091832 PASSED: 16,082 source rows, 15,799 settled; full gzip 4.74MB, compact head 577B, immutable all-market daily three-metric graph 7,540B (48 settled days). Chart publishing is count-gated and formula-guarded with SHA-256 readbacks of full, head and chart before the manifest pointer changes.
- Browser run 43852336300 PASSED: compact chart HTTP response 7,540B (208ms desktop, 33ms mobile); same 48 chart points, native +1358.82U net on PC/mobile.
- Browser run 43853218648 PASSED: additive saved-verified chart preview displayed 107ms PC / 93ms mobile after stage script started. Native renderer took over without JS errors. This is preview paint latency, not whole page navigation; full historical load remains ~7-11sec.
- Run 43853860214 PASSED exact day-by-day parity on PC/mobile for all 48 dates and all three series (units, ROI, win rate); values agreed within 1e-8. Fast first-paint 304ms PC / 94ms mobile; no old trend visible, no horizontal overflow; full native load still 8-10 seconds.
- Staging builder now forces a full historical reconciliation on a subsequent build at least hourly, to detect same-count historical corrections that a count signature misses. There is NO new recurring schedule and no new Production traffic beyond staging tests. A proper content-revision or change feed from Engine remains the long-term architectural remedy.

## Remaining release blockers
1. Confirm per-day parity and no overlapping old/new graphs during first paint.
2. Make default page source read compact head + precomputed chart and defer full historical rows until history or unsupported filters are requested. Do not fake records, totals or graph.
3. Test 7D/30D/90D, market variants, saved/fresh flags, 599, refresh/route changes and mobile.
4. Before any Production rollout obtain owner approval, recheck active Worker/bindings and keep inactive candidate + rollback. No Production source is changed by this branch.

## Later full snapshot (10:58 UTC)
Stage-only build run 43853519318 PASSED: same overall Ledger count of 16,082, but TWO records moved from PENDING to WIN (settled 15,799 to 15,801; pending 283 to 281; WIN 6,615 to 6,617). Net chart changed from +1,358.82U to +1,360.64U legitimately. The existing aggregate signature DOES detect this transition. Historical odds/date corrections with unchanged aggregates remain a separate possible edge case; they were not observed in this transition.


## Final staging lazy-first-paint validation — 16 November 2026, 18:58 Thai time

STAGING ONLY. No Production, Engine, Ledger, WAF, original settlement rules, or Production KV writes.

- The original Statistics shared data-loader now waits for an explicit history/filter request before downloading the historical Ledger. First paint uses saved verified tiny summary and financial chart data. The full original renderer takes over after an explicit detailed-history request.
- Source build run 43860391616 PASSED: 16,085 Ledger rows, 15,801 settled, 284 pending; W/P/L inclusive of HALF outcomes = 7,558 / 2,789 / 5,454. Immutable full gzip 4,740,387 bytes; verified summary 577 bytes; verified graph 7,557 bytes, 48 daily points.
- Added exact Bangkok calendar SETTLED DAYS span to the precomputed graph, using the same native source rule. Browser verified 48 days; net +1,360.64 U, ROI 8.6%, Win Rate 54.5%, Avg Odds 1.96, Stake 15,801 U, Max DD -66.99 U.
- First paint shows all EIGHT owner-approved desktop KPI fields and colored outcome bar; mobile fast preview shows four metrics without PC-only outcome bar. No old trend flash or overflow observed.
- Staging browser run 43862255578 PASSED PC/mobile: 136ms PC and 55ms mobile after fast-preview script start (NOT end-to-end navigation); original Statistics API requests BEFORE detail click = ZERO; exact day-by-day native financial chart parity and no JS errors. After user clicks history, original full renderer still takes 9.7s PC / 8.8s mobile on that run.
- Read-only failure-mode run 43862298769 PASSED three cases: direct deep-link AH loads native correct market, injected fast chart HTTP503 resumes native full loader, and AH market click resumes the native renderer. All 16,085 rows complete; no preview overlap/overflow, JS errors, or Production writes.
- Fallback race discovered and fixed: fast snapshot 503 could arrive before the workspace's lazy-history helper initialized; bounded retry now waits for helper registration.
- Current staging URL: https://ball46-chat-statistics-live-ui-test-20261115.mccarey-supon.workers.dev/?view=statistics
- Build evidence: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43860391616
- PC/mobile evidence: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43862255578
- Deep links / 503 evidence: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/43862298769

RELEASE BLOCKERS:
1. Speed first paint is a STAGING preview, not integrated into original native Statistics card. Protect approved desktop 8-value design and existing Production mobile UI.
2. No automated fresh incremental snapshot feed yet; staging KV builder runs on GitHub Workflow events and does not continuously update. Historical same-count odds/date corrections require complete revalidation. Freshness indicator and source revision are mandatory for production readiness.
3. Filtered market/variant views and 7D/30D/90D still use original full-ledger read; exact filtered precomputation and detail pagination are future work.
4. Full Ledger is still slow after pressing history. Do not claim overall speed fixed, nor compare first-paint latency to old 25.7-second full-load benchmark as if equivalent.
5. Production active Worker/version and bindings must be re-verified; prior reported version 828ddb27-bec4-47f8-a41f-fc7469b0152a and rollback point 98be2d5a-b5f6-4226-8ee0-3f7270b03533. No Production deployment without distinct owner approval.
