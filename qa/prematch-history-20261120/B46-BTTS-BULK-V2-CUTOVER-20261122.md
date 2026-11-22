# BALL46 — BTTS Ultra Bulk Truck V2 (TEST) — Cutover Registry
Date: 2026-11-22
Branch: `fix/ball46-btts-stats-registry-snapshot-test-20261122`
Test Worker: `ball46-prematch-only-test-20261120`
DO: `prematch-only-v1`
State: **ACTIVE ON TEST; LEGACY HUB-CACHED FIVE-ROUND CARGO TRANSPORT DISABLED WHILE ACTIVE**
Production: **NOT CHANGED**

## Decision
User approved adopting John Ellis's efficient bulk historical FT retrieval, conditional on real success, and stopping the old cached-HUB five-round history vehicle **after** the new route proved successful. This is limited to TEST until explicitly authorized for Production. Never confuse disabling the old *history import truck* with disabling score/settlement monitoring, the old HCR archive, or 1X2.

## John source contract (21 Nov 2026 email)
- 5USD Ultra includes every league, historical results since 2014, and Bet365 prematch prices.
- Fixture rows do NOT embed prior ten matches of both teams.
- Bulk season: `GET /v1/leagues/{id}/fixtures?season=...&status=finished&per_page=100`.
- Where league season metadata is unavailable, league `start_time/end_time` finished window (not limited to 24 hours) is supported; 5 successful bulk windows verified on 22 Nov.
- BTTS history from local FT scores; cache permanently, deduplicate by fixture ID; repeat yesterday daily once for late corrections.
- Bet365 BTTS is per-fixture: `/v1/fixtures/{id}/odds?market=btts`, request only for eligible candidates; `btts:null` means not offered.
- Account rate limit shared across live and other 5USD keys; 40 requests/min, Live has priority.

## Last verified real deliveries
1. Six-wheel per-team special: [run 44994421183](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44994421183): 16 paid requests, 85 team-match rows returned, 77 distinct new FT, private BTTS archive 20→97; five ready fixtures; 1 example BTTS quote not offered.
2. John bulk proof: [run 44995564511](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44995564511): five league bulk calls returned 500 FT (Italy Serie D, Greece Gamma Ethniki, Thailand Division 3, Spain Regional League, Türkiye 2 Lig Beyaz); 498 newly persisted in private archive; two additional BTTS quote probes both NOT_OFFERED; **7 total paid requests**. Original full responses preserved in GitHub artifact. One downstream audit logging variable failed after all writes; **do not rerun this provider batch**.
3. No-provider final proof: [run 44995706285](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44995706285) passed; private FT 97→595; 33 fixtures history-ready, 20 probability-ready, 17 awaiting quotes; HCR 1433 and 1X2 76 unchanged.
4. New V2 QA: [run 44996012102](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44996012102) passed for idempotent 4-hour slots, original payload storage, 5/day cap and quota guard.
5. Test Worker was deployed. The initial staging CI [run 44996147190](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44996147190) failed only on immediate postdeploy route 404 propagation, despite fully uploaded active modules; subsequent read-only [run 44996286563](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44996286563) confirmed active worker version `0f276292-1fd6-4585-887e-4b15617e86b7`, 200 owner routes, state STAGED, original modules preserved, 0 provider calls. Do not repeat deployment to resolve that old transient 404.
6. **Successful conditional cutover**: [run 44996385037](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44996385037) passed:
   - `/btts-bulk-v2-control` `activate` with proof run `44995706285`;
   - one real API request for **Italy Serie D page 2**, `100 received, 100 newly added`;
   - raw 100-row response verified from `/btts-bulk-v2-raw`;
   - BTTS private FT **595→695**;
   - upcoming=698, historyReady **33→43**, probabilityReady **20→24**, quoteRequired **17→21**, qualified=0 (no usable Bet365 BTTS quotes);
   - `/daily-mission` returned `HISTORY_DELIVERED_BOT_READY`, `transport=BTTS_ULTRA_BULK_V2`;
   - `oldTruckStatus=STOPPED_IN_TEST_BULK_V2_ACTIVE`;
   - HCR remained 1433, 1X2 ledger 76, stats registry audit verified, Production and HUB versions unchanged;
   - cutover automatically pauses and restores old truck only if its first real data validation fails; that failure path was **not** exercised.

