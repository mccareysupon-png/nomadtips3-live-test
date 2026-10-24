# BALL46 Issue #368 — Verified 5USD Last 5

Production deployment and post-deploy browser/API checks completed on 25 October 2026 (Asia/Bangkok).

## Result

5USD is genuinely connected server-side. An authenticated bounded source probe returned HTTP200 and five actual FT results per exact team for IDs90020/3727. The deployed private cache later returned five verified results per team for fixture202201716 (807/803) and Production fixture202207202. No mock history or model percentage is deployed.

FORM MODEL · LAST 5 now has View Last 5 / Hide. Expanded HOME/AWAY sections show W/D/L in green/gray/red, opponent, UTC date, H/A, and actual FT score from that team's perspective. The component uses Graphite Noir in dark mode, readable light colors, no borders, and a separate source/form note. It does not turn form into 1X2 win probabilities and does not change Community Vote.

## Current Production / rollback

- Repository: `mccareysupon-png/nomadtips3-live-test`
- Branch: `codex/ball46-form-last5-20261025`
- Main Worker: `ball46-production`
- Production version: `15607595-5930-4093-8e9e-e64c52d9f120` at100%
- Deployment: `942790e4-50c4-480d-9459-cfa725464451`, 25 October 2026 06:47:25 ICT
- Exact baseline/guarded rollback: version `02108724-ac78-4575-a98a-f7ee40053814`, deployment `6cbec888-e950-4cab-a26d-e36112083fe8` (Vote Reconnect V9). The user's older246319a6 reference was checked and is not used to overwrite V9.
- Isolated private history Worker: `ball46-form-history-v1`, version `8a9b143d-bae7-4846-9fbc-a285f2ee3179`. workers.dev and previews disabled; internal-host guard; dedicated HistoryGate namespace and secret. No access to Vote/Engine databases.

## Source / runs

- Source/backend implementation: `754721e0eb0dc7498238690e29158644f0ac874c`
- Shipped UI/patch: `440576d4b795a0084ac3ff08f34a453d39673f3a`
- Guard and cached-source verification: `68fdc34819c41e4fb15b4838fdb720c362e87ae3`
- Activation: `1f19d2b91d56aacd803f860204d49e1532dbcba5`
- [Authenticated source probe40142005693](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40142005693): SUCCESS, no Production writes.
- [Private cache40142880409](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40142880409): SUCCESS, main traffic unchanged.
- [Candidate verification40143459504](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40143459504): SUCCESS, real history/cache and Vote persistence.
- [Production activation40144082975](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40144082975): SUCCESS, both domains and protected data verified.

## Safety and data handling

- Source: official `GET /v1/teams/{id}/fixtures`, `status=finished`, descending kickoff order and strict selected-fixture kickoff cutoff. IDs come from the existing authoritative website board, not client-supplied team names/IDs. A bounded10-row response is filtered/deduplicated, sorted, and capped at five valid FT rows.
- Validate exact team membership, fixture ID, finished/full status, matching UTC/unix kickoff timestamps, real integer FT scores, no future/live/target fixture. Partial/empty results remain explicitly partial/empty; no seeded records.
- User expansion alone triggers history GET. No 3-second history polling. Closing or changing fixtures cancels/discards old UI responses. Browser cache10minutes; server cache6hours (empty15minutes), concurrent deduplication, serialized provider spacing15seconds, maximum40requests/hour and200/day for the new isolated service, bounded queue/retention.
- Provider429 actually occurred during Preview verification. The service persisted Retry-After/backoff and stopped fresh requests. Cached results remained readable. After backoff another real fixture returned HTTP200 with5/5 per team. Upstream/account/transport availability cannot be guaranteed; the UI offers factual loading/error and Retry Last 5. Production's first browser read also needed Retry, then displayed all10 real rows successfully.
- API key is a Cloudflare secret in the private history Worker only. It is not in browser JavaScript, public results, committed metadata, logs or reports. The existing original six main-site bindings are retained; only FORM_HISTORY_SERVICE is added.

## Verification

- Syntax/build checks and12tests pass: actual provider payload, home/away score perspective, invalid/live/future/foreign/target exclusion, dedup/order/cap, partial/empty, persistent cache/restart/concurrent dedup,429 cooldown, budgets, authoritative route mapping, and browser expansion-only/cancellation behavior.
- Actual Preview browser: five HOME + five AWAY rows; View/Hide; Hide while loading; fixture change closes and clears prior rows; finished fixture disappearing from live list also clears old data. Desktop1024/1280/1440, Dark/Light, native mobile390/360, no horizontal overflow, console errors0. Existing native mobile shell still forces dark; it is not changed. Component light colors are verified on Desktop.
- Production browser: actual fixture202207202 shows ten rows, View/Hide and Retry work; PC Dark/Light and native Mobile390/360 checked. Console errors0. Mobile shirts loaded and paired as before.
- Closed Form height34.4375px before/after; Desktop match row69.046875px; Performance99px; Mobile match card142px. Other card/layout sizes retained.
- Vote browser/proxy source bytes unchanged. Candidate real Preview vote test1→X→2→2 remains one net vote and persists. No QA POST to Production. Existing Vote/browser busy/rate-limit behavior is outside this task and is not claimed fixed.
- All original22Worker modules retained;21non-main modules byte-identical; two Last5 modules added. Original public Vote JS, twelve jersey assets, sidebar, Featured, Signal, Statistics and Member surfaces retained.
- Both `ball46.com` and `www.ball46.com`:114audited paths/domain match expected status/hash (including preserved baseline404 entries); six existing APIs and new history health pass. Independently read actual history from both domains: HTTP200,5/5, cacheHIT/HIT.
- All9,641 previously SETTLED rows retain protected fingerprints. Original bindings/settings/schedules/domains/routes and original bound-service versions retained. Engine343, HUB, Full Market, Vote backend, Signal, Settlement and Member Workers are not deployed by this task.

## Scoped files

`deploy-assets/form-last5-20261025/`: `history-core.mjs`, `history-store.mjs`, `history-route.mjs`, `history-browser.js`, `history.css`, tests and actual source fixture, generated Last5 modules/patch/manifest, prepare/guarded runner/provenance/request/browser-proof/rollback/audits. Workflow: `.github/workflows/ball46-form-last5-20261025.yml`.

Public additions: `/api/form-last5`, `/api/form-last5/health`, `/form-last5-20261025.js`, and scoped CSS/script tags in homepage HTML. Existing HTML content and the V9 Vote script cache key are preserved.

## Hashes and evidence

- Main: `d6f5eb24ef9c666839f4c9c56ee3fe9ad4c4fb545915e6b5ed886638b64df72e`
- HTML: `d554a64786ea66aae1051f6f288683b87844cfb738bacaa85ba44446f860239c`
- New browser script: `4ba462ef61aaa44710cb9cf4b3e800b6ee626d01d9f2d19efc0f30f0cde242a5`

GitHub: `audit/probe.json`, `audit-last/backend.json`, `audit-last/candidate.json`, `audit-last/activate-40144082975.json`, `browser-proof.json` and workflow artifacts. Local evidence: `outputs/form-last5-20261025/`, including actual before/after PC/mobile screenshots, live deployment, both-domain history, geometry/browser/console reports and activation audit. See `ROLLBACK.md`; never restore an older pre-V9 baseline over newer Production.
