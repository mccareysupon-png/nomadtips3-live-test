# BALL46 — Pre-Match O/U Odds: handoff for 23 Nov 2026

Status: **PAUSED BY USER**, 22 Nov 2026. Resume only after user returns; no autonomous production deploy or paid API calls.

## Confirmed observations (read-only; no new paid provider calls)
- Source: isolated TEST worker `ball46-prematch-only-test-20261120`, 5USD HUB cache, `/history-cargo-full` records. GitHub audit: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45036569114
- Full Cargo has 5 rounds x 100 = 500 cached fixture records on 2026-11-22.
- The deep audit sampled 50 full raw fixture records: **50/50** had `providerOdds.odds['1x2'].closing` (home/draw/away) AND `providerOdds.odds.goal_line` (opening/closing/inplay).
- IMPORTANT: `goal_line.opening`, `goal_line.closing`, `goal_line.inplay` are **goal lines** (e.g. 3.25, 3.25, 2.5), **not O/U decimal payout odds**. No Over/Under side-specific payout quote was found in the 50 reviewed fixture objects. This is a sampled finding, not proof that the upstream provider never has payout prices.
- The active `hub-upcoming-feed.mjs` extracts only `providerOdds.odds['1x2'].closing` and stores `storedHub1x2`; `stored-prematch-feed.mjs` accepts BTTS and 1X2 odds keys, not O/U price keys. So the snapshot currently yields a goal line but not verified Over/Under payout prices.
- Historical separate provider quote route mentioned in prior research: `/v1/fixtures/{id}/odds?market=goalline` and `market=goalline_fixed`. **Verify supported request/response shape and quota requirements against provider documentation before making any call.** An O/U quote request may count toward paid/shared quota.

## O/U model and UI already in TEST
- `ou-poisson-shrinkage-2p5-v1p1-available-history`: model-only Over/Under 2.5 based on available 0–10 historical matches per team, at least 1 combined; league prior shrinkage; minimum selected-side model probability 64%; no fabricated quote, ROI, or P/L.
- Earlier observed after policy update: screened 167, history usable 26, qualified and issued 1 (UNDER 2.5, PENDING; estimated 67.19%); archival chronological simulation 750 games, 9 qualified, 5 wins/4 losses (55.56%; insufficient sample, not tradable backtest).
- O/U ledger and incremental Snapshot are separate, with FT settlement/idempotency. Combined Predictions shows one fixture card; separate Pre-Match Statistics > Over/Under screen. Pre-Match Total is **1X2 ONLY**, excluding both BTTS and O/U.
- Chronological Predictions TEST UI completed: LIVE latest first; upcoming nearest kickoff first; awaiting update; finished latest first; league no longer forces regrouping. Browser QA https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45035985598.
- TEST frontend: https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=predictions
- **No production deploy authorized.** Protect Production, Engine 3.43, HUB, existing 1X2 and BTTS formulas, existing history cargo/5-trip caps.

## Next steps — only when user says resume
1. Recheck CURRENT active TEST worker versions and new data, including stored market keys and O/U pricing availability, rather than assuming 22-Nov observations still apply.
2. Verify 5USD API documentation & quota: whether `market=goalline` or `goalline_fixed` returns verifiable side-specific Over and Under payout prices; exact market lines, bookmaker, observed time and match identity.
3. Prefer cache reuse or previously obtained original odds payload where possible; do not spend new 5USD calls merely to inspect. If necessary, devise a **bounded TEST-only pickup for qualified O/U fixtures**, using the **same** shared quota authority and history transport policy; avoid full-fixture expensive polling.
4. Store quote as separate immutable O/U price observation (fixture ID, pre-kickoff time, bookmaker/source, line, Over/Under decimal prices). Never confuse `goal_line.closing` with a payout price. Reject missing/stale, post-kickoff, line-mismatched, unverified quotes.
5. If user authorizes a quota-safe pickup: add test-only pricing, correct Asian O/U settlement for 2.0/2.25/2.5/2.75/3.0 if lines vary, and P/L only for honestly priced outcomes. Keep probability-model backtesting distinct from price-aware ROI.
6. Verify end-to-end on TEST: qualifying pick -> quote (if available) -> issued ledger -> FT settlement -> incremental Snapshot -> both UI pages, with repeated-run idempotence, PC/mobile QA and unchanged protected worker versions. NO automatic Production deployment.

