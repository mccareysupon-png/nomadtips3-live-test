# BALL46 3.43 — monitoring only / John 5USD guidance
Date: 2026-10-27. Scope: read-only telemetry and web synthetic checks; **no production Worker edits, signal/ledger changes, 5USD direct requests, or self-healing deploys.**

## Run frequency / access
- 30-minute scheduled run from GitHub Actions default branch, plus manual `workflow_dispatch`.
- Reads `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from existing repository secrets; job requests only Cloudflare analytics and metadata GET, never logs credentials.
- Tests `www.ball46.com`, `member.ball46.com`, 3.43 HUB and Engine /health, BALL46 engine health and shadow 3.41 parked state. Full Market /health is **optional**: HTTP 404 is expected for a Worker lacking this route, not proof that its live market API fails.
- Logs safe metadata and uploads one sanitized JSON snapshot artifact; 7-day retention for routine monitoring. Does not include API keys, fixture odds, member pages, ledgers or cookies.

## What is actually measured
- Public home/member HTTP, response total ms and TTFB, response bytes and `cf-cache-status` (when present); **not** browser rendering, Web Vitals or geographic p95.
- HUB 3.43 configured live refresh interval; expected baseline **30 seconds**, using `per_page=500` shared snapshot; 30s means ~2 main poll requests/minute.
- Shadow 3.41 `rate.live.usedLast60s`: should remain 0 after 2026-10-27 park.
- Cloudflare `workersInvocationsAdaptive`: invocations, errors, subrequests per Worker; `durableObjectsInvocationsAdaptiveGroups`: Durable Object Alarm counts (not upstream API call counts).
- Active versions of selected critical Workers; catch accidental rollback or unexpected version changes in reports.

## Unknowns — NEVER fabricate
- Actual account-wide **5USD HTTP 429** count, response duration/bytes, rate-limit remaining/reset and Retry-After are *not* exposed by current external read-only metrics. A Worker exception count does not equal provider 429. Real per-upstream fetch instrumentation must be added and tested in a separate scoped change to current live HUB / Full Market code.
- API quota is **40 requests/minute shared across all keys and Workers**, not an individual Durable Object's local 40/minute. Proposed software target <=32/min account wide, with adaptive priority for authoritative final settlement.
- Cache-hit rate from one Runner request is not global Cloudflare edge hit rate; accurate edge metrics require zone-level read access and/or logs.
- No claim of infinite users; load-test CDN/Worker/DO bottlenecks before large-scale promises.
- Avoid checking personalized Member entitlements, billing/Stripe, or raw signals from a public caching monitor.

## Severity
- CRITICAL: homepage or Member unreachable/non-2xx, or required HUB or main Engine /health non-2xx. GitHub Action run may fail for visibility, but never triggers rollback/deploy.
- WARNING: Worker exceptions, 3.41 shadow resumes polling, unusually long single-run TTFB >3s, unexpected HUB poll cadence; investigate but do not auto-modify.
- UNKNOWN: optional Full Market health 404, upstream 429 count/headers, end-to-end Web Vitals, settled ledger reconciliation.
- No new findings treated as settled-money or WIN/LOSS outcomes without authoritative FT.

## Baseline observed ~2026-10-27 11:19 UTC
- Main 200, TTFB **452ms**, HTML **441,261 bytes**, cache header `no-cache, must-revalidate`, no `cf-cache-status` header received by Runner.
- Member 200, TTFB **157ms**, `cf-cache-status=HIT`, HTML **10,570 bytes**.
- HUB 200, refresh 30s, estimated 2 bulk requests/min.
- Engine health 200, BALL46 proxy Engine health 200; Shadow live RPM 0 and no Shadow alarms in prior 20m.
- 20-minute Workers invocations/errors: BALL46 production 2265/0, Engine 2188/0, Full Market 274/**11**, Member 6/**2**, HUB 66/0. **Exceptions do not tell us provider 429 counts.**
- Deployed main version was `21c1519b-5874-412a-aea7-ebee2e057f46`, Engine `1f2336fa-7b45-4a23-a23c-06d01a92330d`, HUB `98ea43ab-f40c-4de5-82e3-b0387dffd672`.

## Next change (requires separate guarded Worker patch)
1. Add a small fixed-schema, redacted upstream call logger **inside active HUB and Full Market only**: UTC timestamp, job identity (non-secret User-Agent), path category (not key/URL query), status code, duration_ms, responseBytes, `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `Retry-After`, retry state, snapshot observedAt/stale.
2. Central global budget (40/min account shared) and coalescing after observing actual market call fan-out; priority to FT settlement. Count successful + 429 requests; never display a stale odds quote as fresh.
3. Validate public Edge Cache, conditional ETag/delta responses, backend last-good snapshot, member no-store privacy, browser LCP/INP on PC/mobile. Protect ledger immutability and existing frontend style/selection invariants.
4. Compare weekend 2026-10-31–2026-11-01 against John before considering a paid 5USD upgrade.

## Verified supporting evidence
- [Read-only baseline run](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40495229332)
- [Shadow 3.41 parked](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40472272560)
- [System roadmap and audit issue #370](https://github.com/mccareysupon-png/nomadtips3-live-test/issues/370)
