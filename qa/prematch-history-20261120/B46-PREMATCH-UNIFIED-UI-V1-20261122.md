# BALL46 Pre-Match Unified UI V1 — TEST ONLY
Date: 2026-11-22
Scope: **existing** `ball46-premium-match-colors-test-20261120` frontend and `ball46-prematch-only-test-20261120` backend only. NOT BALL46 Live/Production/1X2 engine/5USD transport.

## Decision, user-approved 22 Nov
**One Pre-Match football-prediction product**, independent 1X2 and BTTS Bot/history/quotes, **same issuance registry**, four views within the existing website:
1. Predictions: chronological issued picks from **both** markets. A fixture may have two distinct market selections; display one match card with separate market lines. Screens of pre-price/shadow BTTS candidates do **NOT** count as picks.
2. Statistics > Total / All: snapshot **1X2 + BTTS**, summed by *selection identity* `(market, fixture_id)`, not distinct fixture count.
3. Statistics > 1X2: original 1X2 UI/formula/ledger preserved, including statistics histories/selection.
4. Statistics > BTTS: exactly same chart/KPI/list styling and period controls as Statistics 1X2; independent published BTTS picks, and TEST-only pre-price screening section labelled `SCREENING ONLY` and separated from issuance ledger.

## Visual system (reuse current, do not clone)
- **Reuse current** `b46pm-performance`/`b46pm-performance-chart`/`b46pm-stats-grid` and `b46pm-list` classes across Total/1X2/BTTS; do not add independent tab or chart code paths.
- Membership banner, sidebar, mobile menu, emerald/forest palette, typography, borders, status tones, scroll retention, tabs and active states remain as originally shipped.
- Existing clean responsive BTTS screening cards: desktop 1440 two columns, laptop/mobile single column, league/time row, HOME–VS–AWAY, metrics, Bet365 status bottom, `SCREENING ONLY` disclaimer. This is research metadata, **not** the Predictions publication style.
- 1X2 prediction rows already use native Live Score DOM mirror where available. **Do not disable** or replace it. When one fixture has two issued markets, attach separate labelled market selection entries to **one match card** rather than emitting a duplicate fixture row.
- Market lines must distinguish `1X2` picks (HOME/DRAW/AWAY) from `BTTS` (YES/NO), show frozen decimal odds if recorded and independent status (PENDING/WIN/LOSS/PUSH). No fabricated Bet365 quote. Do not display historical screening probabilities as published picks.
- On PC/mobile no overlapping text, no 25px metrics inherited from Live Score, no layout jumps when switching graph filters or navigating tabs, no candidate cards leaking into 1X2/Total/Predictions.
- Empty BTTS statistics show dashes/neutral placeholders, not fake 0% WIN RATE / 0 P/L / fabricated daily line.

## Single factual ledger and snapshot source
- `test_pick_1x2` and `test_pick_btts` distinct immutable-source ledgers; composite identity `(market, fixture_id)`.
- `combinedPrematchLedgers` returns chronological issued rows; `b46_pre_market_snapshot_test` contains 1X2/BTTS/TOTAL and `b46_pre_daily_snapshot_test` stores London 06:00 daily books.
- `TOTAL = 1X2 + BTTS` for each count and units, not average of two Win Rates.
- WIN RATE = WIN/(WIN+LOSS), excluding PUSH. P/L sums frozen-odds profit units on FT settlement only. `pending` is a prediction record but not Win Rate/P/L. Historical daily ROI denominator is *settled 1-unit selections*, read from Snapshot field `settled` (not guessed from absent `stakedUnits`).
- Snapshot 30D/90D/ALL; no full-history recomputation on page render. No calls to paid 5USD on UI load.
- BTTS screening (24 probability-pass candidates as last observed) stays separate from issued picks (0). Screening counts and fixtures are time sensitive and must not be added into Total.

## Actual baseline audit, zero paid calls
[Four-view contract](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45000967457): active front-end `356bc889-210c-42c9-9f3f-a0fb07ff517e`, backend `ac0338f3-9e32-453e-92ef-e3c70976f874`.
At audit: 1X2 76 (WIN 11/LOSS 7/PENDING 58), BTTS ledger 0, TOTAL 76; all three snapshots reconcile; 24 pre-price candidates, 21 waiting Bet365, 3 market not offered.
Confirmed UI bugs to correct in existing view code before stage 4: Total graph subtitle incorrectly says `Pre-Match · 1X2`; BTTS/TOTAL daily ROI accumulator reads missing `stakedUnits` rather than persisted daily `settled`, so it can show an inaccurate/missing ROI chart. These are **display-only**, not to be solved by rewriting settlement or providers.

## Execution gates
1. Design contract above, source & current active code inspected.
2. Repair shared BTTS/Total performance title, snapshot ROI visual path; verify 1X2 unchanged.
3. Verify Total snapshots/current UI exactly equal sum of independent markets, Today and All-time/graph; do not duplicate calculation code.
4. Group issued picks in Predictions for same fixture; preserve independent market status/odds and existing native 1X2 Live Mirror.
5. Real Chromium PC 1440, laptop 1024, mobile 390/320; route switching, no overlap and JS errors; assert cross-market fixture grouping using **pure mock DOM/unit tests** because 0 real issued BTTS picks exist. Never invent actual BTTS odds/picks to fill the production-like page. Deployment only to TEST, guarded Cloudflare exact version.
6. If any required invariant fails, **stop** and report; do not force new deploy or move to Production.

No unauthorized new 5USD requests, no changes to BTTS Bulk V2 five-round schedule, 1X2 bot, Live or Production.
