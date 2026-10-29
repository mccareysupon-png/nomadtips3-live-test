# BALL46 Performance Snapshot V1 — isolated test only

**State: engineering candidate, NOT deployed.** The files in this folder do not replace production assets. They are independent of the main Worker, Engine 3.43, Member, Signal, Event Flow, 5USD HUB and settlement system.

## Nonnegotiable invariants

1. **Source of truth** is `https://www.ball46.com/api/engine/statistics` — never the raw 5USD provider. Paged ledger is read only with GET.
2. **Actual source rule:** `Europe/London` and cutoff `06:00` in *current active production runtime*. Do not substitute an 08:00 display label without explicit, separate business-rule approval.
3. **Canonical visible card metrics:** WIN, LOSS, PUSH, PENDING, WIN RATE, AVG ODDS (today and yesterday), including HALF_WIN / HALF_LOSS and odds on pending, as verified against active runtime. Markets are only a test calculation and are not in the public V1 envelope.
4. **Dedicated storage:** NEW isolated D1 database `ball46-performance-snapshot-preview-only` and table `performance_snapshot_v1`. **Never** bind existing BALL46 / Member D1.
5. **No traffic on user GET:** `GET /api/performance/snapshot` reads only D1; does not call the ledger, provider, Hub, or Engine.
6. **Only scheduled background updater** reads the existing public ledger endpoint. Its `head()` is one paged request, then `pages()` runs *only* if ledger changed, 5 minutes elapsed, or London day changes.
7. **Fail closed:** Missing snapshot, older than six minutes, wrong day, bad schema, incomplete pages, mismatched revision across pages, repeated cursor, failed read or missed schedule ⇒ 503, not fabricated zeros. Future browser patch must preserve existing fallback until demonstrated safe.
8. **Single writer and monotonic writes:** D1 conditional UPSERT only accepts a strictly newer generated timestamp and nondecreasing ledger update timestamp. Race-safe without changing Production.
9. **Source payload never persists:** Keep raw pick rows in process memory for one page only. D1 stores a compact daily aggregate JSON. No raw ledger in logs, artifacts or repository.
10. **No production deploy:** This folder has no deploy workflow, real D1 ID or live route. The preview config has `workers_dev:false`, `preview_urls:false`, and a placeholder D1 ID.

## Logical architecture

```text
Existing BALL46 engine ledger (GET only)
         |
      HEAD paged -> skip if same ledger revision and date; otherwise:
         |
       Pages (500 rows) -> revision checks -> streamed accumulator -> validated daily summary
         |
       Dedicated D1 preview (monotonic UPSERT, new table)
         |
GET /api/performance/snapshot  -> short response -> browser (future adapter)
                             (503 for stale / invalid; use legacy fallback in browser)
```

The 5-minute schedule is provisional. Given current ledger size (~39 MB unpaged) this avoids recomputing per viewer, but its cost, CPU and freshness must be validated on an actual preview before selecting a final cadence. Never advertise sub-second Production latency based on local simulation.

## Release gate — blocking

1. Pass ALL offline units including London daylight saving, ledger cursor drift, old-snapshot behavior, D1 monotonic writes and disabled mutation routes.
2. Pass latest read-only full-ledger parity vs exact currently active card runtime, zero differences for *visible* fields. Market-family calculations not independently parity-certified.
3. Establish a **new** preview-only D1 DB/Worker with explicit approval; run D1 migration only on that dedicated DB, without touching Production.
4. Browser-load preview (desktop + mobile) using same DOM/paint semantics and normal network, measure p50/p95 first paint, successful reads, cache misses, refreshes and 503/fallback paths.
5. Compare active Production version and static assets to the published version; resolve any asset-module hash vs served-HTML mismatch. Do not use `main`, archived `index.html` or old branches as an asset source.
6. Future production application must be an allowlisted, minimal **active-Worker-based** patch: only scoped card routing/reading. Confirm unchanged main Worker code, engine routing, cron, bindings, assets, Member and all other static paths.
7. Validate fresh source version again **immediately before any write**, and abort on unexpected change. Do not overwrite a newer deploy.
8. Backup active version ID, module hashes, routing metadata and complete current manifest. Roll back only if current active version equals our candidate; NEVER overwrite concurrent other-owner deploy.
9. Release only by user-authorized explicit step after preview passes. This branch's CI is test-only and must NOT have a deploy job.

## Current known blocker

Production read-only audit 2026-10-29 confirmed **three different views**: Version `assets/index.html` module 194,656 bytes, direct Worker served 453,957 bytes, custom domain served 456,429 bytes. The card runtime SHA was equal across served origins. The public domain contained two extra script blocks relative to direct Worker (one is Cloudflare Web Analytics beacon, the other is a 2,022-byte dynamic inline script). Thus static module SHA must **not** be compared directly with live rendered HTML as if the asset alone were the response. A source-aware deployment method must preserve current Worker synthesis and edge instrumentation.

The Cloudflare API token available to the GitHub read-only inventory returned HTTP 401 for D1 listing. New **remote** dedicated D1 cannot be provisioned or verified with current accessible credentials; do not reuse member or production D1. The dedicated local Wrangler D1 database is independent and can be tested without Cloudflare credentials.

Local runtime initially revealed pinned Wrangler 4.92 supported compatibility dates only through 2026-05-22, so the local emulator config uses that date only; production compatibility is unchanged. Subsequent local scheduled tests found live-ledger consistency changes while paging; tests fail closed while investigating this before using a remote Worker.

## Commands for local CI

```sh
node --test isolated-labs/ball46-performance-snapshot-v1/*.test.mjs
node --check isolated-labs/ball46-performance-snapshot-v1/preview-worker.mjs
```

The workflow `.github/workflows/ball46-snapshot-v1-test-20261029.yml` checks unit tests and can re-run read-only Ledger parity. No secrets are stored in this folder.

## Latest stage-local proof — 2026-10-29 04:13 UTC

- A fresh **Wrangler local Worker and local D1 migration** was actually exercised in GitHub Actions run `40816493059`. This was not a remote Cloudflare deploy.
- The simulated scheduled event successfully read the live Production Ledger, built the compact daily Snapshot, and persisted it in isolated local D1 in 8.6 seconds, with 10,921 ledger rows.
- Missing-snapshot 503, disabled mutations, and 200 JSON after generation passed. Response payload was **549 bytes**.
- Seven Chrome requests on each desktop and mobile passed: local desktop p50 8 ms/p95 33 ms; local mobile p50 6 ms/p95 8 ms. **These are local API/browser measurements, NOT end-to-end production page load times.**
- The local Worker exposed a platform-specific `redirect:'error'` incompatibility, fixed to `redirect:'manual'` with redirect status refusal. A transient ledger paging revision mismatch was also observed in one run and correctly failed closed; a subsequent run consumed a coherent revision and passed.
- Preview resource GET-only preflight run `40816111675` confirmed the dedicated script name was unoccupied, but the token returned **HTTP 401** on D1 inventory. **Do not attempt remote D1 creation with this access; obtain appropriate scoped Cloudflare permission in GitHub Actions first.**
- Current Production rendered HTML is synthesized/modified at serving time; direct Worker and custom domain have different dynamic wrappers, while the card runtime matches. Keep the production release gate blocked until a method preserving the exact active Worker plus all Cloudflare edge additions is proven.
