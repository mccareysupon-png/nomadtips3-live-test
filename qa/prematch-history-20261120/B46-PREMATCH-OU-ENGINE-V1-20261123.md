# BALL46 — PRE-MATCH O/U ENGINE V1
Date: 23 Nov 2026
Scope: second independent engine for Upcoming / Waiting football matches **BEFORE LIVE**.
Status: core module implemented and offline QA completed. **NOT DEPLOYED / NOT CONNECTED TO HUB OR CRON**. No LIVE or Production modifications.

## Authority and positioning
- Existing NOMAD LIVE Engine 3.43 stays sole LIVE / in-play screening engine. Never put slow bookmaker price fetch on the HUB viewer read path or inline in the LIVE engine loop.
- 5USD HUB snapshot is the canonical match status/time/identity authority. PRE-MATCH engine observes HUB's cached upcoming fixture inventory as a separate subscriber/Worker under the same infrastructure, not a blocking intermediary.
- Existing Full Market service `nomadtips3-full-market-343-ball46` is the *sole* price transport. Use the same provider bridge and parser input as BALL46 application. Do not build a second bookmaker API client or use a second API key.
- Prior to LIVE: `HUB.cachedUpcoming -> preMatchStatusGate -> historicalResults -> model(lambdaHome,lambdaAway) -> FullMarket quote -> all-line AsianEV -> locked O/U shadow prediction`.
- At LIVE transition: close the pre-match candidate; keep immutable previously locked selection. LIVE engine continues normally, without inheriting stale price or creating a duplicate pre-match prediction. FT settlement to be connected to a separate Pre-Match O/U accounting stream later.

## Acceptance / status gate
1. Input may contain actual provider status `scheduled` or UI's Upcoming/Waiting, if explicitly known pre-match and future kickoff. **UI label and provider status mapping still needs live payload verification.** Never infer pre-match from a missing or unknown status.
2. Reject LIVE/INPLAY/HT/FT/FINISHED/POSTPONED/CANCELLED/UNKNOWN, invalid fixture IDs, mismatched home-away identity, no real kickoff, match already within 300s of kickoff, or beyond existing V2 lookahead.
3. Do **not** gate candidate inclusion on available 1X2 odds; old `hub-upcoming-feed.mjs` did and silently omitted otherwise valid O/U candidates. This new engine uses a *separate* status-only adapter; the legacy 1X2 feed remains untouched.
4. Check 500+ fixtures with a rolling cursor, up to the tested V2 `350` per screening pass, without extra provider calls for the historical data already archived.
5. Persist only *first* issued V2 selection per fixture ID. Re-check nonissued upcoming fixtures on next scheduled snapshot; don't reconsider after LIVE begins.

## Existing components reused — no duplicated math or vendor
- Core: `prematch-ou-engine-v1-test.mjs`.
- Status adapter: `upcomingWaitingFromHub`.
- Statistical goals engine: **existing** `buildOuValueModels` / `screenOuValueV2` from `ou-value-screener-v2-test.mjs`.
- O/U Asian line parsing: **existing** `extractFullMarketOuOffers`, supports both moving `goal_line` and fixed `goal_line_fixed` for the existing Full Market recognized bookies; current mapping is 19 bookies, so compare actual app list before claiming truly universal support.
- Market selection: **existing** `chooseBestOuValue`, all offered quarter/half/full goal lines, both sides, **decimal odds strictly > 1.50**, **expected profit EV >= 0.05**, one highest positive EV selection for each fixture, fixed at capture time.
- Output: **existing isolated** `b46_ou_value_v2_shadow_test` via idempotent `recordOuValueShadow`; no newly proliferated shadow ledger.
- Quote source `/board-cache` first. Missing quote stays waiting; **no raw network call by default**. Authorized fallback (off until explicitly enabled) reuses `captureOneValueV2Price` which calls Full Market `/fixture-odds?fixtureId=...` through HUB after quota gates; current V1+V2 shared limit is **one price attempt per London day**. The current limit is NOT sufficient to price all 350+ candidates by itself and must not be quietly raised. Shared 5USD account capacity gate is best-effort, not an atomic HUB reservation.
- Existing 1X2 / BTTS / LIVE / history-transport / Production untouched.

## Real-data gates before activating TEST cron
A. On the **same real fixture ID** visible in BALL46 Upcoming/Waiting Full Market, inspect an **already-cached** response or one explicitly quota-authorized request: provider fixture ID, actual bookmaker slug, goal line and BOTH Over and Under decimal payout, pre-kickoff observation time. Distinguish `goal_line=2.5` marker from decimal payout.
B. Verify app's click route and this engine's bound Full Market route return equivalent actual bookmaker price data for that same fixture. If app has it and engine cannot parse it, fix the mapping/shape — not the math, not a new API.
C. Prove HUB status `waiting`/Upcoming-to-provider normalization with real current payload, and confirm no 1X2 price gating.
D. Confirm a safe account-wide quota authority before any recurring paid Full Market prewarm; quote screening remains cache-only by default. For high coverage, need queue + shared atomic reservation, dedupe/cooldown and account-cap protection. This is distinct from model-screening cadence; polling the model must never imply a paid provider request each time.
E. Enable a single **TEST** scheduler (not duplicate the existing V2 run): use one producer for upcoming universe and one O/U screening pass, with candidate cursor. Verify repeated scans, last price captured, first immutable pick, LIVE stop, FT result flow, browser PC/mobile; then seek explicit Production authorization.

## QA
- Core offline tests: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45169895158 — 8/8.
- Existing Asian O/U screener regression 9/9, existing price bridge regression 6/6, all within same run.
- No 5USD provider call, no Worker deploy, no production writes.
- Source: `qa/prematch-history-20261120/prematch-ou-engine-v1-test.mjs`; tests `qa/prematch-history-20261120/prematch-ou-engine-v1.test.mjs`.
