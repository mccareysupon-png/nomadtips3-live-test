# BALL46 Frontend Speed V1 — test branch only

No Production deployment, version upload, merge, traffic change, engine/config/key/cron mutation.

## Authoritative baseline

- Worker: ball46-production
- Active version: 1f6499e3-6faf-408c-b47a-0b18d700b228
- Deployment: 8626fe0b-a8c3-464a-ba3f-e9f3b17eb4d7
- Runtime source registry commit: 3a16c1a55531c0b377eebdb91606067b63d32932
- Main module SHA256: 5c72190b6f57a87e84f8b196916cebd07b4f2e3bdcc968244962da6e6320d023
- Live source verified against Cloudflare modules and the version/commit registry before editing. The candidate wraps this exact runtime and preserves every existing module and asset bundle; it does not rebuild from main.
- HTML: 473,678 decoded bytes; 19 external scripts; 26 inline scripts; 90 style blocks. Current captured first-load resources returned 200; the historical JS 404 was not reproduced.
- Bound service versions, settings, bindings, assets and cron captured in production.json. Final GET-only preservation gate compares them again.

## Measured initial Production baseline

GitHub Ubuntu runner, headless Chromium; desktop 1440x1000 CPU 1x, mobile viewport 390x844 CPU slowdown 4x. These are lab measurements, not measurements of the owner's physical PC/phone or field Core Web Vitals.

| Profile | Cache | HTML TTFB | FCP | First match DOM | Recorded first-visible probe | LIVE data ready | Observed blocking time |
|---|---|---:|---:|---:|---:|---:|---:|
| Desktop | Cold | 0.52s | 0.76s | 6.25s | 7.98s | 6.25s | 2.74s |
| Desktop | Warm | 0.66s | 1.20s | 4.88s | 7.70s | 4.88s | 2.85s |
| Mobile 4x CPU | Cold | 0.25s | 0.65s | 14.15s | 14.15s | 14.15s | 7.50s |
| Mobile 4x CPU | Warm | 0.23s | 0.82s | 14.06s | 14.36s | 14.06s | 7.52s |

The initial diagnostic first-visible probe sampled DOM mutations and can observe the overlay later than its CSS transition actually ends. The final paired benchmark corrects that probe using the loader attribute and transitionend event; initial diagnostic and final paired figures must not be mixed to calculate an improvement percentage. CDP TaskDuration counters from warm diagnostic runs are cumulative, so use differences rather than the raw warm counter.

## Root causes

1. A hidden settled-days KPI unconditionally invokes the shared full Statistics loader on DOMContentLoaded, even on Live. A decoded response is approximately 43 MB (about 3.3 MB transferred); it competes with the 7.3–7.5 MB decoded Board response and consumes the main thread.
2. dayNoBangkok constructs a new Intl.DateTimeFormat for every ledger row. The mobile CPU profile attributes about 4,655ms of sampled self time to this function. Formatting is presentation-only; its date/day arithmetic must remain identical.
3. The loader's subtree observer can queue repeated nested animation-frame inspections. Coalescing the pending inspection avoids redundant readiness checks while retaining the same data-ready predicate and watchdog.
4. The Board API itself has an observed TTFB around 2.8–3.3s in this environment. A frontend-only patch cannot honestly promise a fresh cold board in 1–2s while retaining that server response time.
5. Existing Full Odds responses can report externalRequestsAdded:1. Absence of direct browser requests to 5USD is not sufficient evidence of an unchanged provider budget; provider-bound bridge request counts must also be checked.

## Options assessed

| Approach | Expected benefit | Risk / complexity | Decision |
|---|---|---|---|
| Instant first render | Reveal the first valid list without redundant readiness frames | Low; retain data-ready checks and error watchdog | Selected loader coalescing |
| Progressive rendering | Reduce work on unseen rows | Medium/high; existing collapsed groups and View all already limit initial DOM; changing reconciliation can lose search/state | Keep existing reconciler and complete fixture collection |
| Critical CSS | Improve shell FCP | High for this injected theme; FCP is already much earlier than match availability | No CSS/theme changes |
| Deferred JavaScript | Prevent hidden Statistics work competing with initial Board | Low if limited to the settled-days boot; direct Statistics view stays immediate | Selected board-first hidden-KPI boot |
| Efficient updates | Eliminate repeated expensive date formatter construction | Low; exact Intl options and date arithmetic preserved | Selected shared formatter |
| Static assets/cache | Reduce repeated downloads | Existing version labels are not universal content hashes; blanket immutable caching could leave stale JS | Only bump the changed workspace script cache key; no broad cache policy change |
| Existing snapshot reuse | Fast warm display | Needs explicit saved/stale UI state and freshness policy; cannot label saved matches as current LIVE | Not introduced; no fake LIVE or extra Board request |

