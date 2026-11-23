# BALL46 — PRE-MATCH O/U ENGINE V1
Date: 23 Nov 2026
Scope: second independent engine for Upcoming / Waiting football matches **BEFORE LIVE**.
Status: **TEST deployed and active**. Reads real HUB /snapshot and the existing Full Market service every 15-minute TEST scheduled cycle; original V2 scheduled scan replaced to avoid duplication. This is a separate logical screening engine inside the isolated Prematch TEST Worker, not a second standalone Worker. LIVE/Production/HUB/Full Market worker versions untouched.

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


## Operational activation — 23 Nov 2026

- User explicitly authorized "ตั้งเครื่องต่อสายทำงานได้เลยครับ ในชุดทดสอบ"; deploy isolated TEST only.
- Guarded deploy https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45171244822 SUCCESS. Worker `ball46-prematch-only-test-20261120` version `a251c251-6d59-48dc-97d8-7b50e9c49c14`; from `790a4965-5053-41f0-8bec-bc4bcf98f43d`. Modules 30→31; existing 29 non-main modules byte-identical; only main wiring changed + isolated engine module added. Production, Engine, HUB, Full Market and test frontends verified byte-version unchanged.
- Internal scheduled cron remains `*/15 * * * *`. `ctx.waitUntil` drives an independent internal POST `/prematch-ou-engine-tick`, so it can run even if the existing `/daily-mission` early exits. Prior V2 cron POST `/ou-value-v2-run` is removed from scheduled path to prevent duplicate V2 screening; that owner route remains for controlled diagnostics. The legacy O/U 2.5/V1 cron remains unchanged and shares existing request cap.
- Owner-only GET `/prematch-ou-engine-state`: saved last run, cursor, strict policy, shared quota and shadow ledger count. POST `/prematch-ou-engine-tick`: explicit on-demand test run. Both are isolated TEST only. No new 5USD key or standalone upstream API.
- First authenticated real-data smoke https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45171427444 **SUCCESS**. Read cached HUB snapshot (timestamp 1795435703443), received 1,832 rows; 23 eligible Upcoming/Waiting pre-match matches accepted, 1,795 already LIVE excluded; 8 of 23 had enough historical data for Poisson value model. Existing Full Market cache held one of the 8 fixture IDs but **zero authentic side-specific O/U decimal quotes**, so **zero new V2 shadow predictions**. Historical model calculated correctly; absence of quotes is an external price availability/coverage blocker, not a fabricated selection.
- Shared O/U 5USD budget: London accounting day 2026-11-23 used=1, remaining=0 at first smoke. Test run added **zero** provider calls, and no price pickup attempted due existing cap. Pre-match V2 price pickup is still permitted via only the original guarded Full Market /fixture-odds, with one combined attempt per London day, a constraint user has not explicitly authorized increasing.
- **Do not claim price/full E2E trading prediction proven.** The engine is activated and screens real HUB fixtures, but the Full Market side payout route for Upcoming fixtures needs an actual cache hit or future allowed request and shape verification. Screen every 15 minutes regardless of daily price request count; the price-retrieval quota does not gate model screening.
- Real first smoke diagnostics: `status=SCREENED_PREMATCH`, `scan.checked=23`, `scan.modeled=8`, `scan.cacheHits=1`, `scan.pricedFixtures=0`, `locked.added=0`, `priceBridge.state=DAILY_SHARED_OU_CAP`, `liveEngineCalls=0`, `productionWrites=0`.
- Next proof: verify on the same exact Upcoming/Waiting fixture visible in the app Full Market that it actually provides bookmaker-specific `goal_line` or `goal_line_fixed` with both numeric `over`/`under`, not merely a goal threshold. No further deployments or new endpoint until the existing route is inspected.
