# BALL46 multi-source results — NEXT STEP execution findings (2026-10-17)

## Execution: read-only staging only
- Staged immutable canonical fixture registry: `integrations/result-provider-router/fixture-registry.mjs`.
- Staged tests: `integrations/result-provider-router/test/fixture-registry.test.mjs`.
- Combined result router + identity registry test: **41/41 PASS** in [GitHub run 39039542050](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39039542050). Test runner did not deploy or write.
- Runtime/ledger diagnostics: [GitHub run 39039638149](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39039638149). All runtime queries GET only.
- Active-script fingerprint diagnostics: [GitHub run 39039854184](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39039854184). Cloudflare API calls GET only.

## Verified actual production version and scope
- Cloudflare Worker: `nomadtips3-engine-343`.
- Currently active deployment, as observed: `1c813fd8-7b0d-4d86-8482-ceb2797471e0` at `2026-10-17T13:53:19.820503Z`.
- **100% active version:** `9b363777-64fc-4a48-a10a-0fad822640cb`.
- Runtime-reported version: `nomad343-engine-v5-best19-referee`, not historical v3 repository source.
- Downloaded current Worker script **read-only into memory within the GitHub runner**; multipart content was 105,683 bytes, SHA-256 `39e3b01bba07de1ef705f4c09bef90d1f66555c9de79c2b14ce877652ecfbccf`. This was only fingerprinted and discarded, **not committed**.
- Script fingerprints contain `PENDING`, `SETTLED`, `finalScore`, `settlementRevision`, `settlementBasis`, `DurableObject` and `ctx.storage`; string probes did **not** find `kickoffUtc`, `sourceFixtureId`, `sourceIds` or `Goaloo`. These are text-search observations, **not** proof that no equivalent alias/storage design exists. CF bindings reported one durable-object namespace, one secret and two service bindings by *type only*; no secrets or binding values were exposed.

## Real missing metadata
At `2026-10-17T14:10:55Z`, readonly live snapshot:
- Engine `/signals` returned **31 PENDING signal records** spanning **23 distinct fixture IDs**.
- Current live Hub `/snapshot` and Engine `/board` returned 602 fixture rows, all with kickoff UTC.
- **21/23 PENDING fixture IDs were absent from current Hub**. Engine `/board` recovered 0 of those 21 missing IDs.
- Exact two formerly observed FT IDs `201654042` and `202917416` remain PENDING and do not have `kickoffUtc` in signals nor matching current Hub/board fixture rows.
- The public main site `/api/engine/statistics?paged=1&limit=1` returned 500 rows by its own pagination and contains both example pending IDs but still no kickoff field.
- `/api/engine/history?limit=500` returned HTTP 400 in this query shape; **not** evidence that history does not exist.
- `/health` version: `nomad343-engine-v5-best19-referee`; `/snapshot` Hub version: `nomad343-5usd-hub-v6-viewer-cache-only`.

## Design consequence
**Do not rely on rolling Hub or live board to identify completed fixtures.** Introduce a durable *fixture identity register* before settlement. Persist original Ball46 fixture ID, 5USD provider fixture ID when independently validated, home, away, league, unambiguous kickoff UTC, verified Goaloo ID and future providers' IDs, first-seen time, mapping provenance and policy versions. New provider mappings cannot be accepted solely on team-name similarity.

The registry reducer is pure/read-only; it proves immutability, alias and collision gates but **does not yet write to the active Durable Object**, and cannot retroactively repair past lost kickoff metadata.

## Next production-engineering change (not made)
1. Establish exact source ownership of active version `9b363777-...` and retain pre-change rollback reference according to `.github/BALL46_PRODUCTION_FIREWALL.md`.
2. Add a durable fixture registry to the current Engine343 Durable Object or an explicitly authorized adjacent durable store. Register fixtures during primary 5USD feed processing, before source disappears from cache; never change live odds/selection engine logic. Implement bounded retention and collision alerts.
3. Add independent score-only adapters: 5USD and Goaloo; provider policies require verified timezone, verified league mapping, strict match IDs, FT regulation-score scope and required stable observations. Additional providers plug in through the normalized `FT_SCORE` contract.
4. Implement **a true atomic PENDING settlement claim** in the actual production store and use the existing engine settlement judge. Add idempotency and conflict audit. Verify no duplicate Units/Win Rate or Corners settlement from goals.
5. Shadow with real mapped fixtures, simulate parallel source arrivals, and prove full existing Statistics/Member continuity. Hold wrong/ambiguous matches.
6. Handle existing 21 missing-fixture IDs in separate historical recovery using verifiable original primary fixture metadata or other approved independent identity source; do **not** fabricate kickoff dates or force match by team alone.
7. Perform protected Production deployment only after explicit approval, actual source verification, tests, backup and rollback.

**Decision:** Continue work on preparation branch. **Production deployment: NO-GO** until the durable mapping, real identity, and native atomic settlement integration gates pass.
