# BALL46 History Cargo Registry (HCR V1)
## ทะเบียนสัมภาระข้อมูลย้อนหลัง — Pre-Match TEST only

**System ID:** `HCR-V1`
**Worker:** `ball46-prematch-only-test-20261120`
**Source:** cached results from NOMAD 3.43 HUB /snapshot; **zero additional provider requests**
**Data store:** existing Cloudflare Durable Object SQLite, `prematch-only-v1`.
**View:** owner-authenticated GET `/history-cargo-registry` on the isolated TEST Worker. Not exposed in the public `/preview-data` response and never loaded by BALL46 site.

## 1. รถรับข้อมูลย้อนหลัง (History Cargo Vehicle)
The existing `history-five-rounds.mjs` remains responsible for at most 5 rounds, each at most 100 new FT fixtures, and at most 500 per London 06:00 accounting day. It is not five upstream API calls. Each round imports from an already-existing shared HUB cache. New Provider History Gateway remains disabled pending quota integration.

**Exact manifest storage:** one `prematch_history_cargo_manifest` row per completed trip, containing only a JSON array of imported Fixture IDs plus day/round/count metadata. Names, team IDs, league IDs, kickoff UTC and FT score are resolved from the original `result_version` archive **only when an admin requests them**. No duplicate match details are written, no per-fixture upload during the live cycle.

A round is marked `COMPLETED` only in the same SQLite transaction that writes its manifest. Empty trips receive a real empty manifest. Repeated runs are idempotent, and a manifest discrepancy is `REVIEW_REQUIRED` rather than silently treated as success.

**Historical limitation:** rounds completed before the first HCR deployment have valid counts but no per-round ID assignment. They are shown as `LEGACY_UNTRACKED`; do not invent or reattribute old fixture IDs to previous trips.

## 2. ทะเบียนตรวจคลัง (History Cargo Inventory)
Authenticated admin report includes:
- All recent round records: London accounting day, trip 1–5, source, attempted time, received/imported totals, provider-call count and manifest verification
- `fixtureIds` for HCR-tracked trips; detailed canonical league/team IDs, kickoff UTC and FT score when `detail=1`
- Archive inventory: number of finished fixtures and top historical league IDs
- Integrity signals: `TRACKED`, `LEGACY_UNTRACKED`, `REVIEW_REQUIRED`, `MISSING_OR_NON_FINISHED`

## 3. ใบประเมินข้อมูลที่ควรสั่งเพิ่ม (HCR Supply Planner)
The report checks the already stored upcoming-fixture list and existing FT archive. It returns:
- `uniqueTeams` — deduplicated team IDs with upcoming fixtures
- `priorityTeams` — up to 50 team IDs/names, existing history count (capped at 10), missing count to reach 10, number of upcoming fixtures, earliest relevant kickoff
- `priorityLeagues` — up to 20 league IDs grouped from the cached upcoming feed
- `highestPriority` — up to 20 fixture-level shortages
- `deduplicatedTeamMatchGaps` — aggregated missing **team-match histories**, NOT a count of unique missing fixtures, API requests, or how many matches to purchase

No ordering, requesting, charging, provider API call or automatic purchase is performed. The planner is **read-only** and supports a later explicit decision.

Upcoming league IDs from the normal HUB are now preserved for **newly merged fixtures**; old stored fixtures without league ID remain `null` until naturally refreshed. Do not backfill missing source metadata by guessing.

## 4. Access / security
Worker endpoint (owner authorization required):
- `GET /history-cargo-registry?detail=0` — counts, priority and per-round fixture IDs, no result details
- `GET /history-cargo-registry?day=YYYY-MM-DD&detail=1` — a specific London accounting day, including canonical archived FT match attributes
- Omit day for recent rounds (last 70 entries at most)

Production and the existing public BALL46 view have no new request for this report. The report cannot be accessed without a valid `OWNER_SECRET` bearer authorization. Never disclose a Cloudflare token or derived secret in a ticket, GitHub log, browser URL or client-side code.

## 5. QA / acceptance
- `node --test qa/prematch-history-20261120/history-cargo-registry.test.mjs qa/prematch-history-20261120/history-five-rounds.test.mjs qa/prematch-history-20261120/hub-upcoming-feed.test.mjs qa/prematch-history-20261120/stored-prematch-feed.test.mjs`
- Test 5-round caps, empty trips, retry idempotency, legacy/no false history, canonical joins, league field preservation and deduplicated team shortages
- Compare protected `ball46-production`, `nomadtips3-engine-343`, `nomadtips3-5usd-hub-343` version IDs before and after any TEST release
- Confirm `/history-cargo-registry` without authorization returns 404 and `providerCalls=0` for admin responses
- HCR should never run on production/public routes unless explicitly separately approved

**Installed modules:** `history-cargo-registry.mjs`, integration in `history-five-rounds.mjs`, owner-only route in `prematch-only-worker.mjs`, league-preserving `hub-upcoming-feed.mjs` and `stored-prematch-feed.mjs`.
