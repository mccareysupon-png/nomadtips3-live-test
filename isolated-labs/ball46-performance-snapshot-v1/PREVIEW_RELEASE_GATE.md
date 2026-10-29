# BALL46 Snapshot V1 — Remote isolated preview release gate (2026-10-29)

**STATUS: BLOCKED for live Cloudflare deploy.** Last GET-only preflight returned HTTP 401 for `GET /accounts/<ACCOUNT>/d1/database`, while the preview Worker name was unoccupied. No remote Worker or D1 database has been created by this workflow.

## Intended remote preview (no BALL46 domain routing)

- Dedicated Worker **`ball46-performance-snapshot-preview-only`**, only on its own **`workers.dev`** URL. `workers_dev=true`, `preview_urls=false`, no `routes`, no custom domain, no service bindings, no main Worker code.
- Dedicated NEW D1 **`ball46-performance-snapshot-v1-preview-only`**, bound only as `SNAPSHOT_DB`. Never reuse BALL46/Member D1, KV or other data sources.
- GET `/health` and `GET /api/performance/snapshot`, with `X-Robots-Tag: noindex`. Only the sidecar Cron may call the existing BALL46 statistics API. Browser reads never call full Ledger.
- A five-minute preview Cron is **provisional**. At ~22 pages × 1.8MB, continuous full refetch could exceed **10 GB/day** if ledger updates every cycle. Keep remote testing time-bounded and monitor request/CPU/D1 budgets before deciding a production cadence.
- Client `card-shadow-bridge.mjs` is strictly **read-only** and explicitly refuses to replace the card. The live card's market breakdown AH/O-U/1X2 remains **uncertified** by parity tests; integrating a partial snapshot would risk hiding existing fields.

## User-admin action required: grant preview-only credentials

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token → Create Custom Token**.
2. Account permissions for exactly the BALL46 Cloudflare account: **D1 Read**, **D1 Edit**, **Workers Scripts Read** and **Workers Scripts Edit** (names in UI may use Read/Write variants). Avoid Zone DNS, Zone Rules, KV, Account-wide superuser or Global API Key permission.
3. GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**. Name: **`BALL46_SNAPSHOT_PREVIEW_TOKEN`**. Store the token *there*, not in chat or repository files.
4. Preserve the currently configured `CLOUDFLARE_API_TOKEN` for other automation; do **not** replace it.
5. Cloudflare API tokens often scope D1 permissions at **account level**, not to a single database. Therefore the deployment script MUST additionally guard the exact Worker and D1 names and refuse collisions/mutations on anything existing.

Until the token is connected and GET checks for D1 access pass, **STOP** before any POST/PUT/deploy.

## After authorization — staging checklist

1. Run GET-only D1/Worker name inventory using the **new token**. Require both names free; abort on 401/403, collisions or account mismatch.
2. Fresh checkout of `work/ball46-performance-snapshot-v1-20261029`; rerun isolated unit tests, dry-run bundling, and current Production active version + source manifest audit. Abort if production changes during the preflight.
3. Create **only** the dedicated D1 Preview database and verify its returned UUID/name. No existing DB migrations.
4. Apply `migrations/0001_snapshot.sql` via Wrangler `d1 execute --remote` **only to the new UUID**.
5. Generate config via `remote-preview-config.mjs`, verify no `routes` or custom domain. Deploy **only** `ball46-performance-snapshot-preview-only` using Wrangler and the preview-only credential.
6. Verify public URL hostname begins with `ball46-performance-snapshot-preview-only.` and ends in `.workers.dev`. Never set routes on `ball46.com`.
7. Verify health, initial missing-snapshot 503, scheduled snapshot completion, shape, rolling freshness and consistency, HTTP 200 performance across 20–50 browser requests over actual internet, and failed source retry behavior.
8. Check overall Cloudflare API reads per update and total resource quota. Disable the isolated preview cron after bounded tests if needed.
9. Run shadow-only comparison of the actual BALL46 card with the Snapshot while leaving the legacy card read/refresh untouched.
10. **Production remains blocked** until full market counter parity, correct day cutoff and exact live-worker asset provenance are confirmed. Never reconstruct production HTML from `assets/index.html` alone.

## Evidence already available

- Local Wrangler + local D1 + Chrome smoke passed: GitHub Actions `40816493059` (local API p50 ~8ms desktop / ~6ms mobile, payload 549 bytes; this is *not* internet latency).
- Remote-config Wrangler **dry run** passed: GitHub Actions `40818047378`, bundle ~21 KiB, no uploads.
- Cloudflare D1 permissions preflight **blocked**: Actions `40816111675`, D1 inventory 401.
- Full statistics metrics parity passed previously; the stricter market-family parity gate has **not** passed: Actions `40817783934`.
- Main site direct/html mismatch is partly explained by Cloudflare edge-injected Analytics and request-dependent inline script, but must not be treated as a byte-exact version artifact.

**No remote Cloudflare writes and no Production deploy are authorized merely by running these GET-only checks.** The operator must explicitly authorize the isolated staging write after credential checks pass.