## V2 runtime contract
Code: `qa/prematch-history-20261120/btts-bulk-truck-v2-test.mjs`, integrated in `prematch-only-worker.mjs`.
- Existing TEST Worker cron `*/15 * * * *` evaluates V2 time slots at 06, 10, 14, 18, 22 Europe/London.
- At most one *paid* 5USD bulk request per slot, five calls/day, 100 FT per request; 500 max/day. A SQL reservation is written before HTTP to eliminate retry-on-uncertain-result. If HUB health indicates errors/backoff, defer **before** paid request. On HTTP429, do not retry automatically.
- Select priority leagues from *actual scheduled Bot fixture teams*, focusing on missing 3–10 match histories. Cursor per league picks next page and avoids re-fetching page 1 of the five already imported proof leagues.
- Store complete original 5USD JSON in `b46_btts_bulk_v2_originals`; normalized finished results only in the isolated `btts_history_private_test`. HCR ledger and 1X2 never touched by the new importer.
- New TEST owner routes: `GET /btts-bulk-v2-state`, `POST /btts-bulk-v2-trip`, `GET /btts-bulk-v2-raw?day=YYYY-MM-DD&round=N`, `POST /btts-bulk-v2-control`.
- `bttsBulkModeV2.mode=ACTIVE` disables the legacy `importHistoryRoundFromCache` inside `runDailyMission` while preserving cached HUB settlement/monitoring and Bot ingestion. The old HCR database is NOT deleted.
- Emergency rollback: owner-only `POST /btts-bulk-v2-control` with `{"action":"pause"}`, which re-enables the old cache cargo vehicle in the next Daily Mission. Do not do this without a real failure or user instruction.

## Follow-up constraints
- New V2 **is active on the dedicated TEST Worker**, not Production.
- Monitor next distinct slots to confirm live cron advances rounds 2–5 and raw manifests; no need to manually re-run slot 1.
- Audit account-wide quota / shared Hub scheduling for any 429. One call every ~4 hours is low volume, but direct TEST credentials are not an atomic centralized rate-lease. Do not claim cross-worker atomic quota synchronization.
- High priority next functional gap: retrieve valid Bet365 BTTS prices for **qualified probability candidates only**; 21 currently await quotes. Never invent odds, and do not adjust BTTS probability/edge/EV thresholds without explicit approval.
- Unfinished long-tail historical coverage remains: only 43/698 upcoming fixtures are history-ready at first cutover, not all 698.
- Retain hard separation among BALL46 Live Predictions/Engine, Production 1X2/Statistics, test BTTS, HCR, and Full Cargo.

## 22 Nov 2026 — BTTS-only +2h schedule offset / 1X2 untouched
The user chose to focus on BTTS Bulk V2 while leaving the 1X2 car/bot/workflow alone. **Do NOT interpret this as approval to modify, disable, pause, shift or redeploy 1X2.**

- Modified **only** `btts-bulk-truck-v2-test.mjs` runtime logic in the existing TEST Worker.
- New BTTS request slots **08:00, 12:00, 16:00, 20:00, 00:00 Europe/London**, staggered two hours from the prior 06:00/10:00/14:00/18:00/22:00 time markers. 06:00–07:59 London is a **BTTS no-request window**. The accounting cutoff remains 06:00 London, so 00:00–05:59 belongs to previous business day and BTTS slot 5.
- Still **five** slots and **maximum five paid 5USD league-Bulk history calls** per business day, one per slot and max 100 FT rows each, provider response full original preserved. No additional team-based vehicle.
- Deployed BTTS-only module version `ac0338f3-9e32-453e-92ef-e3c70976f874`; main Worker source, 1X2, HCR, stats registry, Live and Production versions untouched.
- Dedicated tests passed: [run 44997046056](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44997046056).
- Initial deployment [run 44997128452](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44997128452) uploaded the code but immediately failed on old slot value during Cloudflare propagation; **do not retry deploy**.
- Independent no-provider production-route/post-propagation check **PASSED**: [run 44997191554](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/44997191554), installed source contains new offset and runtime slot 0 at London 07:xx, V2 ACTIVE, 1 historical request and 100 FT on Nov22, HCR 1433, 1X2 ledger 76, stats audit verified, **0 new paid requests**.
- Important: BTTS slot 1 of Nov22 was consumed *before* changing hours; do not trigger extra request to compensate. Subsequent eligible slot is 12:00 London. Never replay slot 1.
- Existing legacy HCR shared history importer remains gated in TEST while V2 is ACTIVE, as it was at original cutover; this edit **did not change or restore that path**. The 1X2 cached HUB score-monitor/settlement and Bot routes remain wired. Any future restoration of shared 1X2 historical archive requires a separate deliberate decision. Do not conflate this with 1X2 being disabled in Production.