## Minimal patch

- singlepage-workspace-343.js: share one Bangkok date formatter; retain exact input conversion and fallback; start only the hidden KPI's eager load after the existing first-board event. Statistics navigation still loads immediately. Ten-second failure fallback is one-shot and deduplicated.
- Existing HTML loader runtime: coalesce pending inspections; keep the same ready predicate, spinner/theme, transition and timeout. Change only the workspace script cache key.
- patch.mjs and prepare-runtime.mjs: exact-source guards, reversible outer wrapper, generated one-asset text bundle and no deployment command.
- Dashboard, Signal, Event Flow, market/odds normalization and polling scripts remain byte-identical. No formula, Ledger/Settlement data, Member or upstream provider path is modified.

## Measurement and regression design

- Same captured assets and real JSON replayed for baseline and candidate. No mock results are sent to Production.
- Actual recorded per-resource TTFB used by the replay server, equal per profile/variant. Browser clock offset preserves the price ages recorded with the Board; it runs continuously across each cold/warm pair.
- Final cache-aware suite: three paired repeats per profile/cache, alternating variant order; median is reported. Desktop CPU 1x and mobile CPU 4x are separate profiles. HTTP caching is enabled: Playwright request interception is not used. Captured same-origin resources and fonts are replayed locally; external HTTPS is blocked and DNS is isolated. Warm navigations retain the same browser context/cache. Resource transfer sizes record actual cache reuse. Earlier interception-based runs are robustness checks only and are not claimed as real HTTP warm-cache measurements.
- Fixed 18-second observation window for blocking time, plus blocking through the first complete Signal snapshot. Both are reported because baseline work may fall outside 18 seconds. This is an observed long-task blocking sum, not an interchangeable Lighthouse TBT score. FCP/LCP are PerformanceObserver measurements. The early LCP can be loading-brand content and is not the first-match metric.
- Synthetic interaction timing is a lab observation only; field INP is not available without representative real-user interaction data. See https://web.dev/articles/inp and https://developer.chrome.com/blog/inp-tools-2022 .
- Every fixture ID and score/status projection is hashed against the frozen Board, all ledger rows remain complete, and Signal contents/styles are compared before/after. Search is tested through visible PC/mobile controls.
- Board/Signal request counts, provider-bound Full Odds bridge counts, unchanged polling source, initial LIVE readiness and Signal arrival are regression gates. No upstream API is contacted by the replay tests.

## Rollback / future activation gate

1. Re-read current Cloudflare version, deployment, full modules/settings/bindings/assets/cron and live-referenced file hashes immediately before any separately approved rollout. Stop on drift.
2. Preserve all existing modules/bundles and bound service versions. The candidate replaces only the outer entrypoint and adds frontend-speed-v1-assets-20261101.txt; no old asset manifest or repository main build may overwrite live assets.
3. Verify generated runtime syntax, exact asset hashes, first-list readiness, live scores/signals/search, Event Flow and all resource statuses on a protected non-traffic candidate before activation. No such Cloudflare candidate was uploaded in this task.
4. Only after explicit owner approval may traffic be changed. Keep baseline version 1f6499e3-6faf-408c-b47a-0b18d700b228 as the restore point if it is still the immediate baseline.
5. Roll back traffic to that exact baseline and confirm module/asset hashes, API health, score/Signal data and settings. No data migration/deletion or global cache purge is needed. The root HTML reverts its script version reference to the original bundle.

Sources for measurement interpretation: https://web.dev/articles/inp and https://web.dev/articles/content-visibility . These explain lab/field interaction measurement and rendering tradeoffs; speed results here come from the recorded project measurements rather than those examples.

## Coverage limits

Replay keeps captured data/TTFB equal; it does not model all live network variability, bandwidth, physical phone GPUs, or every match interaction. Uncaptured external resource requests are blocked and appear as console network warnings; page exceptions and known same-origin response failures are checked separately. No field INP or universal zero-console-error claim is made. Event Flow source and dependencies are retained, but a complete end-to-end Event Flow interaction was not recorded in this benchmark. Before traffic activation, a protected candidate must verify those interactions and current assets.

The 1–2 second fresh LIVE goal is not proven. The captured Board API TTFB alone can exceed 2 seconds. Backend response-path changes or saved-snapshot freshness/UI policy would require separate scope; this patch does not silently show saved data as current LIVE.