Important user decision: **Save now and resume tomorrow (23 Nov 2026).**


## 23 Nov 2026 — source-confirmed price contract and TEST parser (NOT DEPLOYED)
- Official API documentation https://5dollarfootballapi.com/docs confirms `GET /v1/fixtures/{id}/odds?market=goalline_fixed` supplies Bet365 `bookmakers[].odds.goal_line_fixed[]`, including line 2.5, `closing: {over,under}` if quoted. `market=goalline` supplies the moving main `goal_line.closing` with `{line,over,under}`.
- In a pre-kickoff fetch, `closing` means the latest currently available prematch quote, NOT the eventual price at kickoff. A null fixed `closing` signifies withdrawn quote. No per-quote recorded timestamp is available on this snapshot endpoint: trusted receipt time must be captured locally.
- Implemented pure O/U 2.5 parser `qa/prematch-history-20261120/ou-verified-price-ingest-v1-test.mjs` and ten offline deterministic QA cases `ou-verified-price-ingest-v1.test.mjs`. Requires named Bet365 bookmaker, exact fixture ID, target 2.5, both decimal prices, trusted receipt pre-kickoff; rejects numeric HUB line-only prices, another O/U line, stale/past kickoff, withdrawn prices and unknown bookmaker.
- Offline GitHub Actions SUCCESS: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45078216341. 10 tests, no provider calls, no Worker deploy and no credentials in QA workflow.
- Status: parser committed on TEST branch only; no automated quote pickup, TEST Worker deployment, priced P/L or Production changes yet. Do not claim O/U market payouts imported.
- Next: inspect CURRENT TEST versions; reuse preexisting paid responses if present, otherwise design guarded quote retrieval ONLY for qualified O/U fixtures using shared account quota authority. Never secretly spend provider calls or borrow BTTS daily slots. Persist evidence/received-at before kickoff, then separately validate ROI and P/L with properly priced results. Model-only ledger remains valid and immutable.


## 23 Nov 2026 — TEST quote pickup deployed and executed
- TEST backend worker `ball46-prematch-only-test-20261120` current verified deployed version `ebf8f95e-4379-4cae-9b27-aeea9c87b13d`, 26 modules. ORIGINAL HUB, Engine, Production and TEST frontend worker versions unchanged.
- Owner-only GET `/ou-price-pickup-state` and POST `/ou-price-pickup-tick` active. Existing `*/15 * * * *` Cron invokes guarded O/U price tick; maximum 1 5USD quote request per 06:00 London accounting day; claimed and counted before network request; no retry even for failures or unavailable prices. Only already-issued O/U 2.5 picks, valid fixture/team identities and pre-kickoff quotes, using `/v1/fixtures/{id}/odds?market=goalline_fixed`.
- This is a TEST-only conservative direct provider call, with verified HUB quota health gating (10s LIVE refresh allowed only when HUB `bulkSpeedV3.quotaObserved=true` and `accelerationAvailable=true`, account limit 40/min); **not** an atomic shared Hub quota reservation. Quote fetch must never be represented as quota-coordinated with all other Workers.
- LIVE first pickup 23-Nov-2026 Bangkok / 22-Nov London accounting day: fixture `204902306`, state `PRICE_NOT_OFFERED`, providerCalls `1`, provider rate remaining `37`, no verified Over/Under payout quote imported; pre-match model pick stays `PENDING`, price `null`. Immediate second manual tick returned `DAILY_QUOTE_CAP`, providerCalls `0`. Quotes will be retried for **different** eligible fixture only on later London business day (same fixture never retried).
- O/U Stats: six issued model-only picks, 0 priced, 1X2 Ledger 91 rows at verification. BTTS project remains CLOSED by explicit user directive. No impact to original 1X2 / BTTS model and shared Live Engine.
- Active postdeploy guarded QA success: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45081651933 ; pure pickup SQLite QA: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45080734651 ; 10s quota module deploy QA: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45081578543.
- O/U pickup request log and verified quote ledger persist separately. FT settlement was enhanced to compute real selected-side decimal-odds units only on pre-kickoff priced picks; historical unpriced picks remain unpriced. Incremental O/U Snapshot still used; no historical ROI invented.
- Follow-up: monitor pricing success from later qualified fixtures; if many `PRICE_NOT_OFFERED`, inspect provider coverage and endpoint response shape from already obtained evidence before increasing calls. Do NOT increase beyond 1/day or touch Production without explicit authorization.
