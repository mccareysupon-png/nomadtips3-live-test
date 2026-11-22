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

## 22 Nov 2026 — Implementation closeout: STAGES 1–5 PASSED ON TEST

### 1. Design contract
This file captures the same-theme UI and ledger/snapshot contract. Existing `b46pm-performance`, graph, badges and nav routes were reused; no parallel calculation pipeline, new page or second stats ledger was introduced. Baseline [run 45000967457](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45000967457), 0 provider calls.

### 2–3. Correct existing BTTS/Total statistics presentation
[Deploy+QA 45001224623](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45001224623) **PASSED**, frontend `356bc889-210c-42c9-9f3f-a0fb07ff517e` -> `af75c39d-bcfa-4877-b3b9-71568c7e2a93`. Reused the same Performance graph. Fixed:
- Total title now explicitly `Pre-Match · Total (1X2 + BTTS)` rather than mislabeling 1X2.
- BTTS and TOTAL graph ROI uses each persisted daily snapshot row's `settled` count as one-unit stake denominator when `stakedUnits` absent, rather than silently dividing by 0.
- BTTS empty history keeps unissued 0%/ROI/P&L unrendered. 1X2 Receiver path, original ledger and backend unchanged.
- All snapshot invariants verified: TOTAL = 1X2 + BTTS.

### 4. Pre-Match Predictions: one fixture, multiple issued markets
[Pure grouping QA 45001831338](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45001831338) **PASSED**.
[Guarded deploy 45001923495](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45001923495) **PASSED**, active TEST UI version `1af0070a-a112-4ef4-add3-cfc1251a0291`.
- Native `window.B46PreMatchLiveMirror.render` remains the primary 1X2 card renderer in Predictions.
- If BTTS and 1X2 are both **actually issued** for the same `fixture_id`, the page renders ONE match card with TWO distinct `1X2`/ `BTTS` selection lines (frozen odds, market pick, independent status). The league header count uses distinct fixtures, while Total continues counting two market-ledger records.
- For BTTS-only issued picks, use a responsive dedicated card with BTTS YES/NO labels; **screening-only** candidates remain on Statistics > BTTS and are never displayed as issued Predictions or in Total.
- No new 5USD request, no backend writes, no changes to Live/1X2 model/HCR/Production.

### 5. Real browser QA, 4 sizes and mock cross-market
[Four-view final QA 45002189777](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45002189777) **PASSED**; screenshots in workflow artifacts.
- PC 1440×900, laptop 1024×768, mobile 390×844 and 320×700: four routes `1x2`, `btts`, `all`, `predictions` render; correct graph headings; zero horizontal overflow; original 1X2 native mirror 76 cards, Predictions 76 unique fixture cards, BTTS screening 24 cards; no backend/provider calls.
- The first UI smoke [45002056350](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45002056350) had a premature mobile assertion (BTTS async fetch not yet completed); the **corrected QA** waits for actual candidate cards and passes. No Worker code was changed for that false-negative test.
- Real BTTS issued pick ledger currently **0**, so 1X2+BTTS dual issuance tested in an **isolated Playwright in-memory network mock**, not in persistent backend: both PC and mobile showed ONE fixture card containing two market lines `1X2 X · Draw @3.60 WIN` and `BTTS YES @1.85 PENDING`, preserving the Native Mirror with no overflow. These values were **synthetic QA-only** and never sourced from 5USD or published.
- Last real snapshots: 1X2 76 (WIN 11, LOSS 7, PENDING 58, +10.16U), BTTS 0, TOTAL 76 (18 settled), WIN RATE 61.11%. Upstream BTTS screening 24 probability-pass (21 WAITING_PRICE, 3 NOT_OFFERED), not counted as picks.

### Final 1X2 Receiver provenance check
[Run 45002447892](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45002447892) **PASS**. The 1X2 PreMatch Receiver chart uses distinct graph routing but in fact reconciles exactly to the same 1X2 immutable PreMatch ledger and Snapshot: Receiver settled 18, WIN 11, LOSS 7, PUSH 0, P/L +10.16U, 1-unit stake 18, ROI 56.44%. Thus no unauthorized replacement of the existing Receiver was required. The total/BTTS graph reads the Snapshot, 1X2 original graph remains intact and currently consistent.

### Final URLs
- Pre-Match Predictions: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=predictions`
- Statistics Total: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=all`
- Statistics 1X2: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=1x2`
- Statistics BTTS: `https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/?b46pm=btts`

**STATUS: ALL FIVE STAGES DONE IN TEST; NOT DEPLOYED TO PRODUCTION.** The original BTTS Bulk V2 remains active independently in its isolated TEST Worker, max 5 rounds/day with 2-hour offset, and has not been altered by this UI project. No paid provider API calls from this UI rollout.

### Remaining functional dependency, not an UI blocker
Real qualified BTTS pick must first have valid real pre-match Bet365 YES+NO odds, Edge >=5%, EV >=5%, Probability >=60%, and per-team history >=3. At closeout there are zero issued BTTS picks; do not deploy a fake pick for demonstration. As real picks arrive, they will automatically flow through the existing independent BTTS ledger to Predictions + BTTS Statistics + Total.
