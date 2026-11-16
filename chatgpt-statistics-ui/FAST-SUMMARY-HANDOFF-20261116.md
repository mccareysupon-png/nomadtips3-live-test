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