Cold means a new browser context; the browser process and runner OS remain running. Warm means a repeat navigation in that context. Zero-transfer entries demonstrate cache reuse but can include duplicate resources within a navigation; they are not unique-asset counts. Network bandwidth/RTT is not a physical mobile-network simulation: recorded response delay and CPU throttling are controlled.

## Final paired measurements

GitHub Ubuntu headless Chromium; recorded static assets and real captured JSON; same replay TTFB/CPU per profile; normal HTTP browser cache enabled, external network blocked; no provider requests

3 repeats per profile/cache; 24 navigations; median values.

| Profile | Cache | First list before | After | Improvement | HTML TTFB before/after | FCP before/after | LCP before/after | Observed blocking 18s before/after |
|---|---|---:|---:|---:|---|---|---|---|
| desktop | cold | 9.33s | 6.92s | 25.9% | 0.53s / 0.53s | 1.07s / 1.06s | 2.37s / 2.37s | 5.05s / 3.15s |
| desktop | warm | 9.41s | 6.87s | 26.9% | 0.53s / 0.53s | 1.02s / 1.00s | 2.32s / 2.32s | 5.04s / 3.04s |
| mobile | cold | 19.04s | 7.30s | 61.6% | 0.53s / 0.53s | 1.01s / 1.02s | 1.01s / 1.02s | 10.58s / 2.78s |
| mobile | warm | 9.25s | 7.16s | 22.6% | 0.53s / 0.53s | 1.00s / 1.07s | 1.00s / 1.07s | 9.38s / 2.45s |

| Profile/cache | LIVE ready before/after | Signal ready before/after | Blocking through complete content before/after | Zero-transfer resource entries before/after |
|---|---|---|---|---|
| desktop/cold | 7.37s / 5.02s | 10.40s / 7.54s | 5.05s / 3.15s | 21 / 21 resources |
| desktop/warm | 7.41s / 5.01s | 10.46s / 7.48s | 5.04s / 3.04s | 50 / 50 resources |
| mobile/cold | 18.98s / 6.82s | 23.16s / 13.37s | 11.38s / 2.78s | 21 / 21 resources |
| mobile/warm | 7.23s / 6.68s | 22.08s / 13.60s | 10.41s / 2.45s | 50 / 48 resources |

## Regression result and readiness

Source/output equivalence tests: 8 passed. Runtime routing/cache/rollback tests: 5 passed. Browser suite result: true across 24 navigations. Complete fixtures per run: 1870. Signal and score hashes, ledger completeness, visible PC/mobile search and style projections agree. Board/Signal request counts match and provider-bound Full Odds bridge request counts do not increase in the measured window. Polling source remains unchanged; replay does not prove every live provider-side cache hit.

No Production traffic or source was changed. Candidate is reviewable in the isolated test branches. The 1–2 second target is not achieved, field INP is unmeasured, and the candidate still needs protected Cloudflare staging verification (including Event Flow interactions and active-source recheck) before an owner-approved rollout.

Rollback baseline: 1f6499e3-6faf-408c-b47a-0b18d700b228; deployment 8626fe0b-a8c3-464a-ba3f-e9f3b17eb4d7. Preserve modules/assets/settings/service versions and reactivate that exact immediate baseline if still current. Old asset-version URLs remain delegated to the original runtime. No database migration is involved.

## Recorded interaction and audit evidence

Synthetic EventTiming duration medians (before/after): desktop cold 552/544ms, desktop warm 608/592ms, mobile cold 56/48ms, mobile warm 40/40ms. These are the automated filter/search button interactions, not field INP.

Final GET-only Cloudflare preservation check at 2026-11-01T12:45:36.093Z passed: active version/deployment, all 35 modules, bound service versions, cron, settings/bindings, custom domains and asset configuration match the baseline. Production writes: 0. The final browser suite records 0 page exceptions, 0 known-response failures and 7 blocked/uncaptured external-resource console warnings.

Authoritative cache-aware run: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41307156801 . Raw metrics and preservation proof are committed under work/ball46-frontend-speed-v1-20261101/qa on codex/ball46-frontend-speed-cache-proof-20261101. The earlier 24-navigation interception suite also passed (run 41306906913), but is not used for true cache timing claims.

Reviewable patch source: patch.mjs; runtime packaging: prepare-runtime.mjs; generated candidate artifacts: candidate/index.html, candidate/singlepage-workspace-343.js, candidate/worker-runtime.mjs, candidate/frontend-speed-v1-assets-20261101.txt. Benchmark/audit/test scripts are test-branch-only tooling, not website assets. No engine, Signal formula, score polling, Event Flow, theme, Member, Ledger or Settlement source is modified.
