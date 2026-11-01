# BALL46 Bulk Live Refresh V1 — release preparation only

Scope: Bulk Live producer cadence + owner control routes only. NO MERGE / NO DEPLOY / NO TRAFFIC CHANGE.

Authoritative Cloudflare baseline captured 2026-11-01 (UTC timestamp in baseline.json):
- Website ball46-production version 1f6499e3-6faf-408c-b47a-0b18d700b228, deployment 8626fe0b-a8c3-464a-ba3f-e9f3b17eb4d7, 35 modules.
- HUB nomadtips3-5usd-hub-343 version 98ea43ab-f40c-4de5-82e3-b0387dffd672, deployment 2bf73f8a-b3e2-4f50-b33f-df2523656581, 1 module.
- Effective stored Bulk cadence is already 30s. Legacy source fallback and auto-return target are 120s. Candidate makes DEFAULT/return 30s in a separate new storage key.
- HUB cron */2 * * * * remains unchanged; Today/Schedule refresh remains 120s.

Root causes and findings:
1. Control HTML controls Full Odds, while Bulk is a read-only summary with obsolete 120s placeholder. Required prototype directory was not found in this checkout, other Documents/Codex paths or the inspected latest review tree. Candidate extends the actual current production control HTML.
2. Website proxies /api/hub/* to HUB; HUB exposes GET/PUT /control without owner verification. Control page itself returns HTTP 200 anonymously. Both canonical workers.dev routes are enabled and preview routes enabled. No existing Access app covers this control page/API. No production PUT or exploit attempt was made.
3. Bulk fetchJson discards provider rate-limit headers. A different Rich Odds gate records its own headers but is not an account-wide coordinator. Cannot establish all-worker/all-key aggregate quota from existing Bulk telemetry.
4. Existing 429 path only parses numeric Retry-After; alarm scheduling alone does not prevent the cron/Today path from requesting during cooldown. Candidate adds durable provider-boundary gating for all Bulk producer requests and supports seconds/HTTP dates.

Implementation:
- policy.mjs: DEFAULT30 / FAST20 / ULTRA15, separate configured/effective state; invalid/missing/expired account proof locks acceleration; atomic observed HUB counters, distinct unknown account count, persisted 429 cooldown.
- auth.mjs: verify RS256 signature against pinned Cloudflare Access issuer JWKS; enforce audience, expiry, nbf/iat, subject, exact owner email; reject unconfigured state, workers.dev controls and cross-origin mutation.
- hub-extension.mjs: extends the exact live FiveUsdHub export; preserves inherited snapshot merge/normalization/continuity/history. New control state is bulkLiveV1Control; legacy bulkLiveControl stays unchanged for rollback. Cooldown telemetry persists in bulkLiveV1Telemetry. No key/cron/storage migration.
- website-extension.mjs: wraps the current last export, protects /5usd-control.html and /api/hub/control. All other paths delegated unchanged.
- bulk-live-control.html: replaces only Bulk card, adds 30/20/15 controls and DEFAULT reset; reuses existing health polling. Existing Full Odds sections and applyMode function remain byte-identical.
- build.mjs: refuses any source hash drift; no deploy logic. Candidate files are derived from exact live module hashes, not main.

Readiness: NOT ready for full Production activation.
- A dedicated owner-only Access app/audience/issuer must be configured for the precise control paths after separate approval. Candidate denies all control when these are absent (503), and denies workers.dev control (403).
- Existing/old workers.dev and version preview control entry points require an Access/preview exposure plan; no account-wide policy changes are permitted. Do not treat the active-wrapper test as proof that historical version URLs are secured.
- No live trusted account coordinator currently publishes bulkLiveV1AccountQuota. Do not fabricate it or accept proof from a browser. FAST/ULTRA stay disabled. Tests use an explicitly simulated coordinator record; this is not live quota verification.
- Before acceleration, every consumer of the provider account must be covered by a shared authoritative budget/reservation mechanism, with observed account headers and fresh coverage proof. This requires a separately scoped integration review; do not alter Full Odds or other Workers to achieve it under this task.
- Local tests model DO storage with a serial transaction stub; real Cloudflare DO integration and owner login remain to be tested in an isolated Access-protected test environment after provisioning is approved. No test Worker was deployed in this task.

Provider documentation checked:
https://5dollarfootballapi.com/docs#rate-limits
https://5dollarfootballapi.com/docs/errors
Ultra base allowance is 40/min shared by all keys on the account. Retry-After must be honored. Existing user subscription is not independently queried; no additional provider request was made.
Cloudflare JWT validation:
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

Rollback preparation:
1. Re-read active deployments immediately before any future approved rollout; stop if either baseline/version/module hash differs. Refresh baseline rather than replace newer changes.
2. Preserve all existing Website/HUB modules, assets, bindings (secret_text inherit latest), DO namespace IDs, settings and cron. Replace only the exact two entry modules, add new helper modules and one control HTML module. Existing Website source body is reversible byte-for-byte; HUB changes are limited to Bulk fetch boundary and export extension.
3. Deploy to an isolated protected test environment first. Do not use a test fixture in Production.
4. On an approved future production rollback restore HUB 98ea43ab-f40c-4de5-82e3-b0387dffd672 and Website 1f6499e3-6faf-408c-b47a-0b18d700b228 (only if still the immediate baseline); verify hashes/settings/domains/cron and effective stored 30s. No DO data deletion. New keys are ignored by legacy runtime. Keep narrow Access protections in place; never restore unauthenticated public control or globally disable owner protection.
5. Account-wide cooldown coordination and old preview exposure must be resolved in the rollout/rollback design before approving activation. Restoring legacy HUB also restores its weaker 429 behavior, so do not perform that rollback during an active provider cooldown without a validated pause plan.

Out-of-scope finding (reported only): current Full Odds settings UI/API also merits a separate owner-auth review. Its API and logic are unchanged in this candidate because Full Odds is expressly excluded.

Final test evidence:
- GitHub Actions 41301924794: success, candidate source commit a4e2e71cac2436f2a22619732eab175bfed34a9e.
- 58 unit/auth/integration tests + 12 isolated browser checks = 70 passed.
- PC 1280px and mobile 390px; 30/20/15 + DEFAULT; missing quota; 429/backoff; zero simulated-browser provider requests.
- GET-only production final check: both active deployments and all 36 existing modules exact; settings and cron exact; 47 referenced static/control assets all HTTP 200; control HTML hash unchanged.
- No Cloudflare versions created, no deployment, no traffic change, no configuration or Access change, no merge.
